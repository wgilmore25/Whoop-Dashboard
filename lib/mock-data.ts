// ============================================================
// Mock data for development / demo mode
// Rendered when NEXT_PUBLIC_MOCK_MODE=true
// ============================================================

import type {
  DashboardData,
  DailyMetrics,
  Recommendation,
  RecommendationExplanation,
  StravaActivity,
  TrendPoint,
  OAuthConnection,
  WhoopRecovery,
  WhoopSleep,
} from "./types";

const MOCK_USER_ID = "mock-user-00000000";

// ── Recent Strava activities ─────────────────────────────────
export const mockStravaActivities: StravaActivity[] = [
  {
    id: "sa-1",
    user_id: MOCK_USER_ID,
    strava_activity_id: "12345001",
    start_date: "2026-03-23T07:14:00Z",
    type: "Run",
    name: "Easy morning run",
    moving_time: 2880, // 48 min
    elapsed_time: 3060,
    distance_m: 8400,
    elevation_gain_m: 42,
    average_hr: 138,
    max_hr: 152,
    average_watts: null,
    weighted_avg_watts: null,
    kilojoules: 760,
    trainer: false,
    commute: false,
  },
  {
    id: "sa-2",
    user_id: MOCK_USER_ID,
    strava_activity_id: "12345002",
    start_date: "2026-03-21T06:45:00Z",
    type: "Ride",
    name: "Threshold intervals",
    moving_time: 4200, // 70 min
    elapsed_time: 4500,
    distance_m: 32000,
    elevation_gain_m: 210,
    average_hr: 158,
    max_hr: 176,
    average_watts: 238,
    weighted_avg_watts: 256,
    kilojoules: 998,
    trainer: false,
    commute: false,
  },
  {
    id: "sa-3",
    user_id: MOCK_USER_ID,
    strava_activity_id: "12345003",
    start_date: "2026-03-19T17:30:00Z",
    type: "WeightTraining",
    name: "Strength — upper body",
    moving_time: 3300, // 55 min
    elapsed_time: 3600,
    distance_m: null,
    elevation_gain_m: null,
    average_hr: 122,
    max_hr: 145,
    average_watts: null,
    weighted_avg_watts: null,
    kilojoules: 420,
    trainer: false,
    commute: false,
  },
];

// ── WHOOP recoveries (last 7 days) ───────────────────────────
export const mockWhoopRecoveries: WhoopRecovery[] = [
  { id: "wr-1", user_id: MOCK_USER_ID, cycle_id: "cyc-101", score: 62, hrv_rmssd: 54, resting_hr: 52, source_created_at: "2026-03-24T05:00:00Z" },
  { id: "wr-2", user_id: MOCK_USER_ID, cycle_id: "cyc-100", score: 45, hrv_rmssd: 44, resting_hr: 57, source_created_at: "2026-03-23T05:00:00Z" },
  { id: "wr-3", user_id: MOCK_USER_ID, cycle_id: "cyc-099", score: 78, hrv_rmssd: 62, resting_hr: 50, source_created_at: "2026-03-22T05:00:00Z" },
  { id: "wr-4", user_id: MOCK_USER_ID, cycle_id: "cyc-098", score: 38, hrv_rmssd: 40, resting_hr: 60, source_created_at: "2026-03-21T05:00:00Z" },
  { id: "wr-5", user_id: MOCK_USER_ID, cycle_id: "cyc-097", score: 55, hrv_rmssd: 51, resting_hr: 54, source_created_at: "2026-03-20T05:00:00Z" },
  { id: "wr-6", user_id: MOCK_USER_ID, cycle_id: "cyc-096", score: 82, hrv_rmssd: 68, resting_hr: 49, source_created_at: "2026-03-19T05:00:00Z" },
  { id: "wr-7", user_id: MOCK_USER_ID, cycle_id: "cyc-095", score: 71, hrv_rmssd: 59, resting_hr: 51, source_created_at: "2026-03-18T05:00:00Z" },
];

