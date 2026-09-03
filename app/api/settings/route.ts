// GET /api/settings  — returns current user_settings row (or defaults)
// PUT /api/settings  — upserts training_mode, hiit_threshold_hr, long_session_minutes
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const DEFAULTS = {
  training_mode: "mixed",
  hiit_threshold_hr: 165,
  long_session_minutes: 75,
} as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("user_settings")
    .select("training_mode, hiit_threshold_hr, long_session_minutes")
    .eq("user_id", user.id)
    .maybeSingle();

  // Return defaults when no settings row exists yet (handled by migration 004
  // trigger, but be defensive here in case the user predates it)
  return NextResponse.json(data ?? DEFAULTS);
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const training_mode = body.training_mode ?? DEFAULTS.training_mode;
  const hiit_threshold_hr = Number(body.hiit_threshold_hr ?? DEFAULTS.hiit_threshold_hr);
  const long_session_minutes = Number(body.long_session_minutes ?? DEFAULTS.long_session_minutes);

  // Validate training_mode
  if (!["endurance", "mixed", "strength_biased"].includes(training_mode)) {
    return NextResponse.json({ error: "Invalid training_mode" }, { status: 400 });
  }

  // Use service client to bypass RLS on write (user owns this row — safe)
  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("user_settings").upsert(
    {
      user_id: user.id,
      training_mode,
      hiit_threshold_hr,
      long_session_minutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
