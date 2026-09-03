import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";
import type { DailyMetrics, LoadDetails } from "@/lib/types";

interface Props {
  metrics: DailyMetrics;
  window: 3 | 7;
  details?: LoadDetails;
}

function sessionAge(days: number | null) {
  if (days == null) return "—";
  return days === 0 ? "today" : `${days}d ago`;
}

export function LoadCard({ metrics, window, details }: Props) {
  const load = window === 3 ? metrics.load_3d : metrics.load_7d;
  const loadLabel = metrics.load_method === "power_kj" || metrics.load_method === "power_estimate" ? "kJ" : "load points";
  const statusText = metrics.load_status === "unusually_high" ? "Unusually high" : metrics.load_status === "rising" ? "Rising" : metrics.load_status === "stable" ? "Stable" : "Building history";
  const statusColor = metrics.load_status === "unusually_high" ? "text-rose-600" : metrics.load_status === "rising" ? "text-amber-600" : "text-emerald-600";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {window}-Day Load
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <Zap className="h-6 w-6 text-amber-400 mb-1" />
          <span className="text-3xl font-bold text-foreground">
            {load != null ? Math.round(load) : "—"}
          </span>
          <span className="text-muted-foreground mb-1">{loadLabel}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {metrics.load_method === "power_kj" ? "Measured power-derived load" : "Estimated load — compare within the same athlete and method"}
        </p>
        {window === 3 && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
            <div><p className="text-muted-foreground">Last hard session</p><p className="font-semibold text-foreground">{sessionAge(details?.last_hard_session_days ?? null)}</p></div>
            <div><p className="text-muted-foreground">Last long session</p><p className="font-semibold text-foreground">{sessionAge(details?.last_long_session_days ?? null)}</p></div>
          </div>
        )}
        {window === 7 && (
          <div className="mt-3 border-t pt-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Personal load state</span><span className={`font-semibold ${statusColor}`}>{statusText}</span></div>
            <p className="mt-1 text-muted-foreground">{metrics.load_7d_vs_baseline_pct != null ? `${metrics.load_7d_vs_baseline_pct >= 0 ? "+" : ""}${Math.round(metrics.load_7d_vs_baseline_pct)}% vs personal 28-day weekly median` : "Need at least 3 prior weeks for a personal comparison."}</p>
            <p className="mt-1 text-muted-foreground">Data confidence: {metrics.load_confidence ?? "insufficient"}. ACWR is retained as context, not a risk threshold.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
