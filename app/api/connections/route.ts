// GET /api/connections — returns WHOOP and Strava connection status for current user
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("oauth_connections")
    .select("id, user_id, provider, provider_user_id, status, last_synced_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  return NextResponse.json({
    whoop: rows.find((c) => c.provider === "whoop") ?? null,
    strava: rows.find((c) => c.provider === "strava") ?? null,
  });
}
