import Link from "next/link";
import { redirect } from "next/navigation";
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
import { mockDashboardData } from "@/lib/mock-data";
import { generateExplanation } from "@/lib/explanations/generator";
import { RECOMMENDATION_RULE_VERSION } from "@/lib/recommendations/engine";
import { readinessInputGaps } from "@/lib/sync/freshness";
import { isUsableOvernightSleep } from "@/lib/sync/normalization";
import type {
  DashboardData,
  DecisionContext,
  DailyMetrics,
  Recommendation,
  StravaActivity,
  TrendPoint,
  OAuthConnection,
  RecoveryDetails,
  SleepDetails,
  LoadDetails,
} from "@/lib/types";

type Connections = DashboardData["connections"];

type LiveData = Omit<DashboardData, "recommendation" | "explanation"> & {
  recommendation: Recommendation | null;
  explanation: DashboardData["explanation"] | null;
  inputGaps: string[];
  sourceDates: { recovery: string | null; sleep: string | null; activity: string | null };
};

type DashboardState =
  | { kind: "demo"; data: DashboardData }
  | { kind: "live"; data: LiveData }
  | { kind: "empty"; connections: Connections }
  | { kind: "unavailable" | "signed_out" };

async function getDashboardDataLive(): Promise<DashboardState> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") throw authError;
  if (!user) return { kind: "signed_out" };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const d14ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const d30ago = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
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
    checkInRes,
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
      .select("*")
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
      .gte("source_created_at", d30ago)
      .order("source_created_at", { ascending: true }),
    supabase
      .from("whoop_sleep")
      .select("start_time, end_time, sleep_seconds, raw_json")
      .eq("user_id", user.id)
      .gte("end_time", d30ago)
      .order("start_time", { ascending: true }),
    supabase
      .from("morning_checkins")
      .select("updated_at")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
  ]);

  const queryError = [metricsRes, recRes, activitiesRes, trendMetRes, trendRecRes, connRes, recoveryRes, sleepRes, checkInRes]
    .find((result) => result.error)?.error;
  if (queryError) throw queryError;

  const connRows = (connRes.data ?? []) as OAuthConnection[];
  const makeNullConn = (provider: OAuthConnection["provider"]): OAuthConnection => ({
    id: "", user_id: user.id, provider, status: "disconnected", last_synced_at: null,
  });
  const connections = {
    whoop: connRows.find((c) => c.provider === "whoop") ?? makeNullConn("whoop"),
    strava: connRows.find((c) => c.provider === "strava") ?? makeNullConn("strava"),
  };
  if (!metricsRes.data) return { kind: "empty", connections };

  const metrics = metricsRes.data as DailyMetrics;
  const inputGaps = readinessInputGaps(metrics, connections, now);
  const recRow = recRes.data?.find((row) => row.date === today && row.rule_version === RECOMMENDATION_RULE_VERSION);
  const context = recRow?.decision_context as DecisionContext | null | undefined;
  // If a new provider sync succeeded but normalization failed, the previous
  // recommendation used a different snapshot and should stay hidden.
  const evaluatedAt = Date.parse(context?.evaluated_at ?? "");
  const computedAt = Math.min(evaluatedAt, Date.parse(metrics.computed_at ?? ""));
  const usesCurrentCheckIn = context?.check_in_updated_at === (checkInRes.data?.updated_at ?? null);
  const metricsAreCurrent = Object.values(connections).every((connection) =>
    !connection.last_synced_at || Date.parse(connection.last_synced_at) <= computedAt
  );
  const recommendation: Recommendation | null = recRow && context && usesCurrentCheckIn && !inputGaps.length && metricsAreCurrent
    ? {
        readiness_bucket: recRow.readiness_bucket,
        recommended_session: recRow.recommended_session,
        intensity_cap: recRow.intensity_cap ?? null,
        duration_min_low: recRow.duration_min_low ?? null,
        duration_min_high: recRow.duration_min_high ?? null,
        strength_allowed: recRow.strength_allowed ?? false,
        confidence: recRow.confidence ?? 0.35,
        rule_version: recRow.rule_version,
        plan: context.plan,
        why: context.why,
      }
    : null;
  const explanation = recommendation ? generateExplanation(recommendation) : null;

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

  const recoveryRows = recoveryRes.data ?? [];
  const scoredRecoveries = recoveryRows.filter((row) => row.score != null);
  const todayRecovery = scoredRecoveries.find(
    (row) => new Date(row.source_created_at).toISOString().slice(0, 10) === metrics.date
  );
  const recoveryDetails: RecoveryDetails = {
    hrv: todayRecovery?.hrv_rmssd ?? null,
    resting_hr: todayRecovery?.resting_hr ?? null,
    hrv_history: recoveryRows
      .filter((row) => Date.parse(row.source_created_at) >= Date.parse(d14ago))
      .map((row) => row.hrv_rmssd)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
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
  const overnightSleep = (sleepRes.data ?? []).filter(isUsableOvernightSleep);
  const rawSleep = overnightSleep.find(
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
  const sourceDates = {
    recovery: scoredRecoveries[scoredRecoveries.length - 1]?.source_created_at ?? null,
    sleep: overnightSleep.reduce<string | null>((latest, row) =>
      !latest || Date.parse(row.end_time) > Date.parse(latest) ? row.end_time : latest, null),
    activity: recentActivities[0]?.start_date ?? null,
  };

  return {
    kind: "live",
    data: {
      metrics, recommendation, explanation, recentActivities, trendData, connections,
      recoveryDetails, sleepDetails, loadDetails, inputGaps, sourceDates,
    },
  };
}

async function getDashboardData(): Promise<DashboardState> {
  if (process.env.NEXT_PUBLIC_MOCK_MODE === "true") {
    return { kind: "demo", data: mockDashboardData };
  }
  if (isSupabaseConfigured()) {
    try {
      return await getDashboardDataLive();
    } catch (error) {
      console.error("[dashboard] Could not load live data:", error);
    }
  }
  return { kind: "unavailable" };
}

function sourceDate(timestamp: string | null) {
  return timestamp
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(timestamp))
    : "no recent record";
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
                  weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
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
  const state = await getDashboardData();
  if (state.kind === "signed_out") redirect("/login");

  if (state.kind !== "demo" && state.kind !== "live") {
    return (
      <AppShell>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Training Readiness</h1>
          {state.kind === "empty" ? (
            <>
              <p className="text-muted-foreground">No live metrics yet. <Link href="/connect" className="underline">Connect a provider</Link> and sync to get started.</p>
              <SyncStatus connections={state.connections} now={new Date().toISOString()} />
              <MorningCheckIn />
            </>
          ) : (
            <p role="status" className="text-muted-foreground">Live data is unavailable. Refresh the page to try again.</p>
          )}
        </div>
      </AppShell>
    );
  }

  const { metrics, recommendation, explanation, recentActivities, trendData, connections, recoveryDetails, sleepDetails, loadDetails } = state.data;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Training Readiness</h1>
            <p className="text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
              })}
            </p>
          </div>
          {state.kind === "demo" && (
            <Badge variant="warning">Demo data</Badge>
          )}
        </div>

        {state.kind === "live" && (
          <>
            <SyncStatus connections={connections} now={new Date().toISOString()} />
            <p className="text-sm text-muted-foreground">
              Metrics for {metrics.date} (UTC) · Latest records (UTC): WHOOP recovery {sourceDate(state.data.sourceDates.recovery)},
              sleep {sourceDate(state.data.sourceDates.sleep)}, Strava activity {sourceDate(state.data.sourceDates.activity)}
            </p>
            {state.data.inputGaps.length > 0 && (
              <p role="status" className="rounded-xl border bg-card px-4 py-3 text-sm">
                {state.data.inputGaps.join(" · ")}
              </p>
            )}
          </>
        )}

        {/* Top row — status cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <RecoveryCard metrics={metrics} details={recoveryDetails} />
          <SleepCard metrics={metrics} details={sleepDetails} />
          <LoadCard metrics={metrics} window={3} details={loadDetails} />
          <LoadCard metrics={metrics} window={7} details={loadDetails} />
        </div>

        {state.kind === "live" && <MorningCheckIn />}

        {/* Middle row — recommendation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            {recommendation ? <RecommendationCard recommendation={recommendation} /> : (
              <div className="rounded-xl border bg-card p-4">
                <h2 className="font-medium">Recommendation unavailable</h2>
                <p className="mt-1 text-sm text-muted-foreground">Check the data status above. Save your check-in or sync again to update guidance.</p>
              </div>
            )}
          </div>
          <div className="lg:col-span-1">
            {explanation && <ExplanationCard explanation={explanation} showSummary={!recommendation?.plan} />}
          </div>
          <div className="lg:col-span-1">
            <RecentSessionsCard activities={recentActivities} />
          </div>
        </div>

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
