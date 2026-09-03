import { AppShell } from "@/components/layout/nav";
import { RecoveryCard } from "@/components/cards/recovery-card";
import { SleepCard } from "@/components/cards/sleep-card";
import { LoadCard } from "@/components/cards/load-card";
import { RecommendationCard } from "@/components/cards/recommendation-card";
import { ExplanationCard } from "@/components/cards/explanation-card";
import { RecentSessionsCard } from "@/components/cards/recent-sessions-card";
import { RecoveryLoadChart } from "@/components/charts/recovery-load-chart";
import { SleepRecommendationChart } from "@/components/charts/sleep-recommendation-chart";
import { SyncStatus } from "@/components/dashboard/sync-status";
import { MorningCheckIn } from "@/components/dashboard/morning-check-in";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config/env";
import { generateExplanation } from "@/lib/explanations/generator";
import { mockDashboardData } from "@/lib/mock-data";
import { fallbackRecommendation } from "@/lib/recommendations/client";
import type {
  DashboardData,
  DailyMetrics,
  Recommendation,
  RecommendationExplanation,
  StravaActivity,
  TrendPoint,
  OAuthConnection,
  RecoveryDetails,
  SleepDetails,
  LoadDetails,
} from "@/lib/types";

// ── Live Supabase data fetch ──────────────────────────────────
// Fetches today's metrics, recommendation, trend history, recent activities,
// and connection statuses from the database.
//
// Falls back to mock data when:
//   • The user has no metrics for today (sync hasn't run yet)
//   • Any query fails unexpectedly
// This keeps the dashboard useful before the first sync completes.

