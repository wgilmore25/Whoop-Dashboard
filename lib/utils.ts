import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SessionCategory, ReadinessBucket } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDistance(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

export const SESSION_COLORS: Record<SessionCategory, string> = {
  off: "#94a3b8",
  recovery: "#60a5fa",
  zone2: "#34d399",
  tempo: "#f59e0b",
  high_intensity: "#f43f5e",
  strength_only: "#a78bfa",
};

export const SESSION_LABELS: Record<SessionCategory, string> = {
  off: "Rest",
  recovery: "Recovery",
  zone2: "Zone 2",
  tempo: "Tempo",
  high_intensity: "High Intensity",
  strength_only: "Strength",
};

export const READINESS_COLORS: Record<ReadinessBucket, string> = {
  low: "#f43f5e",
  moderate: "#f59e0b",
  high: "#34d399",
};

export const READINESS_LABELS: Record<ReadinessBucket, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
};

export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE === "true";
}
