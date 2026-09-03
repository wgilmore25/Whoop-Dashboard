// GET /api/whoop/callback — exchanges WHOOP auth code for tokens and stores them
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/connect?error=whoop_auth_failed`);
  }

  // ── CSRF state verification ────────────────────────────────
  const cookieStore = await cookies();
  const savedState = cookieStore.get("__oauth_state_whoop")?.value;

  if (!state || !savedState || state !== savedState) {
    console.warn("[whoop/callback] CSRF state mismatch — aborting");
    const resp = NextResponse.redirect(`${baseUrl}/connect?error=whoop_auth_failed`);
    resp.cookies.delete("__oauth_state_whoop");
    return resp;
  }

  // ── Token exchange ─────────────────────────────────────────
  const tokenRes = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!,
      redirect_uri: process.env.WHOOP_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    const responseText = await tokenRes.text();
    console.error("[whoop/callback] Token exchange failed:", responseText);
    let reason = "whoop_token_failed";
    try {
      const payload = JSON.parse(responseText);
      if (payload.error === "invalid_client") reason = "whoop_invalid_client";
      if (payload.error === "invalid_grant") reason = "whoop_code_expired";
    } catch {
      // WHOOP occasionally returns plain text; keep the generic safe reason.
    }
    const resp = NextResponse.redirect(`${baseUrl}/connect?error=${reason}`);
    resp.cookies.delete("__oauth_state_whoop");
    return resp;
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_in } = tokens;

  if (!access_token || !expires_in) {
    console.error("[whoop/callback] Incomplete token response from WHOOP");
    const resp = NextResponse.redirect(`${baseUrl}/connect?error=whoop_token_failed`);
    resp.cookies.delete("__oauth_state_whoop");
    return resp;
  }

  // ── Fetch WHOOP user profile (for provider_user_id) ────────
  let whoopUserId = "";
  try {
    const profileRes = await fetch(`${WHOOP_API_BASE}/user/profile/basic`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      whoopUserId = String(profile.user_id ?? profile.id ?? "");
    }
  } catch (err) {
    // Non-critical — proceed without user ID; sync will still work
    console.warn("[whoop/callback] Could not fetch WHOOP profile:", err);
  }

  // ── Get current app user from session ─────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const resp = NextResponse.redirect(`${baseUrl}/login`);
    resp.cookies.delete("__oauth_state_whoop");
    return resp;
  }

  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  // ── Persist connection ─────────────────────────────────────
  // TODO: encrypt access_token and refresh_token before storing.
  //       Use a KMS or Supabase Vault in production.
  const serviceClient = createServiceClient();
  const { data: existingConnection } = await serviceClient
    .from("oauth_connections")
    .select("refresh_token_encrypted")
    .eq("user_id", user.id)
    .eq("provider", "whoop")
    .maybeSingle();
  const renewableToken = refresh_token ?? existingConnection?.refresh_token_encrypted ?? null;
  const { error: upsertErr } = await serviceClient
    .from("oauth_connections")
    .upsert(
      {
        user_id: user.id,
        provider: "whoop",
        provider_user_id: whoopUserId || null,
        access_token_encrypted: access_token,
        refresh_token_encrypted: renewableToken,
        expires_at: expiresAt,
        status: "connected",
        scope: tokens.scope ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

  if (upsertErr) {
    console.error("[whoop/callback] Failed to store connection:", upsertErr.message);
  }

  const resultParam = renewableToken ? "success=whoop" : "error=whoop_no_refresh_token";
  const resp = NextResponse.redirect(`${baseUrl}/connect?${resultParam}`);
  resp.cookies.delete("__oauth_state_whoop");
  return resp;
}
