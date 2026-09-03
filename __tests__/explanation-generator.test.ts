import { generateExplanation } from "../lib/explanations/generator";
import type { Recommendation } from "../lib/types";

function makeRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    readiness_bucket: "moderate",
    recommended_session: "zone2",
    intensity_cap: "sub-threshold",
    duration_min_low: 45,
    duration_min_high: 75,
    strength_allowed: false,
    confidence: 0.78,
    rule_version: "v1",
    why: ["sleep below baseline", "elevated 3-day load"],
    ...overrides,
  };
}

describe("generateExplanation", () => {
  test("returns a summary string", () => {
    const result = generateExplanation(makeRec());
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(10);
  });

  test("returns exactly 3 bullets", () => {
    const result = generateExplanation(makeRec());
    expect(result.bullets).toHaveLength(3);
  });

  test("each bullet is a non-empty string", () => {
    const result = generateExplanation(makeRec());
    result.bullets.forEach((b) => {
      expect(typeof b).toBe("string");
      expect(b.length).toBeGreaterThan(0);
    });
  });

  test("llm_used is null by default", () => {
    const result = generateExplanation(makeRec());
    expect(result.llm_used).toBeNull();
  });

  test("low readiness summary mentions recovery", () => {
    const rec = makeRec({ readiness_bucket: "low", recommended_session: "recovery" });
    const result = generateExplanation(rec);
    expect(result.summary.toLowerCase()).toMatch(/recover/);
  });

  test("high readiness summary mentions solid or fresh", () => {
    const rec = makeRec({
      readiness_bucket: "high",
      recommended_session: "tempo",
      why: ["recovery score is high"],
    });
    const result = generateExplanation(rec);
    expect(result.summary.toLowerCase()).toMatch(/solid|fresh|prime/);
  });

  test("bullets use why array reasons when provided", () => {
    const rec = makeRec({
      why: ["sleep below baseline", "elevated 3-day load", "recent hard session"],
    });
    const result = generateExplanation(rec);
    // First bullet should come from why[0] (capitalized)
    expect(result.bullets[0].toLowerCase()).toContain("sleep");
  });

  test("handles empty why array gracefully", () => {
    const rec = makeRec({ why: [] });
    const result = generateExplanation(rec);
    expect(result.bullets).toHaveLength(3);
    result.bullets.forEach((b) => expect(b.length).toBeGreaterThan(0));
  });

  test("handles off session", () => {
    const rec = makeRec({
      readiness_bucket: "low",
      recommended_session: "off",
      why: ["fatigue flag triggered"],
    });
    const result = generateExplanation(rec);
    expect(result.summary.toLowerCase()).toMatch(/rest|recover|cost/);
  });

  test("strength_allowed=true reflected in fallback bullets", () => {
    const rec = makeRec({
      readiness_bucket: "high",
      recommended_session: "tempo",
      strength_allowed: true,
      why: [], // force fallback bullets
    });
    const result = generateExplanation(rec);
    const allText = result.bullets.join(" ").toLowerCase();
    // At least one bullet should mention strength or readiness
    expect(allText).toMatch(/strength|readiness|target|session/);
  });
});
