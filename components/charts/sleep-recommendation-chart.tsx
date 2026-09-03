"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";
import { SESSION_COLORS } from "@/lib/utils";
import type { TrendPoint, SessionCategory } from "@/lib/types";

interface Props {
  data: TrendPoint[];
}

export function SleepRecommendationChart({ data }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Sleep vs Recommendation (14 days) <MetricInfo title="Sleep versus recommendation chart">Bars show measured sleep duration. Their colors indicate the stored recommendation category for that date; color alone does not show why the recommendation was made.</MetricInfo>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) =>
                new Date(v).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="sleep"
              domain={[4, 10]}
              tick={{ fontSize: 11 }}
              label={{ value: "hrs", angle: -90, position: "insideLeft", fontSize: 10 }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-white border border-border rounded-lg p-3 shadow text-xs space-y-1">
                    <p className="font-medium">
                      {new Date(label).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    {payload.map((p: any, index: number) => (
                      <p key={`${p.dataKey}-${p.name}-${index}`} style={{ color: p.color ?? p.fill }}>
                        {p.name}: {p.value != null ? p.value : "—"}
                        {p.dataKey === "sleep_hours" ? " hrs" : ""}
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="sleep" dataKey="sleep_hours" name="Sleep" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={
                    entry.recommended_session
                      ? SESSION_COLORS[entry.recommended_session as SessionCategory]
                      : "#94a3b8"
                  }
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
            <Line
              yAxisId="sleep"
              type="monotone"
              dataKey="sleep_hours"
              name="Sleep trend"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-1">
          Bar color indicates that day's recommendation category.
        </p>
      </CardContent>
    </Card>
  );
}
