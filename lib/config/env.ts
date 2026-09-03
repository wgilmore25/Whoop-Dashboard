/**
 * Environment configuration and validation.
 *
 * isSupabaseConfigured() — true when all three Supabase env vars have
 *   real (non-placeholder) values. Used as the gate for mock-mode fallback.
 *
 * validateEnv() — call once at server startup to log warnings when config
 *   is incomplete. Returns { ok, warnings } so callers can decide how to surface.
 */

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return (
    url.startsWith("https://") &&
    !url.includes("placeholder") &&
    anon.length > 30 &&
    !anon.includes("placeholder") &&
    service.length > 30 &&
    !service.includes("placeholder")
  );
}

export function validateEnv(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Mock mode never needs Supabase credentials.
  if (process.env.NEXT_PUBLIC_MOCK_MODE === "true") {
    return { ok: true, warnings };
  }

  if (!isSupabaseConfigured()) {
    warnings.push(
      "Supabase credentials are missing or contain placeholder values. " +
        "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and " +
        "SUPABASE_SERVICE_ROLE_KEY in .env.local, or set NEXT_PUBLIC_MOCK_MODE=true " +
        "to use the built-in demo data instead."
    );
  }

  return { ok: isSupabaseConfigured(), warnings };
}
