import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SESSION_LABELS, SESSION_COLORS, READINESS_LABELS, READINESS_COLORS } from "@/lib/utils";
import type { Recommendation } from "@/lib/types";

interface Props {
  recommendation: Recommendation;
}

export function RecommendationCard({ recommendation: rec }: Props) {
  const sessionLabel = SESSION_LABELS[rec.recommended_session];
  const sessionColor = SESSION_COLORS[rec.recommended_session];
  const readinessLabel = READINESS_LABELS[rec.readiness_bucket];
  const readinessColor = READINESS_COLORS[rec.readiness_bucket];

  return (
    <Card className="border-l-4" style={{ borderLeftColor: sessionColor }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Today's Recommendation
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {rec.rule_version} · {Math.round(rec.confidence * 100)}% confidence
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className="text-2xl font-bold"
            style={{ color: sessionColor }}
          >
            {sessionLabel}
          </span>
          <Badge
            style={{
              backgroundColor: `${readinessColor}20`,
              color: readinessColor,
            }}
          >
            {readinessLabel} readiness
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-1">
          {rec.duration_min_low != null && rec.duration_min_high != null && (
            <div className="text-center p-2 rounded-lg bg-secondary">
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="font-semibold text-sm">
                {rec.duration_min_low}–{rec.duration_min_high} min
              </p>
            </div>
          )}
          {rec.intensity_cap && (
            <div className="text-center p-2 rounded-lg bg-secondary">
              <p className="text-xs text-muted-foreground">Intensity cap</p>
              <p className="font-semibold text-sm capitalize">
                {rec.intensity_cap}
              </p>
            </div>
          )}
          <div className="text-center p-2 rounded-lg bg-secondary">
            <p className="text-xs text-muted-foreground">Strength</p>
            <p className="font-semibold text-sm">
              {rec.strength_allowed ? "✓ OK" : "✗ Limit"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
