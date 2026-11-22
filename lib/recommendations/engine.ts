// Authoritative recommendation engine.
// It runs inside Next.js so the interpretation never changes when an optional
// local Python process is unavailable. Its output is intentionally traceable.

import type { DailyMetrics, MetricConfidence, MorningCheckIn, PlanDecision, Recommendation, SessionCategory, TrainingMode } from "@/lib/types";

export const RECOMMENDATION_RULE_VERSION = "ts-v4-planned-session";

export interface BaselineContext {
  valid_days: number;
  recovery_median: number | null;
  load_7d_median: number | null;
}

export interface RecommendationInput {
  metrics: DailyMetrics;
  baseline: BaselineContext;
  checkIn?: MorningCheckIn | null;
  trainingMode?: TrainingMode;
  inputGaps?: string[];
}

type State = "suppressed" | "typical" | "elevated";

function confidenceLabel(metrics: DailyMetrics, baseline: BaselineContext, checkIn?: MorningCheckIn | null): MetricConfidence {
  const wearableSignals = [metrics.recovery_score, metrics.sleep_hours, metrics.load_7d].filter((v) => v != null).length;
  if (wearableSignals < 2 || baseline.valid_days < 7) return "insufficient";
  if (baseline.valid_days < 21 || metrics.hrv_cv_confidence == null ||
    metrics.hrv_cv_confidence === "insufficient" || metrics.sleep_vs_baseline_pct == null ||
    metrics.load_7d == null || !checkIn) return "moderate";
  return "high";
}

function systemicState(metrics: DailyMetrics, baseline: BaselineContext, checkIn?: MorningCheckIn | null): { state: State; reasons: string[] } {
  const reasons: string[] = [];
  if (checkIn?.illness_symptoms || checkIn?.pain_or_injury) {
    reasons.push(checkIn.illness_symptoms ? "illness symptoms reported" : "pain or injury reported");
    return { state: "suppressed", reasons };
  }
  if ((checkIn?.fatigue ?? 0) >= 4 || (checkIn?.stress ?? 0) >= 4 || (checkIn?.soreness ?? 0) >= 4) {
    reasons.push("morning check-in indicates substantial fatigue, stress, or soreness");
    return { state: "suppressed", reasons };
  }
  const hrvMeaningfullyLow = metrics.hrv_swc_pct != null && metrics.hrv_vs_baseline_pct != null && metrics.hrv_vs_baseline_pct < -metrics.hrv_swc_pct;
  const rhrMeaningfullyHigh = metrics.resting_hr_swc_pct != null && metrics.resting_hr_vs_baseline_pct != null && metrics.resting_hr_vs_baseline_pct > metrics.resting_hr_swc_pct;
  if ((metrics.recovery_score ?? 50) < 40 || hrvMeaningfullyLow || rhrMeaningfullyHigh) {
    reasons.push("recovery signals are below your recent typical range");
    return { state: "suppressed", reasons };
  }
  if (metrics.recovery_score != null && baseline.recovery_median != null && metrics.recovery_score >= baseline.recovery_median + 10 && (metrics.sleep_vs_baseline_pct ?? 0) >= -5) {
    reasons.push("recovery is above your baseline and sleep is near or above its baseline");
    return { state: "elevated", reasons };
  }
  reasons.push("systemic recovery is within your recent typical range");
  return { state: "typical", reasons };
}

function loadState(metrics: DailyMetrics, baseline: BaselineContext): { state: "underloaded" | "appropriate" | "elevated" | "spike"; reasons: string[] } {
  if (metrics.load_7d == null || baseline.load_7d_median == null || baseline.valid_days < 21) {
    return { state: "appropriate", reasons: ["load history is still building, so workload is interpreted cautiously"] };
  }
  const change = metrics.load_7d_vs_baseline_pct ?? ((metrics.load_7d - baseline.load_7d_median) / Math.max(baseline.load_7d_median, 1)) * 100;
  if (change > 40 || metrics.load_status === "unusually_high") return { state: "spike", reasons: ["weekly load is unusually high versus your personal baseline"] };
  if (change > 20 || metrics.load_status === "rising") return { state: "elevated", reasons: ["weekly load is rising above your recent typical range"] };
  if (change < -25) return { state: "underloaded", reasons: ["weekly load is lower than your recent typical range"] };
  return { state: "appropriate", reasons: ["weekly load is close to your personal typical range"] };
}

