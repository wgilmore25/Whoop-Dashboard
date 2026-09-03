"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const scale = [1, 2, 3, 4, 5];

export function MorningCheckIn() {
  const [form, setForm] = useState<Record<string, unknown>>({ fatigue: 2, soreness: 2, stress: 2, motivation: 3, planned_session: "zone2" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { fetch("/api/check-in").then(async (res) => res.ok ? res.json() : null).then((data) => data && setForm((current) => ({ ...current, ...data }))).catch(() => undefined); }, []);
  const set = (name: string, value: unknown) => setForm((current) => ({ ...current, [name]: value }));
  const save = async () => {
    setSaving(true); setMessage(null);
    const res = await fetch("/api/check-in", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setMessage(res.ok ? "Saved — sync again to update today's recommendation." : "Could not save check-in. Run migration 008, then try again.");
    setSaving(false);
  };
  return <Card>
    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Morning check-in</CardTitle></CardHeader>
    <CardContent className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">One minute of context helps prevent wearable data from missing illness, pain, or local fatigue.</p>
      <div className="grid grid-cols-2 gap-2">
        {["fatigue", "soreness", "stress", "motivation"].map((name) => <label key={name} className="text-xs capitalize text-muted-foreground">{name}<select value={Number(form[name] ?? 2)} onChange={(e) => set(name, Number(e.target.value))} className="mt-1 block w-full rounded border px-2 py-1 text-foreground">{scale.map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>)}
      </div>
      <label className="block text-xs text-muted-foreground">Planned session<select value={String(form.planned_session ?? "")} onChange={(e) => set("planned_session", e.target.value || null)} className="mt-1 block w-full rounded border px-2 py-1 text-foreground"><option value="">Not set</option><option value="recovery">Recovery</option><option value="zone2">Easy aerobic</option><option value="tempo">Tempo</option><option value="high_intensity">High intensity</option><option value="strength_only">Strength</option><option value="off">Rest</option></select></label>
      <div className="flex flex-wrap gap-3 text-xs">{[["illness_symptoms", "Illness symptoms"], ["pain_or_injury", "Pain / injury"], ["travel_or_jet_lag", "Travel / jet lag"]].map(([name, label]) => <label key={name} className="flex items-center gap-1"><input type="checkbox" checked={Boolean(form[name])} onChange={(e) => set(name, e.target.checked)} />{label}</label>)}</div>
      <Button type="button" loading={saving} onClick={save}>Save check-in</Button>{message && <p className="text-xs text-muted-foreground">{message}</p>}
    </CardContent>
  </Card>;
}