async function getDashboardDataLive(): Promise<DashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return mockDashboardData;

  const today = new Date().toISOString().split("T")[0];
  const d14ago = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const d30ago = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    metricsRes,
    recRes,
    activitiesRes,
    trendMetRes,
    trendRecRes,
    connRes,
    recoveryRes,
    sleepRes,
  ] = await Promise.all([
    supabase
      .from("daily_metrics")
      .select("*")
      .eq("user_id", user.id)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("recommendations")
      .select("*, recommendation_explanations(*)")
      .eq("user_id", user.id)
      .gte("date", d14ago)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(14),
    supabase
      .from("strava_activities")
      .select("*")
      .eq("user_id", user.id)
      .gte("start_date", d30ago)
      .order("start_date", { ascending: false })
      .limit(50),
    supabase
      .from("daily_metrics")
      .select("date, recovery_score, load_3d, sleep_hours")
      .eq("user_id", user.id)
      .gte("date", d14ago)
      .order("date", { ascending: true }),
    supabase
      .from("recommendations")
      .select("date, recommended_session")
      .eq("user_id", user.id)
      .gte("date", d14ago),
    supabase
      .from("oauth_connections")
      .select("id, user_id, provider, provider_user_id, status, last_synced_at")
      .eq("user_id", user.id),
    supabase
      .from("whoop_recoveries")
      .select("score, hrv_rmssd, resting_hr, source_created_at")
      .eq("user_id", user.id)
      .gte("source_created_at", d14ago)
      .order("source_created_at", { ascending: true }),
    supabase
      .from("whoop_sleep")
      .select("end_time, raw_json")
      .eq("user_id", user.id)
      .gte("end_time", d30ago)
      .order("end_time", { ascending: false })
      .limit(7),
  ]);

  // Use the latest completed day when today's WHOOP recovery has not arrived
  // yet. This prevents real data from being replaced by old demo data each
  // morning before the wearable has published a new recovery record.
  if (!metricsRes.data) {
    console.info(
      `[dashboard] No data for user ${user.id} on ${today}. ` +
        "No completed daily metrics have been stored yet."
    );
    return mockDashboardData;
  }

  const metrics = metricsRes.data as unknown as DailyMetrics;

  // Use the recommendation generated for this exact metrics day. Fetching the
  // latest recommendation independently can combine yesterday's recovery with
  // today's recommendation, which produces contradictory guidance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRow = (recRes.data ?? []).find((row: any) => row.date === metrics.date) as any;
  // Python is the only recommendation engine. The UI must not re-derive a
  // different prescription from the same metrics when the service is down.
  const useStoredRecommendation = Boolean(recRow);
  const recommendation: Recommendation = useStoredRecommendation
    ? {
        readiness_bucket: recRow.readiness_bucket,
        recommended_session: recRow.recommended_session,
        intensity_cap: recRow.intensity_cap ?? null,
        duration_min_low: recRow.duration_min_low ?? null,
        duration_min_high: recRow.duration_min_high ?? null,
        strength_allowed: recRow.strength_allowed ?? false,
        confidence: recRow.confidence ?? 0.5,
        rule_version: recRow.rule_version ?? "v1",
        why: [],
      }
    : fallbackRecommendation();

  // Use stored explanation if present; re-generate deterministically if not.
  const expRow = useStoredRecommendation ? recRow?.recommendation_explanations?.[0] : null;
  const explanation: RecommendationExplanation = expRow
    ? {
        summary: expRow.plain_language_summary,
        bullets: expRow.bullets_json as string[],
      }
    : generateExplanation(recommendation);

  const recentActivities = (activitiesRes.data ?? []) as unknown as StravaActivity[];

  // Merge per-day metrics with per-day session recommendations.
  const recsByDate: Record<string, string> = Object.fromEntries(
    (trendRecRes.data ?? []).map((r) => [r.date, r.recommended_session])
  );
  const trendData: TrendPoint[] = (trendMetRes.data ?? []).map((m) => ({
    date: m.date,
    recovery_score: m.recovery_score,
    load_3d: m.load_3d,
    sleep_hours: m.sleep_hours,
    recommended_session: (recsByDate[m.date] as TrendPoint["recommended_session"] | undefined) ?? null,
  }));

  const connRows = connRes.data ?? [];
  const recoveryRows = recoveryRes.data ?? [];
  const todayRecovery = recoveryRows.find(
    (row) => new Date(row.source_created_at).toISOString().split("T")[0] === metrics.date
  );
  const recoveryDetails: RecoveryDetails = {
    hrv: todayRecovery?.hrv_rmssd ?? null,
    resting_hr: todayRecovery?.resting_hr ?? null,
    hrv_history: recoveryRows
      .map((row) => Number(row.hrv_rmssd))
      .filter((value) => Number.isFinite(value)),
    hrv_ewma_14d: null,
    hrv_baseline: null,
    hrv_cv_7d: metrics.hrv_cv_7d,
    hrv_cv_valid_nights: metrics.hrv_cv_valid_nights,
    hrv_cv_confidence: metrics.hrv_cv_confidence,
  };
  if (recoveryDetails.hrv_history.length) {
    recoveryDetails.hrv_ewma_14d = recoveryDetails.hrv_history.reduce(
      (average, value, index) => index === 0 ? value : value * 0.25 + average * 0.75,
      0
    );
  }
  if (recoveryDetails.hrv != null && metrics.hrv_vs_baseline_pct != null) {
    recoveryDetails.hrv_baseline = recoveryDetails.hrv / (1 + metrics.hrv_vs_baseline_pct / 100);
  }

  // WHOOP keeps sleep stages inside raw_json. The sync layer preserves that
  // response, so use it directly and gracefully omit stages from older rows.
  const rawSleep = sleepRes.data?.find(
    (row) => new Date(row.end_time).toISOString().split("T")[0] === metrics.date
  )?.raw_json as Record<string, unknown> | null | undefined;
  const originalSleep = (rawSleep?.raw_json ?? rawSleep) as Record<string, unknown> | undefined;
  const stageSummary = (originalSleep?.score as Record<string, unknown> | undefined)
    ?.stage_summary as Record<string, number> | undefined;
  const minutes = (milliseconds?: number) =>
    typeof milliseconds === "number" ? Math.round(milliseconds / 60000) : null;
  const sleepDetails: SleepDetails = {
    deep_minutes: minutes(stageSummary?.total_slow_wave_sleep_time_milli),
    rem_minutes: minutes(stageSummary?.total_rem_sleep_time_milli),
    light_minutes: minutes(stageSummary?.total_light_sleep_time_milli),
    awake_minutes: minutes(stageSummary?.total_awake_time_milli),
    disturbance_count: typeof stageSummary?.disturbance_count === "number" ? stageSummary.disturbance_count : null,
    longest_awake_minutes: metrics.sleep_longest_awake_minutes,
    continuity_confidence: metrics.sleep_continuity_confidence ?? "insufficient",
  };
  const currentCalendarDay = new Date();
  const currentDayUtc = Date.UTC(
    currentCalendarDay.getFullYear(),
    currentCalendarDay.getMonth(),
    currentCalendarDay.getDate()
  );
  const daysSince = (predicate: (activity: StravaActivity) => boolean) => {
    const matching = recentActivities
      .filter(predicate)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
    if (!matching) return null;
    const activityDate = new Date(matching.start_date);
    const activityDayUtc = Date.UTC(
      activityDate.getFullYear(),
      activityDate.getMonth(),
      activityDate.getDate()
    );
    return Math.max(0, Math.round((currentDayUtc - activityDayUtc) / 86_400_000));
  };
  const loadDetails: LoadDetails = {
    last_hard_session_days: daysSince((activity) => activity.moving_time > 3600 || (activity.average_hr ?? 0) >= 145 || (activity.max_hr ?? 0) >= 155),
    last_long_session_days: daysSince((activity) => activity.moving_time > 3600),
  };
  const makeNullConn = (provider: OAuthConnection["provider"]): OAuthConnection => ({
    id: "",
    user_id: user.id,
    provider,
    provider_user_id: "",
    status: "disconnected",
    last_synced_at: null,
  });

  return {
    metrics,
    recommendation,
    explanation,
    recentActivities,
    trendData,
    connections: {
      whoop:
        (connRows.find((c) => c.provider === "whoop") as unknown as OAuthConnection) ??
        makeNullConn("whoop"),
      strava:
        (connRows.find((c) => c.provider === "strava") as unknown as OAuthConnection) ??
        makeNullConn("strava"),
    },
    recoveryDetails,
    sleepDetails,
    loadDetails,
  };
}

