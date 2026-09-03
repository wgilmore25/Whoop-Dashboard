// ============================================================
// Client for the Python FastAPI recommendation service
// ============================================================

import type { Recommendation } from "../types";

// Used only when no recommendation has been generated yet. The live route uses
// lib/recommendations/engine.ts, so a service outage cannot change the advice.
export function fallbackRecommendation(): Recommendation {
  return {
    readiness_bucket: "moderate",
    recommended_session: "zone2",
    intensity_cap: "sub-threshold",
    duration_min_low: 30,
    duration_min_high: 60,
    strength_allowed: false,
    confidence: 0.35,
    rule_version: "awaiting-data",
    why: ["Awaiting enough current data to generate a personalized recommendation."],
  };
}
