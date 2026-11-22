import { NextRequest, NextResponse } from "next/server";
import { refreshRecommendation } from "@/lib/recommendations/refresh";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const today = () => new Date().toISOString().slice(0, 10);
const sessions = ["off", "recovery", "zone2", "tempo", "high_intensity", "strength_only"];

async function currentUser() {
  const supabase = await createClient();
  return (await supabase.auth.getUser()).data.user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createServiceClient()
    .from("morning_checkins")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", today())
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}

export async function PUT(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid check-in." }, { status: 400 });
  }
  const score = (value: unknown) => value == null || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5);
  if (![body.fatigue, body.soreness, body.stress, body.motivation].every(score)) {
    return NextResponse.json({ error: "Scores must be whole numbers from 1 to 5." }, { status: 400 });
  }
  if (body.planned_session != null && !sessions.includes(body.planned_session)) {
    return NextResponse.json({ error: "Invalid planned session." }, { status: 400 });
  }
  const savedAt = new Date();
  const { error } = await createServiceClient().from("morning_checkins").upsert({
    user_id: user.id,
    date: savedAt.toISOString().slice(0, 10),
    fatigue: body.fatigue ?? null,
    soreness: body.soreness ?? null,
    stress: body.stress ?? null,
    motivation: body.motivation ?? null,
    illness_symptoms: Boolean(body.illness_symptoms),
    pain_or_injury: Boolean(body.pain_or_injury),
    travel_or_jet_lag: Boolean(body.travel_or_jet_lag),
    planned_session: body.planned_session ?? null,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
    updated_at: savedAt.toISOString(),
  }, { onConflict: "user_id,date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const result = await refreshRecommendation(user.id);
    return NextResponse.json({ ok: true, recommendation_updated: !result.error });
  } catch (error) {
    console.error("[check-in] Saved check-in but could not refresh recommendation:", error);
    return NextResponse.json({ ok: true, recommendation_updated: false });
  }
}
