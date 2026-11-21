// ============================================================
// Strava sync service — fetches and stores Strava activities
// TODO: Register your app at https://www.strava.com/settings/api
//       and fill in STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET
// ============================================================

import type { StravaActivity } from "../types";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

interface ActivityRecord {
  id?: number | string;
  id_str?: string;
  start_date: string;
  type: string;
  name: string;
  moving_time: number;
  elapsed_time: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  trainer?: boolean;
  commute?: boolean;
}

function activityId(activity: ActivityRecord): string {
  const id = activity.id_str ?? activity.id;
  if (typeof id === "string" && /^\d+$/.test(id)) return id;
  if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
  throw new Error("Strava activity is missing a lossless identifier");
}

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
  before = new Date(),
): Promise<Omit<StravaActivity, "id">[]> {
  const params = new URLSearchParams({
    after: String(Math.floor(after.getTime() / 1000)),
    before: String(Math.ceil(before.getTime() / 1000)),
    per_page: "100",
  });
  const activities = new Map<string, ActivityRecord>();

  for (let page = 1; ; page += 1) {
    params.set("page", String(page));
    const response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Strava activities fetch failed: ${response.status}`);
    const records = await response.json() as ActivityRecord[];
    if (!Array.isArray(records)) throw new Error("Strava response is missing activities");
    if (records.length === 0) break;
    const previousCount = activities.size;
    for (const activity of records) activities.set(activityId(activity), activity);
    if (activities.size === previousCount) throw new Error("Strava pagination returned no new activities");
  }

  return [...activities].map(([id, a]) => ({
    user_id: userId,
    strava_activity_id: id,
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
