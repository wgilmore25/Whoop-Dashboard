"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
  MOVEMENT_LABELS, PAIN_REGION_LABELS, isTrainingMovement, isPainRegion, type TrainingMovement,
} from "@/lib/training-movements";
import type { MorningCheckIn as CheckIn, SessionCategory } from "@/lib/types";

const scale = [1, 2, 3, 4, 5];
const scores = { fatigue: "Fatigue", soreness: "Overall soreness", stress: "Stress", motivation: "Motivation" } as const;
const sessions: Record<SessionCategory, string> = {
  recovery: "Recovery", zone2: "Easy aerobic", tempo: "Tempo", high_intensity: "High intensity",
  strength_only: "Strength", off: "Rest",
};
const selectClass = "mt-1 block w-full rounded border px-2 py-1 text-foreground";
type Form = Omit<CheckIn, "user_id" | "date" | "updated_at">;

export function MorningCheckIn() {
  const router = useRouter();
  const [form, setForm] = useState<Form>({
    fatigue: 2, soreness: 2, stress: 2, motivation: 3, planned_session: null,
    illness_symptoms: false, pain_or_injury: false, travel_or_jet_lag: false,
  });
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
  const set = <K extends keyof Form,>(name: K, value: Form[K]) => setForm((current) => ({ ...current, [name]: value }));
  const toggleLimit = (movement: TrainingMovement, checked: boolean) => {
    setForm((current) => {
      const previous = current.limited_movements ?? [];
      return {
        ...current,
        limited_movements: checked ? Array.from(new Set([...previous, movement])) : previous.filter((item) => item !== movement),
      };
    });
  };

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
        setMessage(response.status === 400 && typeof result.error === "string"
          ? result.error
          : "Could not save your check-in. Try again.");
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Morning check-in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Enter today’s plan and how you feel to update your recommendation.</p>
        <fieldset className="space-y-3" disabled={!ready || saving}>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(scores) as (keyof typeof scores)[]).map((name) => (
              <label key={name} className="text-xs text-muted-foreground">
                {scores[name]}
                <select className={selectClass} value={form[name] ?? 2} onChange={(event) => set(name, Number(event.target.value))}>
                  {scale.map((value) => <option key={value} value={value}>{value} / 5</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Planned session
              <select className={selectClass} value={form.planned_session ?? ""} onChange={(event) => {
                const session = event.target.value as SessionCategory | "";
                setForm((current) => ({
                  ...current,
                  planned_session: session || null,
                  planned_movement: null,
                }));
              }}>
                <option value="">Not set</option>
                {Object.entries(sessions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {form.planned_session && form.planned_session !== "off" && (
              <label className="text-xs text-muted-foreground">
                Planned movement
                <select className={selectClass} value={form.planned_movement ?? ""} onChange={(event) =>
                  set("planned_movement", isTrainingMovement(event.target.value) ? event.target.value : null)}>
                  <option value="">Select movement</option>
                  {Object.entries(MOVEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={form.illness_symptoms} onChange={(event) => set("illness_symptoms", event.target.checked)} />
              Illness symptoms
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={form.pain_or_injury} onChange={(event) => {
                const checked = event.target.checked;
                setForm((current) => ({
                  ...current, pain_or_injury: checked,
                  pain_region: checked ? current.pain_region : null,
                  limited_movements: checked ? current.limited_movements : [],
                }));
              }} />
              Pain or injury
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={form.travel_or_jet_lag} onChange={(event) => set("travel_or_jet_lag", event.target.checked)} />
              Travel or jet lag
            </label>
          </div>

          {form.pain_or_injury && (
            <div className="space-y-3 rounded-md border p-3">
              <label className="block text-xs text-muted-foreground">
                Body region (optional)
                <select className={selectClass} value={form.pain_region ?? ""} onChange={(event) =>
                  set("pain_region", isPainRegion(event.target.value) ? event.target.value : null)}>
                  <option value="">Select region</option>
                  {Object.entries(PAIN_REGION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <fieldset className="space-y-2">
                <legend className="text-xs text-muted-foreground">Which movements does it limit today? Select all that apply.</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {(Object.keys(MOVEMENT_LABELS) as TrainingMovement[]).map((movement) => (
                    <label key={movement} className="flex items-center gap-1">
                      <input type="checkbox" checked={form.limited_movements?.includes(movement) ?? false}
                        onChange={(event) => toggleLimit(movement, event.target.checked)} />
                      {MOVEMENT_LABELS[movement]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
          <Button type="button" loading={saving} onClick={save}>Save check-in</Button>
        </fieldset>
        {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
