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
  const syncEnd = new Date();
  const syncStart = new Date(syncEnd.getTime() - 45 * 24 * 60 * 60 * 1000);
  const results: string[] = [];

  // ── WHOOP sync ───────────────────────────────────────────────
  if (!provider || provider === "whoop") {
    const { data: conn, error: connectionError } = await serviceClient
      .from("oauth_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "whoop")
      .maybeSingle();

    if (conn && (conn.status === "connected" || conn.status === "sync_error") && conn.access_token_encrypted) {
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

        const [recoveries, sleepRecords] = await Promise.all([
          fetchWhoopRecoveries(token, user.id, syncStart, syncEnd),
          fetchWhoopSleep(token, user.id, syncStart, syncEnd),
        ]);
        if (recoveries.length > 0) {
          const recoveryRows = [...new Map(recoveries.map((row) => [row.cycle_id, row])).values()];
          const { error } = await serviceClient
            .from("whoop_recoveries")
            .upsert(recoveryRows, { onConflict: "user_id,cycle_id" });
          if (error) throw new Error(`WHOOP recovery save failed: ${error.message}`);
        }

        if (sleepRecords.length > 0) {
          const sleepRows = [...new Map(sleepRecords.map((row) => [row.sleep_id, row])).values()];
          const { error } = await serviceClient
            .from("whoop_sleep")
            .upsert(sleepRows, { onConflict: "user_id,sleep_id" });
          if (error) throw new Error(`WHOOP sleep save failed: ${error.message}`);
        }

        const { error: statusError } = await serviceClient
          .from("oauth_connections")
          .update({ last_synced_at: new Date().toISOString(), status: "connected" })
          .eq("id", conn.id);
        if (statusError) throw new Error(`Could not save sync status: ${statusError.message}`);

        results.push(
          `WHOOP: synced ${recoveries.length} recoveries, ${sleepRecords.length} sleep records`
        );
      } catch (err) {
        console.error("[sync] WHOOP sync error:", err);
        const tokenFailure =
          err instanceof Error &&
          (/token refresh failed:.*(?:400|401|no renewable refresh token)/.test(err.message) ||
            err.message.includes("fetch failed: 401"));
        await serviceClient
          .from("oauth_connections")
          .update({ status: tokenFailure ? "token_expired" : "sync_error" })
          .eq("id", conn.id);
        results.push(tokenFailure ? "WHOOP: authorization expired — reconnect required" : "WHOOP: sync failed");
      }
    } else {
      results.push(connectionError ? "WHOOP: could not read connection" :
        conn?.status === "token_expired" ? "WHOOP: reconnect required" : "WHOOP: not connected");
    }
  }

  // ── Strava sync ──────────────────────────────────────────────
  if (!provider || provider === "strava") {
    const { data: conn, error: connectionError } = await serviceClient
      .from("oauth_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "strava")
      .maybeSingle();

    if (conn && (conn.status === "connected" || conn.status === "sync_error") && conn.access_token_encrypted) {
      try {
        let token = conn.access_token_encrypted;

        if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
          const refreshed = await refreshStravaToken(conn.refresh_token_encrypted);
          token = refreshed.access_token;
          const { error: refreshSaveError } = await serviceClient
            .from("oauth_connections")
            .update({
              access_token_encrypted: refreshed.access_token,
              refresh_token_encrypted: refreshed.refresh_token,
              expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
            })
            .eq("id", conn.id);
          if (refreshSaveError) {
            throw new Error(`Strava refreshed token could not be saved: ${refreshSaveError.message}`);
          }
        }

        const activities = await fetchStravaActivities(token, user.id, syncStart, syncEnd);
        for (let offset = 0; offset < activities.length; offset += 200) {
          const { error } = await serviceClient
            .from("strava_activities")
            .upsert(activities.slice(offset, offset + 200), { onConflict: "user_id,strava_activity_id" });
          if (error) throw new Error(`Strava activity save failed: ${error.message}`);
        }

        const { error: statusError } = await serviceClient
          .from("oauth_connections")
          .update({ last_synced_at: new Date().toISOString(), status: "connected" })
          .eq("id", conn.id);
        if (statusError) throw new Error(`Could not save sync status: ${statusError.message}`);

        results.push(`Strava: synced ${activities.length} activities`);
      } catch (err) {
        console.error("[sync] Strava sync error:", err);
        const tokenFailure = err instanceof Error &&
          /token refresh failed: (400|401)|fetch failed: 401/.test(err.message);
        await serviceClient
          .from("oauth_connections")
          .update({ status: tokenFailure ? "token_expired" : "sync_error" })
          .eq("id", conn.id);
        results.push(tokenFailure ? "Strava: reconnect required" : "Strava: sync failed");
      }
    } else {
      results.push(connectionError ? "Strava: could not read connection" :
        conn?.status === "token_expired" ? "Strava: reconnect required" : "Strava: not connected");
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
