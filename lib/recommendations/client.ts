// ============================================================
// Client for the Python FastAPI recommendation service
// ============================================================

import type { DailyMetrics, Recommendation } from "../types";

const SERVICE_URL =
  process.env.FASTAPI_RECOMMENDATION_URL ?? "http://localhost:8000";

export interface RecommendationRequest {
  user_id: string;
  metrics: DailyMetrics;
  // Optional: training preference passed as context to the engine
  training_mode?: "endurance" | "mixed" | "strength_biased";
}

export async function fetchRecommendation(
  req: RecommendationRequest
): Promise<Recommendation> {
  const res = await fetch(`${SERVICE_URL}/compute-recommendation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    // Short timeout — if the service is down we fall back gracefully
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(
      `Recommendation service returned ${res.status}: ${await res.text()}`
    );
  }

  return res.json() as Promise<Recommendation>;
}

// Fallback used when the Python service is unavailable or in mock mode
export function fallbackRecommendation(): Recommendation {
  return {
    readiness_bucket: "moderate",
    recommended_session: "zone2",
    intensity_cap: "sub-threshold",
    duration_min_low: 30,
    duration_min_high: 60,
    strength_allowed: false,
    confidence: 0.5,
    rule_version: "fallback",
    why: ["Recommendation service unavailable — using default conservative output."],
  };
}
