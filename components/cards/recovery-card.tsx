import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";
import type { DailyMetrics, RecoveryDetails } from "@/lib/types";

interface Props {
  metrics: DailyMetrics;
  details?: RecoveryDetails;
}

function TrendLine({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = 2 + (index / (values.length - 1)) * 136;
    const y = 30 - ((value - min) / range) * 26;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 140 34" preserveAspectRatio="none" className="h-9 w-full text-slate-500" aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BaselineChange({ value }: { value: number | null }) {
  if (value == null) return null;
  const rounded = Math.round(value);

  return <p className="text-xs text-muted-foreground">{rounded > 0 ? "+" : ""}{rounded}% vs baseline</p>;
}

export function RecoveryCard({ metrics, details }: Props) {
  const score = metrics.recovery_score;
  const band = score == null ? null : score >= 67
    ? { label: "High", color: "#34d399", variant: "success" as const }
    : score >= 34
      ? { label: "Moderate", color: "#f59e0b", variant: "warning" as const }
      : { label: "Low", color: "#f43f5e", variant: "danger" as const };
  const circumference = 2 * Math.PI * 34;
  const history = details?.hrv_history ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Recovery <MetricInfo title="Recovery">The ring shows your WHOOP recovery score. HRV and resting heart rate are compared with your personal 14-day baselines.</MetricInfo>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex min-h-16 items-center gap-3">
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-secondary" />
              {score != null && band && (
                <circle cx="40" cy="40" r="34" fill="none" stroke={band.color} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.max(0, Math.min(score, 100)) / 100)} />
              )}
            </svg>
            <span className="absolute inset-0 grid place-items-center text-xl font-bold tabular-nums">{score == null ? "—" : Math.round(score)}</span>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">WHOOP recovery</p>
            {band ? <Badge variant={band.variant}>{band.label}</Badge> : <p className="text-sm">No score yet</p>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t pt-3">
          <div>
            <dt className="text-xs text-muted-foreground">HRV</dt>
            <dd className="text-base font-semibold tabular-nums">{details?.hrv?.toFixed(1) ?? "—"}{details?.hrv != null && " ms"}</dd>
            <dd><BaselineChange value={metrics.hrv_vs_baseline_pct} /></dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Resting HR</dt>
            <dd className="text-base font-semibold tabular-nums">{details?.resting_hr == null ? "—" : `${Math.round(details.resting_hr)} bpm`}</dd>
            <dd><BaselineChange value={metrics.resting_hr_vs_baseline_pct} /></dd>
          </div>
        </dl>

        {history.length > 1 && (
          <div className="space-y-1 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
              <span className="text-muted-foreground">HRV · last 14 days</span>
              {metrics.hrv_trend && <span className="font-medium capitalize">{metrics.hrv_trend}</span>}
            </div>
            <TrendLine values={history} />
          </div>
        )}

        <details className="border-t pt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">HRV details</summary>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between gap-2"><dt>14-day baseline</dt><dd>{details?.hrv_baseline != null && Number.isFinite(details.hrv_baseline) ? `${details.hrv_baseline.toFixed(1)} ms` : "Building"}</dd></div>
            <div className="flex justify-between gap-2"><dt>14-day EWMA</dt><dd>{details?.hrv_ewma_14d == null ? "—" : `${details.hrv_ewma_14d.toFixed(1)} ms`}</dd></div>
            <div className="flex justify-between gap-2"><dt>Change threshold (SWC)</dt><dd>{metrics.hrv_swc_pct == null ? "Building" : `±${metrics.hrv_swc_pct.toFixed(1)}%`}</dd></div>
            <div className="flex justify-between gap-2"><dt>7-night variability (CV)</dt><dd>{details?.hrv_cv_7d == null ? "Building" : `${details.hrv_cv_7d.toFixed(1)}%`}</dd></div>
          </dl>
          {details?.hrv_cv_valid_nights != null && (
            <p className="mt-1">{details.hrv_cv_valid_nights}/7 nights · {details.hrv_cv_confidence ?? "insufficient"} confidence</p>
          )}
        </details>
      </CardContent>
    </Card>
  );
}
