// ============================================================
// Shared TypeScript types for the Training Readiness Dashboard
// ============================================================

// ── Recommendation engine types ─────────────────────────────

export type ReadinessBucket = "low" | "moderate" | "high";

export type SessionCategory =
  | "off"
  | "recovery"
  | "zone2"
  | "tempo"
  | "high_intensity"
  | "strength_only";

export interface Recommendation {
  readiness_bucket: ReadinessBucket;
  recommended_session: SessionCategory;
  intensity_cap: string | null;
  duration_min_low: number | null;
  duration_min_high: number | null;
  strength_allowed: boolean;
  confidence: number;
  rule_version: string;
  why: string[];
}

export interface RecommendationExplanation {
  summary: string;
  bullets: string[];
  llm_used?: string | null;
}

// ── Daily metrics (normalized) ───────────────────────────────

export type HrvTrend = "rising" | "falling" | "flat";
export type MetricConfidence = "high" | "moderate" | "insufficient";
export type LoadMethod = "power_kj" | "power_estimate" | "hr_proxy" | "duration_proxy" | "mixed";
export type LoadStatus = "stable" | "rising" | "unusually_high" | "insufficient_history";

export interface DailyMetrics {
  id?: string;
  user_id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  sleep_hours: number | null;
  sleep_vs_baseline_pct: number | null;
  recovery_score: number | null;
  hrv_vs_baseline_pct: number | null;
  resting_hr_vs_baseline_pct: number | null;
  whoop_strain: number | null;
  load_3d: number | null;
  load_7d: number | null;
  load_28d: number | null;
  load_method: LoadMethod | null;
  load_confidence: MetricConfidence | null;
  load_status: LoadStatus | null;
  load_7d_vs_baseline_pct: number | null;
  acwr: number | null;
  hrv_trend: HrvTrend | null;
  hrv_cv_7d: number | null;
  hrv_cv_valid_nights: number | null;
  hrv_cv_confidence: MetricConfidence | null;
  sleep_quality_score: number | null;
  sleep_awake_minutes: number | null;
  sleep_longest_awake_minutes: number | null;
  sleep_continuity_confidence: MetricConfidence | null;
  consecutive_low_recovery_days: number | null;
  training_monotony: number | null;
  days_since_hiit: number | null;
  days_since_long_session: number | null;
  fatigue_flag: boolean;
  freshness_flag: boolean;
  computed_at?: string | null;
}

// ── OAuth connection ─────────────────────────────────────────

export type OAuthProvider = "whoop" | "strava";
export type ConnectionStatus =
  | "disconnected"
  | "connected"
  | "token_expired"
  | "sync_error";

export interface OAuthConnection {
  id: string;
  user_id: string;
  provider: OAuthProvider;
  provider_user_id?: string;
  status: ConnectionStatus;
  last_synced_at?: string | null;
  expires_at?: string | null;
}

// ── Source data row types ────────────────────────────────────

export interface WhoopRecovery {
  id: string;
  user_id: string;
  cycle_id: string;
  score: number;
  hrv_rmssd: number;
  resting_hr: number;
  skin_temp?: number | null;
  spo2?: number | null;
  source_created_at: string;
}

export interface WhoopSleep {
  id: string;
  user_id: string;
  sleep_id: string;
  start_time: string;
  end_time: string;
  sleep_seconds: number;
  sleep_efficiency: number;
  sleep_performance_pct: number;
}

export interface StravaActivity {
  id: string;
  user_id: string;
  strava_activity_id: string;
  start_date: string;
  type: string;
  name: string;
  moving_time: number;
  elapsed_time: number;
  distance_m?: number | null;
  elevation_gain_m?: number | null;
  average_hr?: number | null;
  max_hr?: number | null;
  average_watts?: number | null;
  weighted_avg_watts?: number | null;
  kilojoules?: number | null;
  trainer?: boolean | null;
  commute?: boolean | null;
  raw_json?: unknown;
}

// ── Dashboard detail view models ────────────────────────────
// These are built from the raw WHOOP records at render time. Keeping them
// separate from daily_metrics lets us show richer detail without requiring a
// database migration every time WHOOP exposes another useful field.
export interface RecoveryDetails {
  hrv: number | null;
  resting_hr: number | null;
  hrv_history: number[];
  hrv_ewma_14d: number | null;
  hrv_baseline: number | null;
  hrv_cv_7d?: number | null;
  hrv_cv_valid_nights?: number | null;
  hrv_cv_confidence?: MetricConfidence | null;
}

export interface SleepDetails {
  deep_minutes: number | null;
  rem_minutes: number | null;
  light_minutes: number | null;
  awake_minutes: number | null;
  disturbance_count: number | null;
  longest_awake_minutes: number | null;
  continuity_confidence: MetricConfidence | null;
}

export interface LoadDetails {
  last_hard_session_days: number | null;
  last_long_session_days: number | null;
}

// ── Dashboard view model ─────────────────────────────────────

export interface DashboardData {
  metrics: DailyMetrics;
  recommendation: Recommendation;
  explanation: RecommendationExplanation;
  recentActivities: StravaActivity[];
  trendData: TrendPoint[];
  connections: {
    whoop: OAuthConnection;
    strava: OAuthConnection;
  };
  recoveryDetails?: RecoveryDetails;
  sleepDetails?: SleepDetails;
  loadDetails?: LoadDetails;
}

export interface TrendPoint {
  date: string;
  recovery_score: number | null;
  load_3d: number | null;
  sleep_hours: number | null;
  recommended_session: SessionCategory | null;
}

// ── User settings ────────────────────────────────────────────

export type TrainingMode = "endurance" | "mixed" | "strength_biased";

export interface UserSettings {
  training_mode: TrainingMode;
  hiit_threshold_hr: number;
  long_session_minutes: number;
}

export interface MorningCheckIn {
  user_id: string;
  date: string;
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  motivation: number | null;
  illness_symptoms: boolean;
  pain_or_injury: boolean;
  travel_or_jet_lag: boolean;
  planned_session: SessionCategory | null;
  notes?: string | null;
}
