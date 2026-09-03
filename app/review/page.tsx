import { AppShell } from "@/components/layout/nav";
import { OutcomeReview } from "@/components/review/outcome-review";

export default function ReviewPage() {
  return <AppShell><div className="space-y-6"><div><h1 className="text-2xl font-bold">Recommendation Review</h1><p className="mt-1 text-muted-foreground">Log what happened, then use the backtest signals to improve the algorithm over time.</p></div><OutcomeReview /></div></AppShell>;
}
