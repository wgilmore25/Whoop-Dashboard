import {
  computeHrvCv,
  computeSleepQualityScore,
  individualSwcPct,
} from "@/lib/sync/normalization";

describe("HRV-CV reliability", () => {
  it("does not report HRV-CV with fewer than five nights", () => {
    expect(computeHrvCv([70, 72, 69, 71])).toEqual({
      value: null,
      validNights: 4,
      confidence: "insufficient",
    });
  });

  it("calculates HRV-CV from five valid nights", () => {
    const result = computeHrvCv([70, 72, 68, 71, 69]);
    expect(result.validNights).toBe(5);
    expect(result.confidence).toBe("moderate");
    expect(result.value).not.toBeNull();
  });
});

describe("continuity-aware sleep quality", () => {
  it("weights prolonged awake time more than a small wake period", () => {
    const eightHoursWithLongWake = computeSleepQualityScore(8, 0.9, 45, null, 1);
    const sevenHoursWithBriefWake = computeSleepQualityScore(7, 0.9, 5, null, 1);

    expect(sevenHoursWithBriefWake).toBeGreaterThan(eightHoursWithLongWake);
  });

  it("uses wake count only as a small supporting penalty", () => {
    const fewWakes = computeSleepQualityScore(7.5, 0.9, 20, null, 1);
    const manyWakes = computeSleepQualityScore(7.5, 0.9, 20, null, 5);

    expect(fewWakes - manyWakes).toBeLessThanOrEqual(0.5);
  });
});

describe("individual SWC thresholds", () => {
  it("does not report an individual threshold before 21 valid days", () => {
    expect(individualSwcPct(Array.from({ length: 20 }, () => 70))).toBeNull();
  });

  it("returns a personal meaningful-change threshold after 21 valid days", () => {
    const values = Array.from({ length: 28 }, (_, index) => 70 + (index % 4));
    expect(individualSwcPct(values)).toBeGreaterThan(0);
  });
});
