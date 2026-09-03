// ============================================================
// Data normalization — builds daily_metrics rows from raw source data
// ============================================================

import type {
  WhoopRecovery,
  WhoopSleep,
  StravaActivity,
  DailyMetrics,
  HrvTrend,
  MetricConfidence,
} from "../types";

// ── Config defaults (overridable from user_settings) ─────────
const DEFAULT_HIIT_HR_THRESHOLD = 165; // bpm — sessions above this count as HIIT
const DEFAULT_LONG_SESSION_MINUTES = 75; // sessions longer than this count as "long"
const BASELINE_WINDOW_DAYS = 14; // rolling window for baselines
// Minimum number of historical records required before a baseline percentage is
// considered meaningful. Below this threshold we return null rather than a
// percentage derived from too few samples.
const BASELINE_MIN_SAMPLES = 5;

// EWMA smoothing factor — α=0.25 is equivalent to a ~7-period weighted window.
// Higher α weights recent data more heavily; lower α produces a smoother baseline.
const EWMA_ALPHA = 0.25;

function sleepDisturbanceCount(sleep: WhoopSleep): number {
  const record = sleep as WhoopSleep & { raw_json?: Record<string, unknown> };
  const raw = (record.raw_json?.raw_json ?? record.raw_json) as Record<string, unknown> | undefined;
  const stages = (raw?.score as Record<string, unknown> | undefined)?.stage_summary as Record<string, unknown> | undefined;
  const count = stages?.disturbance_count;
  return typeof count === "number" && count >= 0 ? count : 0;
}

function rawSleepRecord(sleep: WhoopSleep): Record<string, unknown> | undefined {
  const record = sleep as WhoopSleep & { raw_json?: Record<string, unknown> };
  return (record.raw_json?.raw_json ?? record.raw_json) as Record<string, unknown> | undefined;
}

/** Total awake time (WASO) is more meaningful than a simple wake count. */
export function sleepAwakeMinutes(sleep: WhoopSleep): number | null {
  const stages = (rawSleepRecord(sleep)?.score as Record<string, unknown> | undefined)
    ?.stage_summary as Record<string, unknown> | undefined;
  const milliseconds = stages?.total_awake_time_milli;
  return typeof milliseconds === "number" && milliseconds >= 0
    ? milliseconds / 60_000
    : null;
}

/**
 * Standard WHOOP records reliably include total awake time, but not necessarily
 * a per-awakening timeline. Return null rather than invent a longest wake.
 */
export function sleepLongestAwakeMinutes(sleep: WhoopSleep): number | null {
  const raw = rawSleepRecord(sleep);
  const score = raw?.score as Record<string, unknown> | undefined;
  const stages = score?.stage_summary as Record<string, unknown> | undefined;
  const candidates = [raw?.longest_awake_time_milli, score?.longest_awake_time_milli, stages?.longest_awake_time_milli];
  const milliseconds = candidates.find((value): value is number => typeof value === "number" && value >= 0);
  return milliseconds == null ? null : milliseconds / 60_000;
}

/**
 * Sleep quality (0–10): total awake time is weighted more strongly than the
 * number of brief disturbances. Longest awake episode is used only when the
 * source actually provides it; otherwise the score remains explicitly partial.
 */
export function computeSleepQualityScore(
  hours: number,
  efficiency: number | null,
  awakeMinutes: number | null,
  longestAwakeMinutes: number | null,
  disturbances: number,
): number {
  // Provisional eight-hour reference until individual sleep need is collected.
  const durationScore = Math.min(hours / 8, 1) * 3.5;
  const efficiencyScore = Math.max(0, Math.min(efficiency ?? 0, 1)) * 2;
  const awakeBurdenScore = awakeMinutes == null ? 1.25 : Math.max(0, 2.5 * (1 - awakeMinutes / 90));
  const longestWakeScore = longestAwakeMinutes == null ? 0.75 : Math.max(0, 1.5 * (1 - longestAwakeMinutes / 45));
  const fragmentationScore = Math.max(0, 0.5 - disturbances * 0.1);
  return Math.round((durationScore + efficiencyScore + awakeBurdenScore + longestWakeScore + fragmentationScore) * 10) / 10;
}

