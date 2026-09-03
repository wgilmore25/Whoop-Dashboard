import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import type { RecommendationExplanation } from "@/lib/types";

interface Props {
  explanation: RecommendationExplanation;
}

export function ExplanationCard({ explanation }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Why This Recommendation
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed">{explanation.summary}</p>
        <ul className="space-y-1.5">
          {explanation.bullets.map((bullet, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <span className="text-primary mt-0.5">•</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        {explanation.llm_used && (
          <p className="text-xs text-muted-foreground pt-1">
            Enhanced by {explanation.llm_used}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
