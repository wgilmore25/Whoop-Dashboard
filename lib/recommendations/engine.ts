// Authoritative recommendation engine.
// It runs inside Next.js so the interpretation never changes when an optional
// local Python process is unavailable. Its output is intentionally traceable.

import type { DailyMetrics, MetricConfidence, MorningCheckIn, Recommendation, TrainingMode } from "@/lib/types";

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
}

type State = "suppressed" | "typical" | "elevated";

function confidenceLabel(metrics: DailyMetrics, baseline: BaselineContext, checkIn?: MorningCheckIn | null): MetricConfidence {
  const wearableSignals = [metrics.recovery_score, metrics.sleep_hours, metrics.load_7d].filter((v) => v != null).length;
  if (wearableSignals < 2 || baseline.valid_days < 7) return "insufficient";
  if (baseline.valid_days < 21 || metrics.hrv_cv_confidence === "insufficient" || !checkIn) return "moderate";
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
  if ((metrics.recovery_score ?? 50) < 40 || (metrics.hrv_vs_baseline_pct ?? 0) < -8 || (metrics.resting_hr_vs_baseline_pct ?? 0) > 8) {
    reasons.push("recovery signals are below your recent typical range");
    return { state: "suppressed", reasons };
  }
  if (metrics.recovery_score != null && baseline.recovery_median != null && metrics.recovery_score >= baseline.recovery_median + 10 && (metrics.sleep_vs_baseline_pct ?? 0) >= -5) {
    reasons.push("recovery and sleep are above your recent typical range");
    return { state: "elevated", reasons };
  }
  reasons.push("systemic recovery is within your recent typical range");
  return { state: "typical", reasons };
}

function loadState(metrics: DailyMetrics, baseline: BaselineContext): { state: "underloaded" | "appropriate" | "elevated" | "spike"; reasons: string[] } {
  const reasons: string[] = [];
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
  const { metrics, baseline, checkIn, trainingMode = "mixed" } = input;
  const systemic = systemicState(metrics, baseline, checkIn);
  const load = loadState(metrics, baseline);
  const dataConfidence = confidenceLabel(metrics, baseline, checkIn);
  let session: Recommendation["recommended_session"] = "zone2";
  let intensity = "easy to moderate";
  let duration: [number, number] = [30, 60];
  let strengthAllowed = true;

  if (systemic.state === "suppressed") {
    session = checkIn?.illness_symptoms || checkIn?.pain_or_injury ? "off" : "recovery";
    intensity = "easy";
    duration = [0, session === "off" ? 0 : 30];
    strengthAllowed = false;
  } else if (load.state === "spike") {
    session = "recovery";
    intensity = "easy";
    duration = [20, 45];
  } else if (systemic.state === "elevated" && load.state === "appropriate") {
    session = checkIn?.planned_session && ["tempo", "high_intensity", "strength_only"].includes(checkIn.planned_session)
      ? checkIn.planned_session : "tempo";
    intensity = session === "high_intensity" ? "quality, controlled" : "moderate to hard";
    duration = trainingMode === "endurance" ? [45, 75] : [35, 60];
  } else if (load.state === "elevated") {
    session = "zone2";
    intensity = "sub-threshold";
    duration = [30, 60];
  }

  const readiness_bucket = systemic.state === "suppressed" ? "low" : systemic.state === "elevated" ? "high" : "moderate";
  const why = [...systemic.reasons, ...load.reasons, `data confidence: ${dataConfidence}`];
  return { readiness_bucket, recommended_session: session, intensity_cap: intensity, duration_min_low: duration[0], duration_min_high: duration[1], strength_allowed: strengthAllowed, confidence: dataConfidence === "high" ? 0.8 : dataConfidence === "moderate" ? 0.6 : 0.35, rule_version: "ts-v2-personal-baseline", why };
}