export function buildRecommendation(input: RecommendationInput): Recommendation {
  const { metrics, baseline, checkIn, trainingMode = "mixed", inputGaps = [] } = input;
  const planned = checkIn?.planned_session ?? null;
  const systemic = systemicState(metrics, baseline, checkIn);
  const load = loadState(metrics, baseline);
  const dataConfidence = inputGaps.length ? "insufficient" : confidenceLabel(metrics, baseline, checkIn);
  const mustRest = checkIn?.illness_symptoms || checkIn?.pain_or_injury;

  let session: SessionCategory = "zone2";
  let planReason: string | null = null;

  if (planned === "off") {
    session = "off";
    planReason = "Rest is part of your training plan.";
  } else if (mustRest) {
    session = "off";
    planReason = checkIn.illness_symptoms ? "You reported illness symptoms." : "You reported pain or injury.";
  } else if (planned === "recovery") {
    session = "recovery";
    planReason = "You planned a light recovery session.";
  } else if (systemic.state === "suppressed" || dataConfidence === "insufficient" || load.state === "spike") {
    session = "recovery";
    if (systemic.state === "suppressed") {
      const reason = systemic.reasons[0];
      planReason = reason.charAt(0).toUpperCase() + reason.slice(1) + ".";
    } else if (dataConfidence === "insufficient") {
      planReason = "There is too little current data or baseline history to assess the planned workload.";
    } else {
      planReason = "Your weekly workload is unusually high compared with your baseline.";
    }
  } else if (planned === "zone2") {
    session = "zone2";
    planReason = "Today's signals support an easy aerobic session.";
  } else if (planned) {
    if (load.state === "elevated") {
      planReason = "Your weekly workload is rising above your usual range.";
    } else if (dataConfidence !== "high") {
      planReason = "Data confidence is too limited to support the planned intensity.";
    } else if (systemic.state !== "elevated") {
      planReason = "Recovery is within your usual range, and today's rules call for an easy session.";
    } else if (load.state === "underloaded") {
      planReason = "Your recent workload is below your usual range.";
    } else {
      session = planned;
      planReason = "Recovery is above your baseline and recent workload is within your usual range.";
    }
  }

  const plan: PlanDecision | null = planned && planReason ? {
    planned_session: planned,
    action: planned === session ? "keep"
      : session === "off" || planned === "strength_only" || (session === "recovery" && planned !== "zone2")
        ? "move" : "modify",
    reason: planReason,
  } : null;
  const intensity = {
    off: null, recovery: "easy", zone2: "easy, conversational",
    tempo: "moderate to hard", high_intensity: "quality, controlled", strength_only: "controlled",
  }[session];
  const duration: [number | null, number | null] =
    session === "off" || plan?.action === "keep" ? [null, null]
      : session === "recovery" ? [0, 30]
        : !planned || trainingMode === "endurance" ? [30, 60] : [20, 45];
  const strengthAllowed = session === "strength_only" ||
    (!planned && session === "zone2" && dataConfidence === "high" && load.state === "appropriate");
  const readiness_bucket = systemic.state === "suppressed" ? "low"
    : systemic.state === "elevated" && dataConfidence === "high" ? "high" : "moderate";
  const why = [
    ...(inputGaps.length && systemic.state !== "suppressed" ? [] : systemic.reasons),
    ...(inputGaps.length ? [] : load.reasons),
    ...inputGaps,
    `data confidence: ${dataConfidence}`,
  ];
  return {
    plan, readiness_bucket, recommended_session: session, intensity_cap: intensity,
    duration_min_low: duration[0], duration_min_high: duration[1], strength_allowed: strengthAllowed,
    confidence: dataConfidence === "high" ? 0.8 : dataConfidence === "moderate" ? 0.6 : 0.35,
    rule_version: RECOMMENDATION_RULE_VERSION, why,
  };
}
