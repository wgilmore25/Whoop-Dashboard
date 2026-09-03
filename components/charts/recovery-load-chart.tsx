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
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";
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
          {p.dataKey === "recovery_score" ? "%" : " load points"}
        </p>
      ))}
    </div>
  );
};

export function RecoveryLoadChart({ data }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Recovery vs Training Load (14 days) <MetricInfo title="Recovery versus load chart">Recovery uses the left axis (0–100); load uses the right axis. Each point is a daily observation, and the chart does not infer measurements between days.</MetricInfo>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis yAxisId="recovery" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="load" orientation="right" tick={{ fontSize: 11 }} width={42} />
            <ReferenceLine yAxisId="recovery" y={50} stroke="#cbd5e1" strokeDasharray="3 3" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="linear"
              yAxisId="recovery"
              dataKey="recovery_score"
              name="Recovery"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
            <Line
              type="linear"
              yAxisId="load"
              dataKey="load_3d"
              name="3-Day Load"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 2 }}
              strokeDasharray="5 3"
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-1">
          Recovery uses the left axis; load uses the right axis. Lines connect daily observations only.
        </p>
      </CardContent>
    </Card>
  );
}
