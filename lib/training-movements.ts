export const MOVEMENT_LABELS = {
  cycling: "Cycling",
  running: "Running",
  walking: "Walking",
  rowing: "Rowing",
  swimming: "Swimming",
  upper_body_strength: "Upper-body strength",
  lower_body_strength: "Lower-body strength",
  full_body_strength: "Full-body strength",
  other: "Other movement",
} as const;

export const PAIN_REGION_LABELS = {
  foot_or_ankle: "Foot or ankle",
  knee: "Knee",
  hip: "Hip",
  back: "Back",
  neck: "Neck",
  shoulder: "Shoulder",
  elbow: "Elbow",
  hand_or_wrist: "Hand or wrist",
  other: "Other region",
} as const;

export type TrainingMovement = keyof typeof MOVEMENT_LABELS;
export type PainRegion = keyof typeof PAIN_REGION_LABELS;

export function isTrainingMovement(value: unknown): value is TrainingMovement {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MOVEMENT_LABELS, value);
}

export function isPainRegion(value: unknown): value is PainRegion {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PAIN_REGION_LABELS, value);
}

export function movementsOverlap(first: TrainingMovement, second: TrainingMovement): boolean {
  return first === second ||
    (first === "full_body_strength" && second.endsWith("_body_strength")) ||
    (second === "full_body_strength" && first.endsWith("_body_strength"));
}
