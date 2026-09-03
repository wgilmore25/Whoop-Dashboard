// GET /api/whoop/connect — initiates WHOOP OAuth 2.0 authorization flow
// Scopes: https://developer.whoop.com/docs/developing/oauth
import { NextResponse } from "next/server";

const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";

export async function GET() {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "WHOOP credentials not configured. See .env.example." },
      { status: 500 }
    );
  }

  // Generate a random state value for CSRF protection.
  // Stored in an httpOnly cookie; verified in the callback before accepting tokens.
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    // `offline` is required for WHOOP to issue renewable refresh tokens.
    scope: "offline read:recovery read:sleep read:workout read:cycles read:body_measurement",
    state,
  });

  const response = NextResponse.redirect(`${WHOOP_AUTH_URL}?${params}`);
  response.headers.set("Cache-Control", "no-store");

  // Short-lived httpOnly cookie — expires after 10 minutes
  response.cookies.set("__oauth_state_whoop", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