// ── Load proxy ───────────────────────────────────────────────
/**
 * Estimates training load (in kJ-equivalent units) for a single activity.
 * Priority:
 *   1. kilojoules (direct power meter data)
 *   2. weighted_avg_watts × moving_time (power × duration)
 *   3. average_hr × duration proxy (HR-based estimate)
 *   4. duration-only fallback (flat rate per minute)
 */
export function estimateActivityLoad(activity: StravaActivity): number {
  const minutes = activity.moving_time / 60;

  // 1. Direct kJ from power meter
  if (activity.kilojoules != null && activity.kilojoules > 0) {
    return activity.kilojoules;
  }

  // 2. Weighted average power × time (most accurate without direct kJ)
  if (
    activity.weighted_avg_watts != null &&
    activity.weighted_avg_watts > 0
  ) {
    return (activity.weighted_avg_watts * activity.moving_time) / 1000;
  }

  // 3. Average HR × duration proxy
  // HR-based: rough estimate using (avg_hr - 60) as effort offset × minutes.
  // effortFactor is clamped to 1.0 — HR above 160 bpm does not scale linearly
  // and the formula would otherwise exceed the intended 0–1 range.
  if (activity.average_hr != null && activity.average_hr > 60) {
    const effortFactor = Math.min((activity.average_hr - 60) / 100, 1.0);
    return effortFactor * minutes * 10; // ~10 kJ/min at full effort
  }

  // 4. Duration-only fallback: 5 kJ per minute (moderate default)
  return minutes * 5;
}

// ── EWMA baseline ────────────────────────────────────────────
/**
 * Computes an exponentially weighted moving average over an array of values
 * (ordered oldest → newest). Returns null when fewer than minSamples values
 * are provided — too few readings produce noisy baselines.
 */
export function ewma(values: number[], alpha = EWMA_ALPHA, minSamples = BASELINE_MIN_SAMPLES): number | null {
  if (values.length < minSamples) return null;
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}

function pctVsBaseline(value: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((value - baseline) / baseline) * 100;
}

// ── Is this a HIIT session? ───────────────────────────────────
function isHiit(
  activity: StravaActivity,
  hrThreshold = DEFAULT_HIIT_HR_THRESHOLD
): boolean {
  return (activity.max_hr ?? 0) >= hrThreshold;
}

// ── Is this a long session? ───────────────────────────────────
function isLongSession(
  activity: StravaActivity,
  thresholdMinutes = DEFAULT_LONG_SESSION_MINUTES
): boolean {
  return activity.moving_time / 60 >= thresholdMinutes;
}

// ── HRV trend (Plews et al. 2013) ────────────────────────────
/**
 * Compares the average of the two most recent HRV readings against the average
 * of the three prior readings (5-reading window total).
 * >+5%  → rising
 * <-5%  → falling
 * otherwise → flat
 */
function computeHrvTrend(hrvValues: number[]): HrvTrend | null {
  if (hrvValues.length < 5) return null;
  const last5 = hrvValues.slice(-5);
  const prior3avg = (last5[0] + last5[1] + last5[2]) / 3;
  const recent2avg = (last5[3] + last5[4]) / 2;
  if (prior3avg === 0) return null;
  const changePct = ((recent2avg - prior3avg) / prior3avg) * 100;
  if (changePct > 5) return "rising";
  if (changePct < -5) return "falling";
  return "flat";
}

/**
 * Seven-day HRV coefficient of variation. Following the reliability evidence
 * for sleep-derived HRV-CV, do not calculate a value from fewer than five
 * valid nights. This is a data-quality signal, not a hard readiness rule.
 */
export function computeHrvCv(
  values: number[],
): { value: number | null; validNights: number; confidence: MetricConfidence } {
  const last7 = values.slice(-7);
  const validNights = last7.length;
  const confidence: MetricConfidence = validNights >= 6
    ? "high"
    : validNights >= 5
      ? "moderate"
      : "insufficient";

  if (validNights < 5) return { value: null, validNights, confidence };
  const mean = last7.reduce((sum, value) => sum + value, 0) / validNights;
  if (mean <= 0) return { value: null, validNights, confidence: "insufficient" };
  const variance = last7.reduce((sum, value) => sum + (value - mean) ** 2, 0) / validNights;
  return { value: (Math.sqrt(variance) / mean) * 100, validNights, confidence };
}

