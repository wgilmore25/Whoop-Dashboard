import type { ConnectionStatus, DailyMetrics } from "../types";

export const SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type SyncConnection = { status: ConnectionStatus; last_synced_at?: string | null };
export type SyncFreshness = "fresh" | "stale" | "missing" | "disconnected" | "token_expired" | "sync_error";

export function syncFreshness(connection: SyncConnection | undefined, now: Date): SyncFreshness {
  if (!connection) return "disconnected";
  if (connection.status !== "connected") return connection.status;
  if (!connection.last_synced_at) return "missing";
  const age = now.getTime() - Date.parse(connection.last_synced_at);
  return age >= 0 && age < SYNC_MAX_AGE_MS ? "fresh" : "stale";
}

export function readinessInputGaps(
  metrics: Pick<DailyMetrics, "date" | "recovery_score" | "sleep_hours">,
  connections: { whoop?: SyncConnection; strava?: SyncConnection },
  now: Date,
): string[] {
  const gaps: string[] = [];
  if (metrics.date !== now.toISOString().slice(0, 10)) {
    gaps.push("Today's metrics are unavailable");
  } else {
    if (metrics.recovery_score == null || !Number.isFinite(metrics.recovery_score)) gaps.push("Today's WHOOP recovery is missing");
    if (metrics.sleep_hours == null || !Number.isFinite(metrics.sleep_hours) || metrics.sleep_hours <= 0) gaps.push("Today's WHOOP sleep is missing");
  }
  if (syncFreshness(connections.whoop, now) !== "fresh") gaps.push("WHOOP has no current successful sync");
  if (syncFreshness(connections.strava, now) !== "fresh") gaps.push("Strava has no current successful sync");
  return gaps;
}
