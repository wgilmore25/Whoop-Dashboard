import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricInfo } from "@/components/ui/metric-info";
import type { DailyMetrics, RecoveryDetails } from "@/lib/types";

function scoreToBucket(score: number): "low" | "moderate" | "high" {
  if (score >= 67) return "high";
  if (score >= 34) return "moderate";
  return "low";
}

function ringColor(score: number): string {
  if (score >= 67) return "#34d399"; // green
  if (score >= 34) return "#f59e0b"; // amber
  return "#f43f5e";                  // red
}

interface Props {
  metrics: DailyMetrics;
  details?: RecoveryDetails;
}

function TrendLine({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 140;
    const y = 30 - ((value - min) / range) * 24;
    return `${x},${y}`;
  }).join(" ");
  return <svg viewBox="0 0 140 32" className="mt-1 h-8 w-full overflow-visible"><polyline fill="none" stroke="#34d399" strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function RecoveryCard({ metrics, details }: Props) {
  const score = metrics.recovery_score;
  const hasData = score != null;
  const bucket = hasData ? scoreToBucket(score!) : null;

  const circumference = 2 * Math.PI * 40; // r=40
  const progress = hasData ? (score! / 100) * circumference : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Recovery <MetricInfo title="Recovery">WHOOP recovery score is displayed alongside HRV and resting-HR changes from your 14-day EWMA. A change is treated as meaningful only when it exceeds your individual 28-day SWC-style threshold, after 21 valid days.</MetricInfo>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-5">
        {/* Circular progress ring */}
        <div className="relative flex-shrink-0">
          <svg width="96" height="96" className="-rotate-90">
            <circle cx="48" cy="48" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            {hasData && (
              <circle
                cx="48" cy="48" r="40"
                fill="none"
                stroke={ringColor(score!)}
                strokeWidth="8"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={circumference - progress}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold">
              {hasData ? Math.round(score!) : "—"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {bucket && (
            <Badge
              variant={
                bucket === "high"
                  ? "success"
                  : bucket === "moderate"
                  ? "warning"
                  : "danger"
              }
            >
              {bucket.charAt(0).toUpperCase() + bucket.slice(1)} readiness
            </Badge>
          )}
          {!hasData && (
            <p className="text-xs text-muted-foreground">No data yet</p>
          )}
        </div>
        </div>

        {hasData && (
          <div className="grid grid-cols-2 gap-3 border-t pt-3 text-xs">
            <div>
              <p className="text-muted-foreground">HRV (ms) <MetricInfo title="HRV change">Today&apos;s HRV is compared with your 14-day EWMA. SWC is 0.2 × your own 28-day SD, so small normal fluctuations do not automatically change training advice.</MetricInfo></p>
              <p className="font-semibold text-foreground">{details?.hrv != null ? details.hrv.toFixed(1) : "—"} <span className="font-normal text-emerald-600">{metrics.hrv_vs_baseline_pct != null ? `${metrics.hrv_vs_baseline_pct > 0 ? "+" : ""}${Math.round(metrics.hrv_vs_baseline_pct)}%` : ""}</span></p>
            </div>
            <div>
              <p className="text-muted-foreground">HRV trend</p>
              <p className="font-semibold capitalize text-foreground">{metrics.hrv_trend ?? "—"}</p>
              <p className="text-muted-foreground">14d EWMA {details?.hrv_ewma_14d != null ? `${details.hrv_ewma_14d.toFixed(1)} ms` : "—"}</p>
              <p className="text-muted-foreground">SWC {metrics.hrv_swc_pct != null ? `±${metrics.hrv_swc_pct.toFixed(1)}%` : "building (21 days)"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">HRV stability (7d CV)</p>
              <p className="font-semibold text-foreground">
                {details?.hrv_cv_7d != null ? `${details.hrv_cv_7d.toFixed(1)}%` : "Building"}
              </p>
              <p className="text-muted-foreground">
                {details?.hrv_cv_valid_nights ?? 0}/7 nights · {details?.hrv_cv_confidence ?? "insufficient"} confidence
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Resting HR <MetricInfo title="Resting heart rate">A meaningful elevation is judged against your individual SWC-style threshold, not a fixed population-wide percentage.</MetricInfo></p>
              <p className="font-semibold text-foreground">{details?.resting_hr != null ? `${Math.round(details.resting_hr)} bpm` : "—"} <span className="font-normal text-emerald-600">{metrics.resting_hr_vs_baseline_pct != null ? `${metrics.resting_hr_vs_baseline_pct > 0 ? "+" : ""}${Math.round(metrics.resting_hr_vs_baseline_pct)}%` : ""}</span></p>
            </div>
          </div>
        )}
        {details?.hrv_history && details.hrv_history.length > 1 && (
          <div className="border-t pt-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between"><span>HRV — 14-day EWMA trend</span><span className="font-medium text-emerald-600">{details.hrv?.toFixed(1)} ms now</span></div>
            <p className="mt-0.5">Baseline: {details.hrv_baseline != null ? `${details.hrv_baseline.toFixed(1)} ms` : "building"}{metrics.hrv_vs_baseline_pct != null ? ` · ${metrics.hrv_vs_baseline_pct > 0 ? "+" : ""}${Math.round(metrics.hrv_vs_baseline_pct)}% vs baseline` : ""}</p>
            <TrendLine values={details.hrv_history} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
