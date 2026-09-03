// ============================================================
// WHOOP sync service — fetches and stores WHOOP data
// WHOOP API v2 endpoints.
// ============================================================

import type { WhoopRecovery, WhoopSleep } from "../types";

const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";

// ── Token refresh ────────────────────────────────────────────

export async function refreshWhoopToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      scope: "offline",
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`WHOOP token refresh failed: ${res.status} ${details}`);
  }
  return res.json();
}

// ── Fetch recoveries ─────────────────────────────────────────

export async function fetchWhoopRecoveries(
  accessToken: string,
  userId: string,
  start: Date,
  end: Date
): Promise<WhoopRecovery[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: "25",
  });

  const res = await fetch(
    `${WHOOP_API_BASE}/recovery?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error(`WHOOP recoveries fetch failed: ${res.status}`);
  const data = await res.json();

  // Map WHOOP API response → our schema shape
  return (data.records ?? []).map((r: any) => ({
    id: undefined,
    user_id: userId,
    cycle_id: String(r.cycle_id),
    score: r.score?.recovery_score ?? null,
    hrv_rmssd: r.score?.hrv_rmssd_milli ?? null,
    resting_hr: r.score?.resting_heart_rate ?? null,
    skin_temp: r.score?.skin_temp_celsius ?? null,
    spo2: r.score?.spo2_percentage ?? null,
    source_created_at: r.created_at,
    raw_json: r,
  }));
}

// ── Fetch sleep ──────────────────────────────────────────────

export async function fetchWhoopSleep(
  accessToken: string,
  userId: string,
  start: Date,
  end: Date
): Promise<WhoopSleep[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: "25",
  });

  const res = await fetch(
    `${WHOOP_API_BASE}/activity/sleep?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error(`WHOOP sleep fetch failed: ${res.status}`);
  const data = await res.json();

  return (data.records ?? []).map((s: any) => ({
    id: undefined,
    user_id: userId,
    sleep_id: String(s.id),
    start_time: s.start,
    end_time: s.end,
    sleep_seconds: Math.round(
      (s.score?.stage_summary?.total_in_bed_time_milli ?? 0) / 1000 -
      (s.score?.stage_summary?.total_awake_time_milli ?? 0) / 1000
    ),
    sleep_efficiency: (s.score?.sleep_efficiency_percentage ?? 0) / 100,
    sleep_performance_pct: s.score?.sleep_performance_percentage ?? 0,
    raw_json: s,
  }));
}
