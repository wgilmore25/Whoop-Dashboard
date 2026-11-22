import { buildRecommendation } from "@/lib/recommendations/engine";
import type { MorningCheckIn, SessionCategory } from "@/lib/types";
import { generateExplanation } from "@/lib/explanations/generator";
import { mockTodayMetrics } from "@/lib/mock-data";

const baseline = { valid_days: 28, recovery_median: 65, load_7d_median: 3400 };

describe("personal-baseline recommendation engine", () => {
  it("uses reported illness as an override even when wearable metrics look good", () => {
    const result = buildRecommendation({
      metrics: { ...mockTodayMetrics, recovery_score: 90, sleep_vs_baseline_pct: 5 },
      baseline,
      checkIn: { user_id: "u", date: "2026-03-24", fatigue: 1, soreness: 1, stress: 1, motivation: 4, illness_symptoms: true, pain_or_injury: false, travel_or_jet_lag: false, planned_session: "tempo" },
    });
    expect(result.recommended_session).toBe("off");
    expect(result.why.join(" ")).toContain("illness");
  });

  it("treats a workload spike as a constraint, not an injury prediction", () => {
    const result = buildRecommendation({
      metrics: { ...mockTodayMetrics, recovery_score: 85, load_status: "unusually_high", load_7d_vs_baseline_pct: 55 },
      baseline,
    });
    expect(result.recommended_session).toBe("recovery");
    expect(result.why.join(" ")).toContain("unusually high");
  });

  it("permits a planned quality session when recovery is elevated and load is appropriate", () => {
    const result = buildRecommendation({
      metrics: { ...mockTodayMetrics, recovery_score: 82, sleep_vs_baseline_pct: 2, hrv_vs_baseline_pct: 0, resting_hr_vs_baseline_pct: 0, load_status: "stable", load_7d_vs_baseline_pct: 3 },
      baseline,
      checkIn: { user_id: "u", date: "2026-03-24", fatigue: 1, soreness: 1, stress: 1, motivation: 4, illness_symptoms: false, pain_or_injury: false, travel_or_jet_lag: false, planned_session: "tempo" },
    });
    expect(result.recommended_session).toBe("tempo");
  });
});

describe("planned session decisions", () => {
  const metrics = {
    ...mockTodayMetrics, recovery_score: 87, sleep_vs_baseline_pct: 2,
    hrv_vs_baseline_pct: 0, resting_hr_vs_baseline_pct: 0, load_7d_vs_baseline_pct: 3,
  };
  function checkIn(planned_session: SessionCategory | null): MorningCheckIn {
    return {
      user_id: "u", date: metrics.date, fatigue: 1, soreness: 1, stress: 1, motivation: 4,
      illness_symptoms: false, pain_or_injury: false, travel_or_jet_lag: false, planned_session,
    };
  }

  for (const session of ["off", "recovery", "zone2", "tempo", "high_intensity", "strength_only"] as const) {
    test(`keeps planned ${session} on a high-confidence, high-readiness day`, () => {
      const decision = buildRecommendation({ metrics, baseline, checkIn: checkIn(session) });
      expect(decision.plan?.action).toBe("keep");
      expect(decision.recommended_session).toBe(session);
      expect(decision.duration_min_high).toBe(null);
    });
  }

  test("stays easy on a high-readiness day without a plan", () => {
    const decision = buildRecommendation({ metrics, baseline, checkIn: checkIn(null) });
    expect(decision.plan).toBe(null);
    expect(decision.recommended_session).toBe("zone2");
  });

  test("modifies planned intervals to easy aerobic work when load is rising", () => {
    const decision = buildRecommendation({
      metrics: { ...metrics, load_7d_vs_baseline_pct: 30 }, baseline, checkIn: checkIn("high_intensity"),
    });
    expect(decision.plan?.action).toBe("modify");
    expect(decision.plan?.reason).toContain("workload is rising");
    expect(decision.recommended_session).toBe("zone2");
  });

  test("modifies an easy aerobic day to light recovery when load spikes", () => {
    const decision = buildRecommendation({
      metrics: { ...metrics, load_7d_vs_baseline_pct: 55 }, baseline, checkIn: checkIn("zone2"),
    });
    expect(decision.plan?.action).toBe("modify");
    expect(decision.recommended_session).toBe("recovery");
  });

  test("moves planned strength when fatigue is high, with recovery as today's alternative", () => {
    const decision = buildRecommendation({
      metrics, baseline, checkIn: { ...checkIn("strength_only"), fatigue: 5 },
    });
    expect(decision.plan?.action).toBe("move");
    expect(decision.plan?.reason).toContain("fatigue");
    expect(decision.recommended_session).toBe("recovery");
    expect(generateExplanation(decision).summary).toContain("Move a strength-focused session to another day");
  });

  test("moves a hard workout to another day when illness is reported", () => {
    const decision = buildRecommendation({
      metrics, baseline, checkIn: { ...checkIn("tempo"), illness_symptoms: true },
    });
    expect(decision.plan?.action).toBe("move");
    expect(decision.plan?.reason).toContain("illness symptoms");
    expect(decision.recommended_session).toBe("off");
  });

  test("keeps planned rest without data and holds back a hard workout without data", () => {
    const inputGaps = ["Today's WHOOP recovery is missing"];
    const rest = buildRecommendation({ metrics, baseline, inputGaps, checkIn: checkIn("off") });
    const hard = buildRecommendation({ metrics, baseline, inputGaps, checkIn: checkIn("tempo") });
    expect(rest.plan?.action).toBe("keep");
    expect(hard.plan?.action).toBe("move");
    expect(hard.recommended_session).toBe("recovery");
  });
});

