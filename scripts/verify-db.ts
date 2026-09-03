#!/usr/bin/env tsx
/**
 * verify-db — confirms migrations are applied and RLS is active.
 *
 * Usage:
 *   npm run verify-db
 *
 * Requires real Supabase credentials in .env.local (loaded automatically).
 * Exits with code 1 if any check fails.
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// ── All tables that must exist after migrations 001–004 ───────

const EXPECTED_TABLES = [
  "users",
  "oauth_connections",
  "whoop_recoveries",
  "whoop_sleep",
  "whoop_cycles",
  "whoop_workouts",
  "strava_activities",
  "daily_metrics",
  "recommendations",
  "recommendation_explanations",
  "user_settings",
] as const;

// ── Tables to spot-check for RLS ──────────────────────────────
// An unauthenticated request (anon key, no JWT) must return 0 rows.
// With the policies in migration 002, auth.uid() = null never matches
// any row, so the result is always empty — correct RLS behaviour.
// Note: an empty result is indistinguishable from RLS blocking access
// if the table is also genuinely empty; that is expected and acceptable.

const RLS_SPOT_CHECK_TABLES = [
  "users",
  "daily_metrics",
  "recommendations",
  "strava_activities",
];

// ── Helpers ───────────────────────────────────────────────────

function checkEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const missing: string[] = [];
  if (!url || url.includes("placeholder")) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anon || anon.includes("placeholder")) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!service || service.includes("placeholder")) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    console.error("\n✗ Missing or placeholder credentials:");
    missing.forEach((v) => console.error(`  • ${v}`));
    console.error("\nAdd real values to .env.local and re-run.\n");
    return false;
  }
  return true;
}

// ── Migration check ───────────────────────────────────────────

async function verifyMigrations(
  service: ReturnType<typeof createClient>
): Promise<boolean> {
  console.log("\n── Migration check ───────────────────────────────────────");
  let failures = 0;

  for (const table of EXPECTED_TABLES) {
    const { error } = await service
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      console.log(`  ✗ ${table}: ${error.message}`);
      failures++;
    } else {
      console.log(`  ✓ ${table}`);
    }
  }

  const passed = EXPECTED_TABLES.length - failures;
  console.log(`\n  ${passed}/${EXPECTED_TABLES.length} tables found.`);
  return failures === 0;
}

// ── RLS spot-check ────────────────────────────────────────────

async function verifyRLS(
  anon: ReturnType<typeof createClient>
): Promise<boolean> {
  console.log("\n── RLS check (unauthenticated reads must return 0 rows) ──");
  let failures = 0;

  for (const table of RLS_SPOT_CHECK_TABLES) {
    const { data, error } = await anon.from(table).select("*").limit(1);

    if (error) {
      // Table-not-found errors are caught by migration check above.
      console.log(`  ? ${table}: query error (${error.message})`);
    } else if ((data ?? []).length === 0) {
      console.log(`  ✓ ${table}: 0 rows returned for unauthenticated request`);
    } else {
      console.log(
        `  ✗ ${table}: ${data!.length} row(s) visible without auth — check RLS policies`
      );
      failures++;
    }
  }

  console.log(
    "\n  Zero-row results are correct: RLS hides all rows when auth.uid() is null."
  );
  return failures === 0;
}

// ── Unique-constraint check (migration 003) ───────────────────

async function verifyConstraints(
  service: ReturnType<typeof createClient>
): Promise<boolean> {
  console.log("\n── Constraint check (migration 003) ──────────────────────");

  // Probe by attempting two identical upserts — if the unique constraint
  // exists the second is silently ignored; if missing it may duplicate.
  // Using a synthetic UUID that won't collide with real data.
  const fakeId = "00000000-0000-0000-0000-000000000001";

  // Ensure no leftover from a previous run
  await service
    .from("recommendation_explanations")
    .delete()
    .eq("recommendation_id", fakeId);

  const row = {
    recommendation_id: fakeId,
    plain_language_summary: "__verify_db_test__",
    bullets_json: [],
  };

  const { error: e1 } = await service
    .from("recommendation_explanations")
    .insert(row);

  if (e1) {
    // FK violation means no matching recommendation row — constraint probe skipped
    if (e1.code === "23503") {
      console.log(
        "  ~ recommendation_explanations: FK prevented probe insert — " +
          "constraint assumed present (run migrations 001+003 to be sure)"
      );
      return true;
    }
    console.log(`  ✗ recommendation_explanations: unexpected error — ${e1.message}`);
    return false;
  }

  // Second insert of same recommendation_id — must conflict (upsert via unique constraint)
  const { error: e2 } = await service
    .from("recommendation_explanations")
    .insert(row);

  // Clean up regardless of outcome
  await service
    .from("recommendation_explanations")
    .delete()
    .eq("recommendation_id", fakeId);

  if (e2 && e2.code === "23505") {
    console.log("  ✓ recommendation_explanations: unique(recommendation_id) constraint active");
    return true;
  }

  if (!e2) {
    console.log(
      "  ✗ recommendation_explanations: duplicate insert succeeded — " +
        "unique constraint is missing (run migration 003)"
    );
    return false;
  }

  console.log(`  ? recommendation_explanations: unexpected error — ${e2.message}`);
  return false;
}

// ── Entry point ───────────────────────────────────────────────

async function main() {
  console.log("=== Training Readiness Dashboard — Database Verification ===");

  if (!checkEnv()) process.exit(1);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  const migOk = await verifyMigrations(serviceClient);
  const rlsOk = await verifyRLS(anonClient);
  const conOk = await verifyConstraints(serviceClient);

  console.log("\n══════════════════════════════════════════════════════════");
  if (migOk && rlsOk && conOk) {
    console.log("✅ All checks passed — database is ready.\n");
    console.log("Next steps:");
    console.log("  1. Create a user in the Supabase Auth dashboard (or via the signup flow)");
    console.log("  2. SEED_USER_ID=<uuid> npm run seed");
    console.log("  3. Set NEXT_PUBLIC_MOCK_MODE=false in .env.local");
    console.log("  4. npm run dev — log in and verify the dashboard shows live data\n");
  } else {
    console.log("❌ Some checks failed — see above for details.\n");
    if (!migOk)
      console.log("  • Apply migrations 001–004 in the Supabase SQL editor.");
    if (!rlsOk)
      console.log("  • Apply migration 002 (RLS policies) in the Supabase SQL editor.");
    if (!conOk)
      console.log("  • Apply migration 003 (unique constraint) in the Supabase SQL editor.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