// ── WHOOP sleep (last 7 days) ────────────────────────────────
export const mockWhoopSleep: WhoopSleep[] = [
  { id: "ws-1", user_id: MOCK_USER_ID, sleep_id: "slp-101", start_time: "2026-03-23T23:00:00Z", end_time: "2026-03-24T06:15:00Z", sleep_seconds: 26100, sleep_efficiency: 0.88, sleep_performance_pct: 83 },
  { id: "ws-2", user_id: MOCK_USER_ID, sleep_id: "slp-100", start_time: "2026-03-22T23:30:00Z", end_time: "2026-03-23T06:00:00Z", sleep_seconds: 23400, sleep_efficiency: 0.82, sleep_performance_pct: 72 },
  { id: "ws-3", user_id: MOCK_USER_ID, sleep_id: "slp-099", start_time: "2026-03-21T22:45:00Z", end_time: "2026-03-22T06:30:00Z", sleep_seconds: 27900, sleep_efficiency: 0.91, sleep_performance_pct: 91 },
  { id: "ws-4", user_id: MOCK_USER_ID, sleep_id: "slp-098", start_time: "2026-03-20T23:15:00Z", end_time: "2026-03-21T05:45:00Z", sleep_seconds: 23400, sleep_efficiency: 0.79, sleep_performance_pct: 68 },
  { id: "ws-5", user_id: MOCK_USER_ID, sleep_id: "slp-097", start_time: "2026-03-19T23:00:00Z", end_time: "2026-03-20T06:30:00Z", sleep_seconds: 27000, sleep_efficiency: 0.87, sleep_performance_pct: 85 },
];

// ── Today's daily metrics ────────────────────────────────────
export const mockTodayMetrics: DailyMetrics = {
  user_id: MOCK_USER_ID,
  date: "2026-03-24",
  sleep_hours: 7.25,
  sleep_vs_baseline_pct: -8,
  recovery_score: 62,
  hrv_vs_baseline_pct: -5,
  resting_hr_vs_baseline_pct: +3,
  whoop_strain: 8.2,
  load_3d: 1758,    // kJ proxy
  load_7d: 3420,
  load_28d: 8940,
  load_method: "mixed",
  load_confidence: "moderate",
  load_status: "stable",
  load_7d_vs_baseline_pct: 4,
  acwr: 1.53,
  hrv_trend: "flat",
  hrv_cv_7d: 7.8,
  hrv_cv_valid_nights: 7,
  hrv_cv_confidence: "high",
  sleep_quality_score: 6.38,
  sleep_awake_minutes: 28,
  sleep_longest_awake_minutes: null,
  sleep_continuity_confidence: "moderate",
  consecutive_low_recovery_days: 0,
  training_monotony: 1.48,
  days_since_hiit: 3,
  days_since_long_session: 2,
  fatigue_flag: false,
  freshness_flag: false,
};

// ── Today's recommendation ───────────────────────────────────
// Values are derived by running the Python rules engine against mockTodayMetrics.
// Rule B fires (34 ≤ recovery=62 < 67). base_confidence=1.0 (all fields present).
// confidence = 1.0 × 0.82 = 0.82. days_since_hiit=3 is not < HIIT_RECOVERY_MIN_DAYS(3),
// so HIIT is not recent — strength_allowed=true (moderate bucket, no fatigue, no recent HIIT).
export const mockRecommendation: Recommendation = {
  readiness_bucket: "moderate",
  recommended_session: "zone2",
  intensity_cap: "sub-threshold",
  duration_min_low: 45,
  duration_min_high: 75,
  strength_allowed: true,
  confidence: 0.82,
  rule_version: "v1",
  why: [
    "recovery score is moderate (62/100)",
    "moderately elevated recent training load (3-day)",
  ],
};

// ── Explanation ──────────────────────────────────────────────
// Generated by running generateExplanation(mockRecommendation).
// summary: "With ${why[0].toLowerCase()}, ${sessionLabel} gives you aerobic stimulus..."
// bullets[0-1]: capitalized why items; bullet[2]: readinessBullet fallback.
export const mockExplanation: RecommendationExplanation = {
  summary:
    "With recovery score is moderate (62/100), an easy aerobic session gives you aerobic stimulus without digging a deeper hole.",
  bullets: [
    "Recovery score is moderate (62/100).",
    "Moderately elevated recent training load (3-day).",
    "Readiness is moderate — manageable output is appropriate.",
  ],
};