describe("reported movement limitations", () => {
  const metrics = {
    ...mockTodayMetrics, recovery_score: 87, sleep_vs_baseline_pct: 2,
    hrv_vs_baseline_pct: 0, resting_hr_vs_baseline_pct: 0, load_7d_vs_baseline_pct: 3,
  };
  const cyclingLimit: MorningCheckIn = {
    user_id: "u", date: metrics.date, fatigue: 1, soreness: 1, stress: 1, motivation: 4,
    illness_symptoms: false, pain_or_injury: true, travel_or_jet_lag: false,
    planned_session: "strength_only", planned_movement: "upper_body_strength",
    limited_movements: ["cycling"], pain_region: "knee",
  };

  test("keeps upper-body strength when knee pain is reported to limit cycling", () => {
    const decision = buildRecommendation({ metrics, baseline, checkIn: cyclingLimit });
    expect(decision.plan?.action).toBe("keep");
    expect(decision.plan?.planned_movement).toBe("upper_body_strength");
    expect(decision.recommended_session).toBe("strength_only");
    expect(decision.readiness_bucket).toBe("high");
    expect(decision.movement_note).toContain("knee");
    expect(decision.movement_note).toContain("cycling");
  });

  test("moves an affected cycling workout without lowering systemic readiness", () => {
    const decision = buildRecommendation({
      metrics, baseline, checkIn: { ...cyclingLimit, planned_session: "tempo", planned_movement: "cycling" },
    });
    expect(decision.plan?.action).toBe("move");
    expect(decision.plan?.reason).toContain("marked cycling as limited");
    expect(decision.recommended_session).toBe("off");
    expect(decision.readiness_bucket).toBe("high");
  });

  test("detects a lower-body restriction in a full-body strength session", () => {
    const decision = buildRecommendation({
      metrics, baseline, checkIn: {
        ...cyclingLimit, planned_movement: "full_body_strength", limited_movements: ["running", "lower_body_strength"],
      },
    });
    expect(decision.plan?.reason).toContain("lower-body strength");
    expect(decision.recommended_session).toBe("off");
  });

  test("holds a legacy pain-only check-in and an unspecified planned movement", () => {
    for (const override of [{ limited_movements: undefined }, { planned_movement: null }, { planned_movement: "other" as const }]) {
      const decision = buildRecommendation({ metrics, baseline, checkIn: { ...cyclingLimit, ...override } });
      expect(decision.plan?.action).toBe("move");
      expect(decision.recommended_session).toBe("off");
    }
  });

  test("preserves planned rest independently of the movement details", () => {
    const decision = buildRecommendation({
      metrics, baseline, checkIn: { ...cyclingLimit, planned_session: "off", planned_movement: null },
    });
    expect(decision.plan?.action).toBe("keep");
    expect(decision.recommended_session).toBe("off");
  });

  test("keeps the illness override and the insufficient-data policy", () => {
    const illness = buildRecommendation({ metrics, baseline, checkIn: { ...cyclingLimit, illness_symptoms: true } });
    const stale = buildRecommendation({ metrics, baseline, checkIn: cyclingLimit, inputGaps: ["Stale WHOOP"] });
    expect(illness.recommended_session).toBe("off");
    expect(illness.plan?.reason).toContain("illness");
    expect(illness.readiness_bucket).toBe("low");
    expect(stale.recommended_session).toBe("recovery");
    expect(stale.confidence).toBe(0.35);
  });
});
