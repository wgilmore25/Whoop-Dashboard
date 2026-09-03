import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDuration, formatDistance } from "@/lib/utils";
import type { StravaActivity } from "@/lib/types";

const ACTIVITY_ICONS: Record<string, string> = {
  Run: "🏃",
  Ride: "🚴",
  Swim: "🏊",
  Walk: "🚶",
  WeightTraining: "🏋️",
  Yoga: "🧘",
  Hike: "🥾",
  VirtualRide: "🖥️",
  Default: "⚡",
};

interface Props {
  activities: StravaActivity[];
}

export function RecentSessionsCard({ activities }: Props) {
  const recent = activities.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Last 3 Sessions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activities found.</p>
        ) : (
          <div className="space-y-3">
            {recent.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0"
              >
                <span className="text-xl">
                  {ACTIVITY_ICONS[a.type] ?? ACTIVITY_ICONS.Default}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(a.start_date)}
                    {" · "}
                    {formatDuration(a.moving_time)}
                    {a.distance_m != null && ` · ${formatDistance(a.distance_m)}`}
                  </p>
                </div>
                {a.average_hr && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium">{Math.round(a.average_hr)} bpm</p>
                    <p className="text-xs text-muted-foreground">avg HR</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