// ── Consecutive low recovery days ────────────────────────────
/**
 * Counts the unbroken streak of days (ending on targetDate) where recovery
 * score < 50. Used to detect early overreaching patterns.
 */
function computeConsecutiveLowRecoveryDays(
  recoveries: WhoopRecovery[],
  targetDateStr: string
): number {
  // Sort newest first so we can walk backward from target date
  const sorted = [...recoveries].sort(
    (a, b) =>
      new Date(b.source_created_at).getTime() -
      new Date(a.source_created_at).getTime()
  );

  let streak = 0;
  let expectedDateStr = targetDateStr;

  for (const r of sorted) {
    const rDateStr = new Date(r.source_created_at).toISOString().split("T")[0];
    if (rDateStr !== expectedDateStr) break; // gap in data — stop streak
    if (r.score >= 50) break; // recovered — streak ends
    streak++;
    // Advance to the previous day
    const prev = new Date(expectedDateStr);
    prev.setDate(prev.getDate() - 1);
    expectedDateStr = prev.toISOString().split("T")[0];
  }

  return streak;
}

// ── Training monotony (Foster) ────────────────────────────────
/**
 * mean / SD of daily loads over the last 7 days.
 * Returns null when SD is near-zero (avoids division by near-zero)
 * or when mean is too low to be meaningful (< 50 kJ).
 * High monotony (> 2.0) indicates insufficient load variation.
 */
function computeTrainingMonotony(dailyLoads: number[]): number | null {
  if (dailyLoads.length < 7) return null;
  const mean = dailyLoads.reduce((a, b) => a + b, 0) / dailyLoads.length;
  if (mean < 50) return null;
  const variance = dailyLoads.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / dailyLoads.length;
  const sd = Math.sqrt(variance);
  if (sd < 1) return null;
  return mean / sd;
}

// ── Main normalization function ───────────────────────────────

export interface NormalizationInput {
  userId: string;
  targetDate: Date;
  recoveries: WhoopRecovery[]; // ordered oldest → newest, last 28+ days
  sleepRecords: WhoopSleep[];  // ordered oldest → newest
  activities: StravaActivity[];// ordered oldest → newest
  hiitHrThreshold?: number;
  longSessionMinutes?: number;
}