// ── Trend data (14 days) ─────────────────────────────────────
export const mockTrendData: TrendPoint[] = [
  { date: "2026-03-10", recovery_score: 74, load_3d: 1100, sleep_hours: 7.8, recommended_session: "tempo" },
  { date: "2026-03-11", recovery_score: 66, load_3d: 1280, sleep_hours: 7.2, recommended_session: "zone2" },
  { date: "2026-03-12", recovery_score: 55, load_3d: 1450, sleep_hours: 6.9, recommended_session: "zone2" },
  { date: "2026-03-13", recovery_score: 42, load_3d: 1620, sleep_hours: 6.5, recommended_session: "recovery" },
  { date: "2026-03-14", recovery_score: 38, load_3d: 1700, sleep_hours: 6.1, recommended_session: "off" },
  { date: "2026-03-15", recovery_score: 51, load_3d: 1500, sleep_hours: 7.4, recommended_session: "zone2" },
  { date: "2026-03-16", recovery_score: 68, load_3d: 1200, sleep_hours: 7.9, recommended_session: "tempo" },
  { date: "2026-03-17", recovery_score: 82, load_3d: 900,  sleep_hours: 8.1, recommended_session: "high_intensity" },
  { date: "2026-03-18", recovery_score: 71, load_3d: 1100, sleep_hours: 7.6, recommended_session: "zone2" },
  { date: "2026-03-19", recovery_score: 55, load_3d: 1350, sleep_hours: 7.5, recommended_session: "zone2" },
  { date: "2026-03-20", recovery_score: 78, load_3d: 1200, sleep_hours: 7.5, recommended_session: "tempo" },
  { date: "2026-03-21", recovery_score: 38, load_3d: 1620, sleep_hours: 6.5, recommended_session: "recovery" },
  { date: "2026-03-22", recovery_score: 45, load_3d: 1758, sleep_hours: 6.5, recommended_session: "zone2" },
  { date: "2026-03-23", recovery_score: 62, load_3d: 1758, sleep_hours: 7.25, recommended_session: "zone2" },
];

// ── OAuth connection stubs ────────────────────────────────────
export const mockConnections: { whoop: OAuthConnection; strava: OAuthConnection } = {
  whoop: {
    id: "conn-whoop-mock",
    user_id: MOCK_USER_ID,
    provider: "whoop",
    provider_user_id: "whoop-demo-user",
    status: "connected",
    last_synced_at: "2026-03-24T06:01:00Z",
  },
  strava: {
    id: "conn-strava-mock",
    user_id: MOCK_USER_ID,
    provider: "strava",
    provider_user_id: "strava-demo-user",
    status: "connected",
    last_synced_at: "2026-03-24T06:02:00Z",
  },
};

// ── Assembled dashboard payload ──────────────────────────────
export const mockDashboardData: DashboardData = {
  metrics: mockTodayMetrics,
  recommendation: mockRecommendation,
  explanation: mockExplanation,
  recentActivities: mockStravaActivities,
  trendData: mockTrendData,
  connections: mockConnections,
  recoveryDetails: {
    hrv: 54,
    resting_hr: 52,
    hrv_history: [48, 51, 50, 56, 52, 55, 54],
    hrv_ewma_14d: 53.1,
    hrv_baseline: 56.8,
  },
  sleepDetails: {
    deep_minutes: 120,
    rem_minutes: 162,
    light_minutes: 153,
    awake_minutes: 60,
    disturbance_count: 2,
    longest_awake_minutes: null,
    continuity_confidence: "moderate",
  },
};

// ── Raw WHOOP API response shapes (for sync service reference) ─
export const mockWhoopRecoveryApiResponse = {
  records: [
    {
      cycle_id: 101,
      score: {
        recovery_score: 62,
        hrv_rmssd_milli: 54.2,
        resting_heart_rate: 52,
        skin_temp_celsius: 36.1,
        spo2_percentage: 97.8,
      },
      created_at: "2026-03-24T05:00:00.000Z",
    },
  ],
  next_token: null,
};

export const mockWhoopSleepApiResponse = {
  records: [
    {
      id: 101,
      start: "2026-03-23T23:00:00.000Z",
      end: "2026-03-24T06:15:00.000Z",
      score: {
        sleep_performance_percentage: 83,
        sleep_consistency_percentage: 75,
        sleep_efficiency_percentage: 88,
        stage_summary: {
          total_in_bed_time_milli: 29700000,
          total_awake_time_milli: 3600000,
          total_no_data_time_milli: 0,
          total_light_sleep_time_milli: 9180000,
          total_slow_wave_sleep_time_milli: 7200000,
          total_rem_sleep_time_milli: 9720000,
          sleep_cycle_count: 4,
          disturbance_count: 2,
        },
      },
    },
  ],
  next_token: null,
};

export const mockStravaActivityApiResponse = [
  {
    id: 12345001,
    name: "Easy morning run",
    type: "Run",
    start_date: "2026-03-23T07:14:00Z",
    moving_time: 2880,
    elapsed_time: 3060,
    distance: 8400,
    total_elevation_gain: 42,
    average_heartrate: 138,
    max_heartrate: 152,
    kilojoules: null,
    device_watts: false,
    trainer: false,
    commute: false,
  },
];
