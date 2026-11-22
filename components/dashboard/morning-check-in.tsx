"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const scale = [1, 2, 3, 4, 5];

export function MorningCheckIn() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>({ fatigue: 2, soreness: 2, stress: 2, motivation: 3, planned_session: null });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCheckIn() {
      try {
        const response = await fetch("/api/check-in", { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load check-in");
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data) setForm((current) => ({ ...current, ...data }));
        setReady(true);
      } catch {
        if (!controller.signal.aborted) setMessage("Could not load your check-in. Refresh the page to retry.");
      }
    }
    void loadCheckIn();
    return () => controller.abort();
  }, []);
  const set = (name: string, value: unknown) => setForm((current) => ({ ...current, [name]: value }));
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/check-in", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage("Could not save your check-in. Try again.");
        return;
      }
      setMessage(result.recommendation_updated
        ? "Check-in saved."
        : "Check-in saved. The recommendation could not refresh. Try saving again.");
      router.refresh();
    } catch {
      setMessage("Could not confirm the save. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return <Card>
    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Morning check-in</CardTitle></CardHeader>
    <CardContent className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">Enter today’s plan and how you feel to update your recommendation.</p>
      <fieldset className="space-y-3" disabled={!ready || saving}>
      <div className="grid grid-cols-2 gap-2">
        {["fatigue", "soreness", "stress", "motivation"].map((name) => <label key={name} className="text-xs capitalize text-muted-foreground">{name}<select value={Number(form[name] ?? 2)} onChange={(e) => set(name, Number(e.target.value))} className="mt-1 block w-full rounded border px-2 py-1 text-foreground">{scale.map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>)}
      </div>
      <label className="block text-xs text-muted-foreground">Planned session<select value={String(form.planned_session ?? "")} onChange={(e) => set("planned_session", e.target.value || null)} className="mt-1 block w-full rounded border px-2 py-1 text-foreground"><option value="">Not set</option><option value="recovery">Recovery</option><option value="zone2">Easy aerobic</option><option value="tempo">Tempo</option><option value="high_intensity">High intensity</option><option value="strength_only">Strength</option><option value="off">Rest</option></select></label>
      <div className="flex flex-wrap gap-3 text-xs">{[["illness_symptoms", "Illness symptoms"], ["pain_or_injury", "Pain / injury"], ["travel_or_jet_lag", "Travel / jet lag"]].map(([name, label]) => <label key={name} className="flex items-center gap-1"><input type="checkbox" checked={Boolean(form[name])} onChange={(e) => set(name, e.target.checked)} />{label}</label>)}</div>
      <Button type="button" loading={saving} onClick={save}>Save check-in</Button>
      </fieldset>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </CardContent>
  </Card>;
}
