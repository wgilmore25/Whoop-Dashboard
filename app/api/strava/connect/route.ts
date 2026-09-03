// GET /api/strava/connect — initiates Strava OAuth 2.0 authorization flow
import { NextResponse } from "next/server";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Strava credentials not configured. See .env.example." },
      { status: 500 }
    );
  }

  // Generate a random state value for CSRF protection.
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  });

  const response = NextResponse.redirect(`${STRAVA_AUTH_URL}?${params}`);

  response.cookies.set("__oauth_state_strava", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
