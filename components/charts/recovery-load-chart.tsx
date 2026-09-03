"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendPoint } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface Props {
  data: TrendPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg p-3 shadow text-xs space-y-1">
      <p className="font-medium">{formatDate(label)}</p>
      {payload.map((p: any, index: number) => (
        <p key={`${p.dataKey}-${p.name}-${index}`} style={{ color: p.color }}>
          {p.name}: {p.value != null ? Math.round(p.value) : "—"}
          {p.dataKey === "recovery_score" ? "%" : " kJ"}
        </p>
      ))}
    </div>
  );
};

export function RecoveryLoadChart({ data }: Props) {
  // Normalize load to 0-100 scale for dual-axis readability
  const maxLoad = Math.max(...data.map((d) => d.load_3d ?? 0), 1);
  const chartData = data.map((d) => ({
    ...d,
    load_3d_normalized: d.load_3d != null ? (d.load_3d / maxLoad) * 100 : null,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Recovery vs Training Load (14 days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="recovery_score"
              name="Recovery"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="load_3d_normalized"
              name="3-Day Load (scaled)"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 3"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-1">
          Load scaled to 0–100 for comparison. Actual kJ values shown in cards above.
        </p>
      </CardContent>
    </Card>
  );
}
