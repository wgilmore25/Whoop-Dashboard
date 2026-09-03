import { AppShell } from "@/components/layout/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";

export default function UploadPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div><h1 className="text-2xl font-bold">Upload training data</h1><p className="text-muted-foreground">Bring in data from sources that are not connected yet.</p></div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" /> Manual import</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>WHOOP and Strava data sync automatically from the Connect page.</p><p>CSV import will be added here next for workouts from other platforms. Until then, use Connect → Sync Now to refresh your dashboard.</p></CardContent></Card>
      </div>
    </AppShell>
  );
}
