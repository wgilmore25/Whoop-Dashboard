// ============================================================
// WHOOP sync service — fetches and stores WHOOP data
// WHOOP API v2 endpoints.
// ============================================================

import type { WhoopRecovery, WhoopSleep } from "../types";

interface RecoveryRecord {
  cycle_id: number;
  created_at: string;
  score?: {
    recovery_score?: number;
    hrv_rmssd_milli?: number;
    resting_heart_rate?: number;
    skin_temp_celsius?: number;
    spo2_percentage?: number;
  } | null;
}

interface SleepRecord {
  id: string;
  start: string;
  end: string;
  nap?: boolean;
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_no_data_time_milli?: number;
    };
    sleep_efficiency_percentage?: number;
    sleep_performance_percentage?: number;
  } | null;
}

async function fetchCollection<T>(
  path: string,
  name: string,
  accessToken: string,
  start: Date,
  end: Date,
): Promise<T[]> {
  const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), limit: "25" });
  const records: T[] = [];
  const seenTokens = new Set<string>();

  while (true) {
    const response = await fetch(`${WHOOP_API_BASE}/${path}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`WHOOP ${name} fetch failed: ${response.status}`);
    const data = await response.json() as { records: T[]; next_token?: string | null };
    if (!Array.isArray(data.records)) throw new Error(`WHOOP ${name} response is missing records`);
    records.push(...data.records);
    if (!data.next_token) return records;
    if (seenTokens.has(data.next_token)) throw new Error(`WHOOP ${name} pagination repeated a cursor`);
    seenTokens.add(data.next_token);
    params.set("nextToken", data.next_token);
  }
}

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
): Promise<Omit<WhoopRecovery, "id">[]> {
  const records = await fetchCollection<RecoveryRecord>("recovery", "recoveries", accessToken, start, end);
  return records.map((r) => ({
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
): Promise<Omit<WhoopSleep, "id">[]> {
  const records = await fetchCollection<SleepRecord>("activity/sleep", "sleep", accessToken, start, end);
  return records.map((s) => ({
    user_id: userId,
    sleep_id: String(s.id),
    start_time: s.start,
    end_time: s.end,
    sleep_seconds: Math.round(
      (s.score?.stage_summary?.total_in_bed_time_milli ?? 0) / 1000 -
      (s.score?.stage_summary?.total_awake_time_milli ?? 0) / 1000 -
      (s.score?.stage_summary?.total_no_data_time_milli ?? 0) / 1000
    ),
    sleep_efficiency: (s.score?.sleep_efficiency_percentage ?? 0) / 100,
    sleep_performance_pct: s.score?.sleep_performance_percentage ?? 0,
    raw_json: s,
  }));
}
