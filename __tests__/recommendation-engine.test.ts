import { buildRecommendation } from "@/lib/recommendations/engine";
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
      metrics: { ...mockTodayMetrics, recovery_score: 82, sleep_vs_baseline_pct: 2, load_status: "stable", load_7d_vs_baseline_pct: 3 },
      baseline,
      checkIn: { user_id: "u", date: "2026-03-24", fatigue: 1, soreness: 1, stress: 1, motivation: 4, illness_symptoms: false, pain_or_injury: false, travel_or_jet_lag: false, planned_session: "tempo" },
    });
    expect(result.recommended_session).toBe("tempo");
  });
});