export function normalizeDailyMetrics(input: NormalizationInput): DailyMetrics {
  const {
    userId,
    targetDate,
    recoveries,
    sleepRecords,
    activities,
    hiitHrThreshold = DEFAULT_HIIT_HR_THRESHOLD,
    longSessionMinutes = DEFAULT_LONG_SESSION_MINUTES,
  } = input;

  const dateStr = targetDate.toISOString().split("T")[0];
  const targetMs = targetDate.getTime();

  // Helper: ms before target date
  const daysAgoMs = (d: number) => d * 24 * 60 * 60 * 1000;

  // ── Find today's recovery record ──────────────────────────
  const todayRecovery = recoveries.find((r) => {
    const d = new Date(r.source_created_at).toISOString().split("T")[0];
    return d === dateStr;
  });

  // ── Sleep for last night ──────────────────────────────────
  const todaySleep = sleepRecords.find((s) => {
    // sleep that ends on the target date
    const endDate = new Date(s.end_time).toISOString().split("T")[0];
    return endDate === dateStr;
  });

  const sleepHours = todaySleep
    ? todaySleep.sleep_seconds / 3600
    : null;

  const sleepEfficiency = todaySleep?.sleep_efficiency ?? null;
  const awakeMinutes = todaySleep ? sleepAwakeMinutes(todaySleep) : null;
  const longestAwakeMinutes = todaySleep ? sleepLongestAwakeMinutes(todaySleep) : null;
  const continuityConfidence: MetricConfidence = longestAwakeMinutes != null
    ? "high"
    : awakeMinutes != null
      ? "moderate"
      : "insufficient";

  // Duration, efficiency, and continuity-aware quality score (0–10).
  const sleepQualityScore =
    sleepHours != null
      ? computeSleepQualityScore(
          sleepHours,
          sleepEfficiency,
          awakeMinutes,
          longestAwakeMinutes,
          todaySleep ? sleepDisturbanceCount(todaySleep) : 0,
        )
      : null;

  // ── EWMA baselines (prior BASELINE_WINDOW_DAYS, excluding today) ──
  const baselineRecoveries = recoveries.filter((r) => {
    const ts = new Date(r.source_created_at).getTime();
    return (
      ts < targetMs &&
      ts >= targetMs - daysAgoMs(BASELINE_WINDOW_DAYS)
    );
  });

  const baselineSleep = sleepRecords.filter((s) => {
    const ts = new Date(s.end_time).getTime();
    return (
      ts < targetMs &&
      ts >= targetMs - daysAgoMs(BASELINE_WINDOW_DAYS)
    );
  });

  // Values sorted oldest→newest (input contract) — EWMA processes in this order
  const hrvValues = baselineRecoveries.map((r) => r.hrv_rmssd).filter((v): v is number => v != null);
  const restingHrValues = baselineRecoveries.map((r) => r.resting_hr).filter((v): v is number => v != null);
  const sleepHourValues = baselineSleep.map((s) => s.sleep_seconds / 3600);

  // EWMA replaces simple rolling average — recent data weighted more heavily.
  const baselineHrv = ewma(hrvValues);
  const baselineRestingHr = ewma(restingHrValues);
  const baselineSleepHours = ewma(sleepHourValues);

  // ── Percent-vs-baseline calculations ──────────────────────
  const sleepVsBaselinePct =
    sleepHours != null && baselineSleepHours != null
      ? pctVsBaseline(sleepHours, baselineSleepHours)
      : null;

  const hrvVsBaselinePct =
    todayRecovery?.hrv_rmssd != null && baselineHrv != null
      ? pctVsBaseline(todayRecovery.hrv_rmssd, baselineHrv)
      : null;

  const restingHrVsBaselinePct =
    todayRecovery?.resting_hr != null && baselineRestingHr != null
      ? pctVsBaseline(todayRecovery.resting_hr, baselineRestingHr)
      : null;

  // ── HRV trend (Plews et al.) ──────────────────────────────
  // All HRV values from the last 28 days, oldest→newest
  const allHrvValues = recoveries
    .filter((r) => {
      const ts = new Date(r.source_created_at).getTime();
      return ts <= targetMs && r.hrv_rmssd != null;
    })
    .map((r) => r.hrv_rmssd as number);

  const hrvTrend = computeHrvTrend(allHrvValues);
  const hrvCv = computeHrvCv(allHrvValues);

  // ── Load calculations ─────────────────────────────────────
  const activitiesLast3d = activities.filter((a) => {
    const ts = new Date(a.start_date).getTime();
    return ts >= targetMs - daysAgoMs(3) && ts <= targetMs;
  });
  const activitiesLast7d = activities.filter((a) => {
    const ts = new Date(a.start_date).getTime();
    return ts >= targetMs - daysAgoMs(7) && ts <= targetMs;
  });
  const activitiesLast28d = activities.filter((a) => {
    const ts = new Date(a.start_date).getTime();
    return ts >= targetMs - daysAgoMs(28) && ts <= targetMs;
  });

  // Return null (not 0) when no activities exist so the rules engine can
  // distinguish "no Strava data connected" from "athlete did nothing".
  const load3d = activitiesLast3d.length > 0
    ? activitiesLast3d.reduce((sum, a) => sum + estimateActivityLoad(a), 0)
    : null;
  const load7d = activitiesLast7d.length > 0
    ? activitiesLast7d.reduce((sum, a) => sum + estimateActivityLoad(a), 0)
    : null;
  const load28d = activitiesLast28d.length > 0
    ? activitiesLast28d.reduce((sum, a) => sum + estimateActivityLoad(a), 0)
    : null;

  // ── ACWR (Gabbett et al.) ─────────────────────────────────
  // acute (7d) / (chronic / 4) = acute / chronic_weekly_avg
  // Target zone 0.8–1.3; danger >1.5
  const acwr =
    load7d != null && load28d != null && load28d > 0
      ? load7d / (load28d / 4)
      : null;

  // ── Training monotony ─────────────────────────────────────
  // Build a per-day load array for the last 7 days (0 for rest days)
  const dailyLoadsLast7: number[] = [];
  for (let d = 6; d >= 0; d--) {
    const dayStart = targetMs - daysAgoMs(d + 1);
    const dayEnd = targetMs - daysAgoMs(d);
    const dayLoad = activities
      .filter((a) => {
        const ts = new Date(a.start_date).getTime();
        return ts >= dayStart && ts < dayEnd;
      })
      .reduce((sum, a) => sum + estimateActivityLoad(a), 0);
    dailyLoadsLast7.push(dayLoad);
  }
  const trainingMonotony = computeTrainingMonotony(dailyLoadsLast7);

  // ── Consecutive low recovery days ─────────────────────────
  const consecutiveLowRecoveryDays = computeConsecutiveLowRecoveryDays(recoveries, dateStr);

  // ── Days since HIIT / long session ────────────────────────
  const sortedDesc = [...activities].sort(
    (a, b) =>
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  let daysSinceHiit: number | null = null;
  let daysSinceLong: number | null = null;

  for (const act of sortedDesc) {
    const actMs = new Date(act.start_date).getTime();
    if (actMs >= targetMs) continue; // future — skip
    const daysAgo = Math.floor((targetMs - actMs) / daysAgoMs(1));

    if (daysSinceHiit === null && isHiit(act, hiitHrThreshold)) {
      daysSinceHiit = daysAgo;
    }
    if (daysSinceLong === null && isLongSession(act, longSessionMinutes)) {
      daysSinceLong = daysAgo;
    }
    if (daysSinceHiit !== null && daysSinceLong !== null) break;
  }

  // ── Fatigue / freshness flags ─────────────────────────────
  const recoveryScore = todayRecovery?.score ?? null;

  const fatigueFlag =
    (recoveryScore !== null && recoveryScore < 34) ||
    (sleepVsBaselinePct !== null && sleepVsBaselinePct < -20) ||
    (daysSinceHiit !== null &&
      daysSinceHiit <= 1 &&
      (load3d ?? 0) > 1500 &&
      (recoveryScore === null || recoveryScore < 67));

  const freshnessFlag =
    recoveryScore !== null &&
    recoveryScore > 66 &&
    (sleepVsBaselinePct === null || sleepVsBaselinePct >= -5) &&
    (daysSinceHiit === null || daysSinceHiit >= 3);

  return {
    user_id: userId,
    date: dateStr,
    sleep_hours: sleepHours,
    sleep_vs_baseline_pct: sleepVsBaselinePct,
    recovery_score: recoveryScore,
    hrv_vs_baseline_pct: hrvVsBaselinePct,
    resting_hr_vs_baseline_pct: restingHrVsBaselinePct,
    whoop_strain: null, // populated from whoop_cycles if available
    load_3d: load3d,
    load_7d: load7d,
    load_28d: load28d,
    acwr,
    hrv_trend: hrvTrend,
    hrv_cv_7d: hrvCv.value,
    hrv_cv_valid_nights: hrvCv.validNights,
    hrv_cv_confidence: hrvCv.confidence,
    sleep_quality_score: sleepQualityScore,
    sleep_awake_minutes: awakeMinutes,
    sleep_longest_awake_minutes: longestAwakeMinutes,
    sleep_continuity_confidence: continuityConfidence,
    consecutive_low_recovery_days: consecutiveLowRecoveryDays,
    training_monotony: trainingMonotony,
    days_since_hiit: daysSinceHiit,
    days_since_long_session: daysSinceLong,
    fatigue_flag: fatigueFlag,
    freshness_flag: freshnessFlag,
    computed_at: new Date().toISOString(),
  };
}
