// ============================================================
// Deterministic, template-based explanation generator
// Converts structured recommendation output → plain-language text
// No LLM required. Pure function — easy to test.
// ============================================================

import type {
  Recommendation,
  RecommendationExplanation,
  SessionCategory,
  ReadinessBucket,
} from "../types";

// ── Session label map ────────────────────────────────────────

const SESSION_LABELS: Record<SessionCategory, string> = {
  off: "a full rest day",
  recovery: "a light recovery session",
  zone2: "an easy aerobic session",
  tempo: "a tempo or threshold session",
  high_intensity: "a high-intensity session",
  strength_only: "a strength-focused session",
};

// ── Summary templates keyed on readiness bucket ──────────────

function buildSummary(rec: Recommendation): string {
  const sessionLabel = SESSION_LABELS[rec.recommended_session];

  if (rec.readiness_bucket === "low") {
    return (
      `Your recovery metrics are below your baseline today, ` +
      `so ${sessionLabel} is the right call — pushing hard now would cost more than it returns.`
    );
  }

  if (rec.readiness_bucket === "moderate") {
    const whySnippet =
      rec.why.length > 0
        ? `${rec.why[0].toLowerCase()}, `
        : "your load and recovery metrics are mixed, ";
    return (
      `With ${whySnippet}` +
      `${sessionLabel} gives you aerobic stimulus without digging a deeper hole.`
    );
  }

  // high
  return (
    `Your recovery looks solid and your body appears fresh — ` +
    `${sessionLabel} is a high-value option today.`
  );
}

// ── Bullet templates ─────────────────────────────────────────

function buildBullets(rec: Recommendation): string[] {
  const bullets: string[] = [];

  // Derive bullets from the `why` array provided by the engine
  for (const reason of rec.why.slice(0, 3)) {
    bullets.push(capitalize(reason) + ".");
  }

  // Pad to exactly 3 bullets with fallbacks if why array is short
  if (bullets.length < 3) {
    const fallbacks = buildFallbackBullets(rec);
    while (bullets.length < 3 && fallbacks.length > 0) {
      bullets.push(fallbacks.shift()!);
    }
  }

  return bullets.slice(0, 3);
}

function buildFallbackBullets(rec: Recommendation): string[] {
  const session = SESSION_LABELS[rec.recommended_session];
  return [
    readinessBullet(rec.readiness_bucket),
    strengthBullet(rec.strength_allowed),
    durationBullet(rec.duration_min_low, rec.duration_min_high, session),
  ];
}

function readinessBullet(bucket: ReadinessBucket): string {
  const map: Record<ReadinessBucket, string> = {
    low: "Overall readiness is low — prioritize recovery over performance.",
    moderate: "Readiness is moderate — manageable output is appropriate.",
    high: "Readiness is high — your body is primed for quality work.",
  };
  return map[bucket];
}

function strengthBullet(allowed: boolean): string {
  return allowed
    ? "Strength work is compatible with today's fatigue profile."
    : "Avoid strength work today — endurance fatigue is the dominant signal.";
}

function durationBullet(
  low: number | null,
  high: number | null,
  session: string
): string {
  if (low && high) {
    return `Target ${low}–${high} minutes for ${session}.`;
  }
  return `Keep today's session within a comfortable duration.`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Public API ───────────────────────────────────────────────

export function generateExplanation(
  rec: Recommendation
): RecommendationExplanation {
  return {
    summary: buildSummary(rec),
    bullets: buildBullets(rec),
    llm_used: null,
  };
}

// ── Optional LLM stub (feature-flagged) ─────────────────────
// TODO: Implement this when FEATURE_FLAG_LLM_EXPLANATION=true
// It should accept the same Recommendation input plus the deterministic
// explanation as context, then return an enhanced RecommendationExplanation.
export async function generateLLMExplanation(
  _rec: Recommendation,
  _deterministicExplanation: RecommendationExplanation
): Promise<RecommendationExplanation> {
  throw new Error(
    "LLM explanation layer is not yet implemented. Set FEATURE_FLAG_LLM_EXPLANATION=false."
  );
}
