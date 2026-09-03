import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const sessions = ["off", "recovery", "zone2", "tempo", "high_intensity", "strength_only"];

async function getUser() {
  const supabase = await createClient();
  return (await supabase.auth.getUser()).data.user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = createServiceClient();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const [recommendations, outcomes, metrics] = await Promise.all([
    service.from("recommendations").select("id,date,recommended_session,readiness_bucket,rule_version").eq("user_id", user.id).gte("date", since).order("date", { ascending: false }),
    service.from("recommendation_outcomes").select("*").eq("user_id", user.id).gte("date", since).order("date", { ascending: false }),
    service.from("daily_metrics").select("date,recovery_score").eq("user_id", user.id).gte("date", since).order("date", { ascending: true }),
  ]);
  if (recommendations.error || outcomes.error || metrics.error) return NextResponse.json({ error: recommendations.error?.message ?? outcomes.error?.message ?? metrics.error?.message }, { status: 500 });
  // Supabase is intentionally untyped in this project until generated schema
  // types are added; keep the API boundary explicit here.
  const recoveryByDate = Object.fromEntries((metrics.data ?? []).map((row: any) => [row.date, row.recovery_score]));
  const records = (recommendations.data ?? []).map((rec: any) => {
    const outcome = (outcomes.data ?? []).find((entry: any) => entry.recommendation_id === rec.id) ?? null;
    const next = new Date(`${rec.date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    const nextRecovery = recoveryByDate[next.toISOString().slice(0, 10)] ?? null;
    const falseGreenSignal = ["tempo", "high_intensity"].includes(rec.recommended_session) && Boolean(outcome && (outcome.excessive_fatigue || outcome.illness_or_pain || (nextRecovery != null && nextRecovery < 40)));
    const falseRedSignal = ["off", "recovery"].includes(rec.recommended_session) && Boolean(outcome && outcome.appropriateness_rating != null && outcome.appropriateness_rating <= 2 && !outcome.excessive_fatigue && !outcome.illness_or_pain);
    return { ...rec, outcome, next_day_recovery: nextRecovery, false_green_signal: falseGreenSignal, false_red_signal: falseRedSignal };
  });
  const completed = records.filter((record: any) => record.outcome);
  return NextResponse.json({ records, summary: { recommendations: records.length, logged_outcomes: completed.length, false_green_signals: records.filter((record: any) => record.false_green_signal).length, false_red_signals: records.filter((record: any) => record.false_red_signal).length } });
}

export async function PUT(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.recommendation_id !== "string" || typeof body.date !== "string") return NextResponse.json({ error: "A recommendation and date are required." }, { status: 400 });
  if (body.chosen_session != null && !sessions.includes(body.chosen_session)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  const validScore = (value: unknown, max: number) => value == null || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max);
  if (!validScore(body.session_rpe, 10) || !validScore(body.appropriateness_rating, 5)) return NextResponse.json({ error: "Use RPE 1–10 and appropriateness 1–5." }, { status: 400 });
  const service = createServiceClient();
  const { data: recommendation } = await service.from("recommendations").select("id").eq("id", body.recommendation_id).eq("user_id", user.id).maybeSingle();
  if (!recommendation) return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
  const { error } = await service.from("recommendation_outcomes").upsert({ user_id: user.id, recommendation_id: body.recommendation_id, date: body.date, chosen_session: body.chosen_session ?? null, completed_session: body.completed_session ?? null, session_rpe: body.session_rpe ?? null, achieved_intended_intensity: body.achieved_intended_intensity ?? null, excessive_fatigue: Boolean(body.excessive_fatigue), illness_or_pain: Boolean(body.illness_or_pain), appropriateness_rating: body.appropriateness_rating ?? null, notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null, updated_at: new Date().toISOString() }, { onConflict: "recommendation_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