// ── Entry point — mock fallback hierarchy ────────────────────
// Priority: explicit mock mode → Supabase not configured → live fetch → error fallback
async function getDashboardData(): Promise<DashboardData> {
  if (process.env.NEXT_PUBLIC_MOCK_MODE === "true") {
    return mockDashboardData;
  }
  if (!isSupabaseConfigured()) {
    console.warn(
      "[dashboard] Supabase credentials not configured — serving mock data. " +
        "Set real credentials in .env.local or set NEXT_PUBLIC_MOCK_MODE=true."
    );
    return mockDashboardData;
  }
  try {
    return await getDashboardDataLive();
  } catch (err) {
    console.error("[dashboard] Live data fetch failed, falling back to mock:", err);
    return mockDashboardData;
  }
}

// Simple history table
function HistoryTable({ data }: { data: DashboardData["trendData"] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-secondary/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Recovery</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Sleep</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">3-Day Load</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((row) => (
            <tr key={row.date} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
              <td className="px-4 py-3 font-medium">
                {new Date(row.date).toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                })}
              </td>
              <td className="px-4 py-3 text-right">
                {row.recovery_score != null ? `${Math.round(row.recovery_score)}%` : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {row.sleep_hours != null ? `${row.sleep_hours.toFixed(1)}h` : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {row.load_3d != null ? `${Math.round(row.load_3d)} kJ` : "—"}
              </td>
              <td className="px-4 py-3">
                {row.recommended_session ? (
                  <span className="capitalize text-muted-foreground">
                    {row.recommended_session.replace("_", " ")}
                  </span>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const { metrics, recommendation, explanation, recentActivities, trendData, connections, recoveryDetails, sleepDetails, loadDetails } = data;

  const isMock = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Training Readiness</h1>
            <p className="text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
          {isMock && (
            <Badge variant="warning">Mock mode — no live data</Badge>
          )}
        </div>

        <SyncStatus connections={connections} />

        {/* Top row — status cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <RecoveryCard metrics={metrics} details={recoveryDetails} />
          <SleepCard metrics={metrics} details={sleepDetails} />
          <LoadCard metrics={metrics} window={3} details={loadDetails} />
          <LoadCard metrics={metrics} window={7} details={loadDetails} />
        </div>

        {/* Middle row — recommendation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <RecommendationCard recommendation={recommendation} />
          </div>
          <div className="lg:col-span-1">
            <ExplanationCard explanation={explanation} />
          </div>
          <div className="lg:col-span-1">
            <RecentSessionsCard activities={recentActivities} />
          </div>
        </div>
        <MorningCheckIn />

        {/* Bottom row — charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecoveryLoadChart data={trendData} />
          <SleepRecommendationChart data={trendData} />
        </div>

        {/* History table */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent History</h2>
          <HistoryTable data={trendData} />
        </div>
      </div>
    </AppShell>
  );
}
