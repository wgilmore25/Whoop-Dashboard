import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";
import type { DailyMetrics, SleepDetails } from "@/lib/types";

interface Props {
  metrics: DailyMetrics;
  details?: SleepDetails;
}

export function SleepCard({ metrics, details }: Props) {
  const hours = metrics.sleep_hours;
  const vsBaseline = metrics.sleep_vs_baseline_pct;
  const roundedChange = vsBaseline == null ? null : Math.round(vsBaseline);
  const stages = [
    { label: "Deep", minutes: details?.deep_minutes, color: "bg-indigo-600" },
    { label: "REM", minutes: details?.rem_minutes, color: "bg-violet-400" },
    { label: "Light", minutes: details?.light_minutes, color: "bg-blue-300" },
    { label: "Awake", minutes: details?.awake_minutes, color: "bg-slate-300" },
  ];
  const totalMinutes = stages.reduce((total, stage) => total + (stage.minutes ?? 0), 0);
  const hasContinuity = details?.disturbance_count != null || details?.longest_awake_minutes != null
    || (details?.continuity_confidence != null && details.continuity_confidence !== "insufficient");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Sleep <MetricInfo title="Sleep">Duration is compared with your 14-day baseline. The quality score combines duration, efficiency and overnight continuity.</MetricInfo>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div>
            <p className="text-3xl font-bold leading-none tabular-nums">
              {hours == null ? "—" : hours.toFixed(1)}{hours != null && <span className="ml-1 text-sm font-normal text-muted-foreground">hrs</span>}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {roundedChange == null ? "Baseline building" : `${roundedChange > 0 ? "+" : ""}${roundedChange}% vs baseline`}
            </p>
          </div>
          {metrics.sleep_quality_score != null && (
            <div>
              <p className="text-xs text-muted-foreground">Quality <MetricInfo title="Sleep quality score">An exploratory score from 0 to 10. It reflects duration, efficiency, awake time and interruptions.</MetricInfo></p>
              <p className="text-base font-semibold tabular-nums">{metrics.sleep_quality_score.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">/ 10</span></p>
            </div>
          )}
        </div>

        {totalMinutes > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Sleep stages</p>
            <div className="flex h-2 overflow-hidden rounded-full" aria-hidden="true">
              {stages.map(({ label, minutes, color }) => (
                <div key={label} className={color} style={{ width: `${((minutes ?? 0) / totalMinutes) * 100}%` }} />
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {stages.map(({ label, minutes, color }) => (
                <div key={label}>
                  <dt className="flex items-center gap-1.5 text-muted-foreground"><span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />{label}</dt>
                  <dd className="pl-3.5 font-semibold tabular-nums">{minutes == null ? "—" : `${minutes} min`}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {(hasContinuity || metrics.sleep_swc_pct != null) && (
          <details className="border-t pt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium">Sleep details</summary>
            <dl className="mt-2 space-y-1">
              {details?.disturbance_count != null && <div className="flex justify-between gap-2"><dt>Disruptions</dt><dd>{details.disturbance_count}</dd></div>}
              {details?.longest_awake_minutes != null && <div className="flex justify-between gap-2"><dt>Longest wake</dt><dd>{Math.round(details.longest_awake_minutes)} min</dd></div>}
              {details?.continuity_confidence && <div className="flex justify-between gap-2"><dt>Continuity confidence</dt><dd className="capitalize">{details.continuity_confidence}</dd></div>}
              {metrics.sleep_swc_pct != null && <div className="flex justify-between gap-2"><dt>Change threshold (SWC)</dt><dd>±{metrics.sleep_swc_pct.toFixed(1)}%</dd></div>}
            </dl>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
