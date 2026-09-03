import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";
import type { DailyMetrics, LoadDetails } from "@/lib/types";

interface Props {
  metrics: DailyMetrics;
  window: 3 | 7;
  details?: LoadDetails;
}

function loadColor(load: number, window: 3 | 7): string {
  // Rough thresholds — high load relative to window
  const high = window === 3 ? 2000 : 4500;
  const mod = window === 3 ? 1200 : 2500;
  if (load >= high) return "text-rose-600";
  if (load >= mod) return "text-amber-600";
  return "text-emerald-600";
}

function sessionAge(days: number | null) {
  if (days == null) return "—";
  return days === 0 ? "today" : `${days}d ago`;
}

export function LoadCard({ metrics, window, details }: Props) {
  const load = window === 3 ? metrics.load_3d : metrics.load_7d;
  const color = load != null ? loadColor(load, window) : "text-muted-foreground";

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
          <span className={`text-3xl font-bold ${color}`}>
            {load != null ? Math.round(load) : "—"}
          </span>
          <span className="text-muted-foreground mb-1">kJ</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Estimated training load — last {window} days
        </p>
        {window === 3 && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
            <div><p className="text-muted-foreground">Last hard session</p><p className="font-semibold text-foreground">{sessionAge(details?.last_hard_session_days ?? null)}</p></div>
            <div><p className="text-muted-foreground">Last long session</p><p className="font-semibold text-foreground">{sessionAge(details?.last_long_session_days ?? null)}</p></div>
          </div>
        )}
        {window === 7 && (
          <div className="mt-3 border-t pt-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">ACWR</span><span className="font-semibold text-foreground">{metrics.acwr != null ? metrics.acwr.toFixed(2) : "—"}</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-secondary"><div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(0, (metrics.acwr ?? 0) / 2 * 100))}%` }} /></div>
            <div className="mt-1 flex justify-between text-muted-foreground"><span>0</span><span className="text-emerald-600">0.8–1.3</span><span>2.0+</span></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
