// GET /api/strava/callback — exchanges Strava auth code for tokens and stores them
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/connect?error=strava_auth_failed`);
  }

  // ── CSRF state verification ────────────────────────────────
  const cookieStore = await cookies();
  const savedState = cookieStore.get("__oauth_state_strava")?.value;

  if (!state || !savedState || state !== savedState) {
    console.warn("[strava/callback] CSRF state mismatch — aborting");
    const resp = NextResponse.redirect(`${baseUrl}/connect?error=strava_auth_failed`);
    resp.cookies.delete("__oauth_state_strava");
    return resp;
  }

  // ── Token exchange ─────────────────────────────────────────
  const tokenRes = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("[strava/callback] Token exchange failed:", await tokenRes.text());
    const resp = NextResponse.redirect(`${baseUrl}/connect?error=strava_token_failed`);
    resp.cookies.delete("__oauth_state_strava");
    return resp;
  }

  const tokens = await tokenRes.json();

  // ── Get current app user from session ─────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const resp = NextResponse.redirect(`${baseUrl}/login`);
    resp.cookies.delete("__oauth_state_strava");
    return resp;
  }

  // Strava token response uses expires_at (unix epoch), not expires_in
  const expiresAt = new Date(tokens.expires_at * 1000).toISOString();

  // ── Persist connection ─────────────────────────────────────
  // TODO: encrypt access_token and refresh_token before storing.
  const serviceClient = createServiceClient();
  const { error: upsertErr } = await serviceClient
    .from("oauth_connections")
    .upsert(
      {
        user_id: user.id,
        provider: "strava",
        provider_user_id: String(tokens.athlete?.id ?? ""),
        access_token_encrypted: tokens.access_token,
        refresh_token_encrypted: tokens.refresh_token,
        expires_at: expiresAt,
        status: "connected",
        scope: "read,activity:read_all",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

  if (upsertErr) {
    console.error("[strava/callback] Failed to store connection:", upsertErr.message);
  }

  const resp = NextResponse.redirect(`${baseUrl}/connect?success=strava`);
  resp.cookies.delete("__oauth_state_strava");
  return resp;
}
