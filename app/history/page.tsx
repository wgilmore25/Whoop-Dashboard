import { AppShell } from "@/components/layout/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockTrendData, mockStravaActivities } from "@/lib/mock-data";
import { SESSION_LABELS, SESSION_COLORS, formatDate, formatDuration, formatDistance } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config/env";
import type { SessionCategory, StravaActivity, TrendPoint } from "@/lib/types";

async function getHistoryData(): Promise<{ trendData: TrendPoint[]; activities: StravaActivity[] }> {
  if (process.env.NEXT_PUBLIC_MOCK_MODE === "true" || !isSupabaseConfigured()) {
    return { trendData: [...mockTrendData].reverse(), activities: mockStravaActivities };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { trendData: [], activities: [] };

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [metricsRes, recRes, activitiesRes] = await Promise.all([
    supabase.from("daily_metrics").select("date, recovery_score, load_3d, sleep_hours").eq("user_id", user.id).gte("date", since).order("date", { ascending: false }),
    supabase.from("recommendations").select("date, recommended_session").eq("user_id", user.id).gte("date", since),
    supabase.from("strava_activities").select("*").eq("user_id", user.id).order("start_date", { ascending: false }).limit(20),
  ]);

  const sessionsByDate: Record<string, SessionCategory> = Object.fromEntries(
    (recRes.data ?? []).filter((row) => row.recommended_session).map((row) => [row.date, row.recommended_session as SessionCategory])
  );
  const trendData: TrendPoint[] = (metricsRes.data ?? []).map((row) => ({
    date: row.date,
    recovery_score: row.recovery_score,
    sleep_hours: row.sleep_hours,
    load_3d: row.load_3d,
    recommended_session: sessionsByDate[row.date] ?? null,
  }));

  return { trendData, activities: (activitiesRes.data ?? []) as unknown as StravaActivity[] };
}

export default async function HistoryPage() {
  const { trendData, activities } = await getHistoryData();

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">History</h1>
          <p className="text-muted-foreground mt-1">
            Daily metrics and recent activities
          </p>
        </div>

        {/* Daily metrics table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Metrics (Last 14 Days)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Recovery</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Sleep (h)</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">3-Day Load</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {trendData.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No live metrics yet. Open Connect and choose Sync Now.</td></tr>
                  ) : trendData.map((row) => {
                    const session = row.recommended_session as SessionCategory | null;
                    return (
                      <tr key={row.date} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{formatDate(row.date)}</td>
                        <td className="px-4 py-3 text-right">
                          {row.recovery_score != null ? (
                            <span
                              className={
                                row.recovery_score >= 67
                                  ? "text-emerald-600 font-medium"
                                  : row.recovery_score >= 34
                                  ? "text-amber-600 font-medium"
                                  : "text-rose-600 font-medium"
                              }
                            >
                              {Math.round(row.recovery_score)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.sleep_hours != null ? row.sleep_hours.toFixed(1) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.load_3d != null ? `${Math.round(row.load_3d)} kJ` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {session ? (
                            <span
                              className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${SESSION_COLORS[session]}20`,
                                color: SESSION_COLORS[session],
                              }}
                            >
                              {SESSION_LABELS[session]}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent activities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activities</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Activity</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Duration</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Distance</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avg HR</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No recent activities found.</td></tr>
                  ) : activities.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.type}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(a.start_date)}</td>
                      <td className="px-4 py-3 text-right">{formatDuration(a.moving_time)}</td>
                      <td className="px-4 py-3 text-right">
                        {a.distance_m != null ? formatDistance(a.distance_m) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.average_hr != null ? `${Math.round(a.average_hr)} bpm` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
