// ============================================================
// Strava sync service — fetches and stores Strava activities
// TODO: Register your app at https://www.strava.com/settings/api
//       and fill in STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET
// ============================================================

import type { StravaActivity } from "../types";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// ── Token refresh ────────────────────────────────────────────

export async function refreshStravaToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
}> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }
  return res.json();
}

// ── Fetch activities ─────────────────────────────────────────

export async function fetchStravaActivities(
  accessToken: string,
  userId: string,
  after: Date,
  perPage = 50
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    after: String(Math.floor(after.getTime() / 1000)), // Unix timestamp
    per_page: String(perPage),
  });

  const res = await fetch(
    `${STRAVA_API_BASE}/athlete/activities?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error(`Strava activities fetch failed: ${res.status}`);
  const data: any[] = await res.json();

  return data.map((a) => ({
    id: undefined as any,
    user_id: userId,
    strava_activity_id: String(a.id),
    start_date: a.start_date,
    type: a.type,
    name: a.name,
    moving_time: a.moving_time,
    elapsed_time: a.elapsed_time,
    distance_m: a.distance ?? null,
    elevation_gain_m: a.total_elevation_gain ?? null,
    average_hr: a.average_heartrate ?? null,
    max_hr: a.max_heartrate ?? null,
    average_watts: a.average_watts ?? null,
    weighted_avg_watts: a.weighted_average_watts ?? null,
    kilojoules: a.kilojoules ?? null,
    trainer: a.trainer ?? null,
    commute: a.commute ?? null,
    raw_json: a,
  }));
}
