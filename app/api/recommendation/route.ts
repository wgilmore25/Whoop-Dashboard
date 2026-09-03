// POST /api/recommendation — compute and store recommendation for today
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildRecommendation } from "@/lib/recommendations/engine";
import { generateExplanation } from "@/lib/explanations/generator";
import { normalizeDailyMetrics } from "@/lib/sync/normalization";
import type { MorningCheckIn } from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // Load enough history to establish a personal, not population-wide, context.
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const [recoveries, sleepRecords, activities, settings, checkIn] = await Promise.all([
    serviceClient
      .from("whoop_recoveries")
      .select("*")
      .eq("user_id", user.id)
      .gte("source_created_at", since)
      .order("source_created_at", { ascending: true })
      .then((r) => r.data ?? []),
    serviceClient
      .from("whoop_sleep")
      .select("*")
      .eq("user_id", user.id)
      .gte("start_time", since)
      .order("start_time", { ascending: true })
      .then((r) => r.data ?? []),
    serviceClient
      .from("strava_activities")
      .select("*")
      .eq("user_id", user.id)
      .gte("start_date", since)
      .order("start_date", { ascending: true })
      .then((r) => r.data ?? []),
    serviceClient
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then((r) => r.data),
    serviceClient
      .from("morning_checkins")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  // Normalize a 28-day window. The same normalized series drives the
  // recommendation, dashboard history, and personal baseline context.
  const now = new Date();
  const dailyMetricsRows = Array.from({ length: 28 }, (_, index) => {
    const daysAgo = 27 - index;
    const targetDate = new Date(now);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);

    return normalizeDailyMetrics({
      userId: user.id,
      targetDate,
      recoveries: recoveries as any,
      sleepRecords: sleepRecords as any,
      activities: activities as any,
      hiitHrThreshold: settings?.hiit_threshold_hr ?? 165,
      longSessionMinutes: settings?.long_session_minutes ?? 75,
    });
  });
  const metrics = dailyMetricsRows[dailyMetricsRows.length - 1];

  // Upsert the complete dashboard window.
  const { error: metricsUpsertError } = await serviceClient.from("daily_metrics").upsert(
    dailyMetricsRows,
    { onConflict: "user_id,date" }
  );

  if (metricsUpsertError) {
    console.error("[recommendation] daily_metrics upsert failed:", metricsUpsertError);
    return NextResponse.json(
      { error: "Failed to save daily metrics", details: metricsUpsertError.message },
      { status: 500 }
    );
  }

  const historical = dailyMetricsRows.slice(0, -1);
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return null;
    const center = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2;
  };
  const baseline = {
    valid_days: historical.filter((row) => row.recovery_score != null || row.sleep_hours != null || row.load_7d != null).length,
    recovery_median: median(historical.map((row) => row.recovery_score).filter((value): value is number => value != null)),
    load_7d_median: median(historical.map((row) => row.load_7d).filter((value): value is number => value != null)),
  };
  const recommendation = buildRecommendation({
    metrics,
    baseline,
    checkIn: (checkIn as MorningCheckIn | null) ?? null,
    trainingMode: settings?.training_mode ?? "mixed",
  });

  // Upsert recommendation row
  const { data: recRow } = await serviceClient
    .from("recommendations")
    .upsert(
      {
        user_id: user.id,
        date: today,
        readiness_bucket: recommendation.readiness_bucket,
        recommended_session: recommendation.recommended_session,
        intensity_cap: recommendation.intensity_cap,
        duration_min_low: recommendation.duration_min_low,
        duration_min_high: recommendation.duration_min_high,
        strength_allowed: recommendation.strength_allowed,
        confidence: recommendation.confidence,
        rule_version: recommendation.rule_version,
      },
      { onConflict: "user_id,date" }
    )
    .select()
    .single();

  // Generate deterministic explanation
  const explanation = generateExplanation(recommendation);

  if (recRow) {
    await serviceClient.from("recommendation_explanations").upsert(
      {
        recommendation_id: recRow.id,
        plain_language_summary: explanation.summary,
        bullets_json: explanation.bullets,
        llm_used: null,
      },
      { onConflict: "recommendation_id" }
    );
  }

  return NextResponse.json({ recommendation, explanation, metrics, baseline });
}
