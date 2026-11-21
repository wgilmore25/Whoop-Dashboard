import { strict as assert } from "node:assert";
import { mockTodayMetrics } from "@/lib/mock-data";
import { buildRecommendation } from "@/lib/recommendations/engine";
import { readinessInputGaps, syncFreshness } from "@/lib/sync/freshness";
import { isUsableOvernightSleep, normalizeDailyMetrics } from "@/lib/sync/normalization";
import { fetchStravaActivities } from "@/lib/sync/strava";
import { fetchWhoopRecoveries, fetchWhoopSleep } from "@/lib/sync/whoop";
import type { WhoopRecovery, WhoopSleep } from "@/lib/types";

const now = new Date("2026-03-24T17:00:00Z");
const start = new Date("2026-02-09T17:00:00Z");
const fresh = { status: "connected", last_synced_at: "2026-03-24T16:00:00Z" } as const;

function mockPages(...pages: Array<object | number>) {
  const original = globalThis.fetch;
  const urls: URL[] = [];
  globalThis.fetch = async (input) => {
    urls.push(new URL(String(input)));
    const page = pages.shift();
    assert.ok(page, "unexpected extra provider request");
    return typeof page === "number" ? new Response(null, { status: page }) : Response.json(page);
  };
  return { urls, restore: () => { globalThis.fetch = original; } };
}

test("WHOOP recovery and sleep both follow the next cursor", async () => {
  const api = mockPages(
    { records: [{ cycle_id: 2, created_at: now.toISOString() }], next_token: "second-recovery" },
    { records: [{ cycle_id: 1, created_at: start.toISOString(), score: { recovery_score: 75 } }] },
    { records: [{ id: "nap", start, end: now, nap: true }], next_token: "second-sleep" },
    { records: [{ id: "overnight", start, end: now, score_state: "SCORED", score: { stage_summary: {
      total_in_bed_time_milli: 30_000_000, total_awake_time_milli: 1_000_000, total_no_data_time_milli: 200_000,
    } } }] },
  );
  try {
    const recovery = await fetchWhoopRecoveries("token", "user", start, now);
    assert.deepEqual(recovery.map((row) => row.score), [null, 75]);
    const sleep = await fetchWhoopSleep("token", "user", start, now);
    assert.deepEqual(sleep.filter(isUsableOvernightSleep).map((row) => row.sleep_seconds), [28_800]);
    assert.deepEqual(api.urls.map((url) => url.searchParams.get("nextToken")), [null, "second-recovery", null, "second-sleep"]);
  } finally {
    api.restore();
  }
});

test("WHOOP rejects a repeated cursor and a failed later page", async () => {
  const api = mockPages({ records: [], next_token: "repeat" }, { records: [], next_token: "repeat" },
    { records: [], next_token: "page2" }, 503);
  try {
    await assert.rejects(fetchWhoopSleep("token", "user", start, now), /repeated a cursor/);
    await assert.rejects(fetchWhoopRecoveries("token", "user", start, now), /503/);
  } finally {
    api.restore();
  }
});

test("Strava reads through short pages, deduplicates overlaps and preserves large IDs", async () => {
  const api = mockPages(
    [{ id: 20, name: "Old" }, { id: 42 }],
    [{ id: 20, name: "Updated" }, { id: 9_007_199_254_740_992, id_str: "9007199254740993" }],
    [{ id: 43 }],
    [],
  );
  try {
    const records = await fetchStravaActivities("token", "user", start, now);
    assert.deepEqual(api.urls.map((url) => url.searchParams.get("page")), ["1", "2", "3", "4"]);
    assert.deepEqual(records.map((row) => row.strava_activity_id), ["20", "42", "9007199254740993", "43"]);
    assert.equal(records[0].name, "Updated");
    assert.equal(new Set(api.urls.map((url) => url.searchParams.get("before"))).size, 1);
  } finally {
    api.restore();
  }
});

test("Strava rejects unsafe numeric identifiers instead of persisting a rounded ID", async () => {
  const api = mockPages([{ id: 9_007_199_254_740_992 }]);
  try {
    await assert.rejects(fetchStravaActivities("token", "user", start, now), /lossless identifier/);
  } finally {
    api.restore();
  }
});

test("daily normalization excludes unscored sleep and naps, including legacy wrapped records", () => {
  const sleep = (id: string, hour: number, seconds: number, raw_json?: unknown): WhoopSleep => ({
    id, user_id: "user", sleep_id: id, start_time: "2026-03-24T01:00:00Z",
    end_time: `2026-03-24T${hour}:00:00Z`, sleep_seconds: seconds, sleep_efficiency: 0.9,
    sleep_performance_pct: 90, raw_json,
  });
  const recovery: WhoopRecovery = { id: "r", user_id: "user", cycle_id: "r", score: 91,
    hrv_rmssd: 45, resting_hr: 53, source_created_at: now.toISOString() };
  const normalized = normalizeDailyMetrics({
    userId: "user", targetDate: now, recoveries: [recovery], activities: [],
    sleepRecords: [
      sleep("unscored", 10, 32_400, { score_state: "PENDING_SCORE" }),
      sleep("nap", 11, 3_600, { raw_json: { nap: true } }),
      sleep("overnight", 12, 25_200),
    ],
  });
  assert.equal(normalized.sleep_hours, 7);
  assert.equal(normalized.recovery_score, 91);
});

test("freshness distinguishes absent, stale, failed and current provider syncs", () => {
  assert.equal(syncFreshness(undefined, now), "disconnected");
  assert.equal(syncFreshness({ status: "connected" }, now), "missing");
  assert.equal(syncFreshness({ status: "connected", last_synced_at: "2026-03-23T17:00:00Z" }, now), "stale");
  assert.equal(syncFreshness({ ...fresh, status: "sync_error" }, now), "sync_error");
  assert.equal(syncFreshness(fresh, now), "fresh");
  const today = { date: "2026-03-24", recovery_score: 90, sleep_hours: 8 };
  assert.deepEqual(readinessInputGaps(today, { whoop: fresh, strava: fresh }, now), []);
  assert.deepEqual(readinessInputGaps({ ...today, date: "2026-03-23" }, { whoop: fresh, strava: fresh }, now),
    ["Today's metrics are unavailable"]);
  assert.deepEqual(readinessInputGaps({ ...today, sleep_hours: 0 }, { whoop: fresh }, now),
    ["Today's WHOOP sleep is missing", "Strava has no current successful sync"]);
});

test("missing or stale data blocks a hard session even when stored readings look strong", () => {
  const decision = buildRecommendation({
    metrics: { ...mockTodayMetrics, recovery_score: 93, sleep_vs_baseline_pct: 8, hrv_vs_baseline_pct: 0, resting_hr_vs_baseline_pct: 0, load_7d_vs_baseline_pct: 4 },
    baseline: { valid_days: 25, recovery_median: 65, load_7d_median: 3_400 },
    checkIn: {
      user_id: "user", date: "2026-03-24", fatigue: 1, soreness: 1, stress: 1, motivation: 4,
      planned_session: "high_intensity", illness_symptoms: false, pain_or_injury: false, travel_or_jet_lag: false,
    },
    inputGaps: ["Strava has no current successful sync"],
  });
  assert.equal(decision.recommended_session, "recovery");
  assert.equal(decision.strength_allowed, false);
  assert.equal(decision.confidence, 0.35);
  assert.ok(decision.why.includes("Strava has no current successful sync"));
});
