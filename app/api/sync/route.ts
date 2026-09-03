// POST /api/sync — pulls fresh data from WHOOP and/or Strava, then triggers
// recommendation computation so the dashboard updates immediately.
//
// Body (optional): { provider: 'whoop' | 'strava' }
// Omit provider to sync both.
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchWhoopRecoveries, fetchWhoopSleep, refreshWhoopToken } from "@/lib/sync/whoop";
import { fetchStravaActivities, refreshStravaToken } from "@/lib/sync/strava";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const provider: "whoop" | "strava" | undefined = body.provider;

  const serviceClient = createServiceClient();
  const syncStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days back
  const results: string[] = [];

  // ── WHOOP sync ───────────────────────────────────────────────
  if (!provider || provider === "whoop") {
    const { data: conn } = await serviceClient
      .from("oauth_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "whoop")
      .single();

    if (conn?.status === "connected" && conn.access_token_encrypted) {
      try {
        let token = conn.access_token_encrypted;

        // Refresh if expired
        // Refresh five minutes early to avoid expiring during a multi-request sync.
        if (conn.expires_at && new Date(conn.expires_at).getTime() <= Date.now() + 5 * 60 * 1000) {
          if (!conn.refresh_token_encrypted) {
            throw new Error("WHOOP token refresh failed: no renewable refresh token stored");
          }
          const refreshed = await refreshWhoopToken(conn.refresh_token_encrypted);
          token = refreshed.access_token;
          const { error: refreshSaveError } = await serviceClient
            .from("oauth_connections")
            .update({
              access_token_encrypted: refreshed.access_token,
              refresh_token_encrypted: refreshed.refresh_token ?? conn.refresh_token_encrypted,
              expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            })
            .eq("id", conn.id);
          if (refreshSaveError) {
            throw new Error(`WHOOP refreshed token could not be saved: ${refreshSaveError.message}`);
          }
        }

        const recoveries = await fetchWhoopRecoveries(token, user.id, syncStart, new Date());
        if (recoveries.length > 0) {
          const recoveryRows = recoveries.map(({ id: _id, ...r }) => ({
            ...r,
            raw_json: r,
          }));
          const { error } = await serviceClient
            .from("whoop_recoveries")
            .upsert(recoveryRows, { onConflict: "user_id,cycle_id" });
          if (error) throw new Error(`WHOOP recovery save failed: ${error.message}`);
        }

        const sleepRecords = await fetchWhoopSleep(token, user.id, syncStart, new Date());
        if (sleepRecords.length > 0) {
          const sleepRows = sleepRecords.map(({ id: _id, ...s }) => ({
            ...s,
            raw_json: s,
          }));
          const { error } = await serviceClient
            .from("whoop_sleep")
            .upsert(sleepRows, { onConflict: "user_id,sleep_id" });
          if (error) throw new Error(`WHOOP sleep save failed: ${error.message}`);
        }

        await serviceClient
          .from("oauth_connections")
          .update({ last_synced_at: new Date().toISOString(), status: "connected" })
          .eq("id", conn.id);

        results.push(
          `WHOOP: synced ${recoveries.length} recoveries, ${sleepRecords.length} sleep records`
        );
      } catch (err) {
        console.error("[sync] WHOOP sync error:", err);
        const tokenFailure =
          err instanceof Error &&
          (err.message.includes("token refresh failed") ||
            err.message.includes("fetch failed: 401"));
        await serviceClient
          .from("oauth_connections")
          .update({ status: tokenFailure ? "token_expired" : "sync_error" })
          .eq("id", conn.id);
        results.push(tokenFailure ? "WHOOP: authorization expired — reconnect required" : "WHOOP: sync failed");
      }
    } else {
      results.push("WHOOP: not connected");
    }
  }

  // ── Strava sync ──────────────────────────────────────────────
  if (!provider || provider === "strava") {
    const { data: conn } = await serviceClient
      .from("oauth_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "strava")
      .single();

    if (conn?.status === "connected" && conn.access_token_encrypted) {
      try {
        let token = conn.access_token_encrypted;

        if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
          const refreshed = await refreshStravaToken(conn.refresh_token_encrypted);
          token = refreshed.access_token;
          await serviceClient
            .from("oauth_connections")
            .update({
              access_token_encrypted: refreshed.access_token,
              refresh_token_encrypted: refreshed.refresh_token,
              expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
            })
            .eq("id", conn.id);
        }

        const activities = await fetchStravaActivities(token, user.id, syncStart);
        if (activities.length > 0) {
          const activityRows = activities.map(({ id: _id, ...a }) => ({
            ...a,
            raw_json: a.raw_json ?? a,
          }));
          const { error } = await serviceClient
            .from("strava_activities")
            .upsert(activityRows, { onConflict: "user_id,strava_activity_id" });
          if (error) throw new Error(`Strava activity save failed: ${error.message}`);
        }

        await serviceClient
          .from("oauth_connections")
          .update({ last_synced_at: new Date().toISOString(), status: "connected" })
          .eq("id", conn.id);

        results.push(`Strava: synced ${activities.length} activities`);
      } catch (err) {
        console.error("[sync] Strava sync error:", err);
        await serviceClient
          .from("oauth_connections")
          .update({ status: "sync_error" })
          .eq("id", conn.id);
        results.push("Strava: sync failed");
      }
    } else {
      results.push("Strava: not connected");
    }
  }

  // ── Trigger recommendation computation ───────────────────────
  // Runs normalization + rules engine + stores results so the dashboard
  // reflects today's synced data without requiring a separate API call.
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  try {
    const recRes = await fetch(`${baseUrl}/api/recommendation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward session cookie so /api/recommendation can identify the user
        Cookie: request.headers.get("cookie") ?? "",
      },
    });
    if (recRes.ok) {
      results.push("Recommendation updated");
    } else {
      results.push(`Recommendation: engine returned ${recRes.status}`);
    }
  } catch (err) {
    // Non-fatal — raw data is still saved; user can retry
    console.warn("[sync] Could not trigger recommendation after sync:", err);
    results.push("Recommendation: engine unavailable (sync data saved)");
  }

  return NextResponse.json({ message: results.join(" | "), results });
}
