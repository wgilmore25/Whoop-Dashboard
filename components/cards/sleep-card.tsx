import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon } from "lucide-react";
import type { DailyMetrics, SleepDetails } from "@/lib/types";

interface Props {
  metrics: DailyMetrics;
  details?: SleepDetails;
}

export function SleepCard({ metrics, details }: Props) {
  const hours = metrics.sleep_hours;
  const vsBaseline = metrics.sleep_vs_baseline_pct;

  const color =
    vsBaseline == null
      ? "text-muted-foreground"
      : vsBaseline >= -5
      ? "text-emerald-600"
      : vsBaseline >= -15
      ? "text-amber-600"
      : "text-rose-600";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Sleep
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <Moon className="h-6 w-6 text-indigo-400 mb-1" />
          <span className="text-3xl font-bold">
            {hours != null ? hours.toFixed(1) : "—"}
          </span>
          <span className="text-muted-foreground mb-1">hrs</span>
        </div>

        {vsBaseline != null && (
          <p className={`mt-1 text-sm font-medium ${color}`}>
            {vsBaseline > 0 ? "+" : ""}
            {Math.round(vsBaseline)}% vs 14-day baseline
          </p>
        )}
        {vsBaseline == null && (
          <p className="mt-1 text-sm text-muted-foreground">
            Baseline not yet established
          </p>
        )}
        {details && (details.deep_minutes != null || details.rem_minutes != null) && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs">
              <div><p className="text-muted-foreground">Deep (SWS)</p><p className="font-semibold">{details.deep_minutes ?? "—"} min</p></div>
              <div><p className="text-muted-foreground">REM</p><p className="font-semibold">{details.rem_minutes ?? "—"} min</p></div>
              <div><p className="text-muted-foreground">Awake</p><p className="font-semibold">{details.awake_minutes ?? "—"} min</p></div>
              <div><p className="text-muted-foreground">Quality score</p><p className="font-semibold">{metrics.sleep_quality_score != null ? `${metrics.sleep_quality_score.toFixed(1)} / 10` : "—"}</p></div>
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="mb-1">Stage breakdown</p>
              <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
                <span className="bg-indigo-600" style={{ width: `${Math.min(100, ((details.deep_minutes ?? 0) / Math.max(1, hours ? hours * 60 : 1)) * 100)}%` }} />
                <span className="bg-violet-400" style={{ width: `${Math.min(100, ((details.rem_minutes ?? 0) / Math.max(1, hours ? hours * 60 : 1)) * 100)}%` }} />
                <span className="bg-blue-200" style={{ width: `${Math.min(100, ((details.light_minutes ?? 0) / Math.max(1, hours ? hours * 60 : 1)) * 100)}%` }} />
                <span className="bg-slate-300" style={{ width: `${Math.min(100, ((details.awake_minutes ?? 0) / Math.max(1, hours ? hours * 60 : 1)) * 100)}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-indigo-600" />Deep</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-400" />REM</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-200" />Light</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-300" />Awake</span></div>
              {(details.awake_minutes != null || details.disturbance_count != null) && (
                <p className="mt-2">
                  Continuity: {details.awake_minutes != null ? `${details.awake_minutes} min awake overnight` : "awake time unavailable"}
                  {details.longest_awake_minutes != null && ` · longest wake ${Math.round(details.longest_awake_minutes)} min`}
                  {details.disturbance_count != null && ` · ${details.disturbance_count} disruption${details.disturbance_count === 1 ? "" : "s"}`}
                  {` · ${details.continuity_confidence} confidence`}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
