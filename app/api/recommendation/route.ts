import { NextResponse } from "next/server";
import { refreshRecommendation } from "@/lib/recommendations/refresh";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await refreshRecommendation(user.id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
