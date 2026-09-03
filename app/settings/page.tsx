"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TrainingMode } from "@/lib/types";

const TRAINING_MODES: { value: TrainingMode; label: string; desc: string }[] = [
  {
    value: "endurance",
    label: "Endurance-focused",
    desc: "Prioritizes aerobic development. High-intensity days require extra recovery.",
  },
  {
    value: "mixed",
    label: "Mixed (default)",
    desc: "Balances endurance and strength. General-purpose for most athletes.",
  },
  {
    value: "strength_biased",
    label: "Strength-biased",
    desc: "Strength sessions are primary. Endurance work treated as supplemental.",
  },
];

export default function SettingsPage() {
  const isMock = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

  const [trainingMode, setTrainingMode] = useState<TrainingMode>("mixed");
  const [hiitThreshold, setHiitThreshold] = useState(165);
  const [longSessionMin, setLongSessionMin] = useState(75);
  const [loading, setLoading] = useState(!isMock);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load current settings from API (skipped in mock mode)
  useEffect(() => {
    if (isMock) return;

    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setTrainingMode(data.training_mode ?? "mixed");
          setHiitThreshold(data.hiit_threshold_hr ?? 165);
          setLongSessionMin(data.long_session_minutes ?? 75);
        }
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [isMock]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    if (isMock) {
      // Mock mode: simulate save without hitting the API
      await new Promise((r) => setTimeout(r, 400));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          training_mode: trainingMode,
          hiit_threshold_hr: hiitThreshold,
          long_session_minutes: longSessionMin,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error ?? "Save failed — please try again.");
      }
    } catch {
      setSaveError("Save failed — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-6 max-w-2xl animate-pulse">
          <div className="h-8 w-32 bg-secondary rounded" />
          <div className="h-48 bg-secondary rounded-xl" />
          <div className="h-40 bg-secondary rounded-xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure your training preferences and recommendation parameters.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Training mode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Training Mode</CardTitle>
              <CardDescription>
                Influences how the recommendation engine weights recovery vs. load.
                Takes effect on the next recommendation computation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {TRAINING_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    trainingMode === mode.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="training_mode"
                    value={mode.value}
                    checked={trainingMode === mode.value}
                    onChange={() => setTrainingMode(mode.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-sm">{mode.label}</p>
                    <p className="text-xs text-muted-foreground">{mode.desc}</p>
                  </div>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Thresholds */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session Thresholds</CardTitle>
              <CardDescription>
                Used by the normalization pipeline to classify session types.
                Changes apply to the next sync.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  HIIT heart rate threshold (bpm)
                </label>
                <input
                  type="number"
                  min={130}
                  max={200}
                  value={hiitThreshold}
                  onChange={(e) => setHiitThreshold(Number(e.target.value))}
                  className="w-32 rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Sessions where max HR exceeds this are classified as high-intensity.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Long session threshold (minutes)
                </label>
                <input
                  type="number"
                  min={30}
                  max={240}
                  value={longSessionMin}
                  onChange={(e) => setLongSessionMin(Number(e.target.value))}
                  className="w-32 rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Sessions longer than this count toward "days since long session".
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Basic account information.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Name, email, and password management are handled via Supabase Auth.
                Visit your Supabase project dashboard to update account details.
              </p>
            </CardContent>
          </Card>

          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
              {saveError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>
              Save settings
            </Button>
            {saved && (
              <span className="text-sm text-emerald-600 font-medium">Saved!</span>
            )}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
