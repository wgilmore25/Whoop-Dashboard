#!/usr/bin/env tsx
/**
 * Seed script — inserts demo data into Supabase for development / verification.
 *
 * Usage:
 *   SEED_USER_ID=<uuid> npm run seed
 *
 * Prerequisites:
 *   1. Run all four migrations in the Supabase SQL editor.
 *   2. Create a user via the Supabase Auth dashboard (Authentication → Users →
 *      "Add user"). Copy the UUID — that becomes SEED_USER_ID.
 *   3. Ensure .env.local has real (non-placeholder) Supabase credentials.
 *
 * In mock mode (NEXT_PUBLIC_MOCK_MODE=true) the app renders without this.
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import {
  mockWhoopRecoveries,
  mockWhoopSleep,
  mockStravaActivities,
  mockTrendData,
} from "../lib/mock-data";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // service role bypasses RLS
);

// ── Demo user ─────────────────────────────────────────────────
// Set this to the UUID of your test user (created via Supabase Auth UI or API)
const DEMO_USER_ID = process.env.SEED_USER_ID ?? "REPLACE_WITH_YOUR_USER_UUID";

async function seedUser() {
  const { error } = await supabase.from("users").upsert({
    id: DEMO_USER_ID,
    email: "demo@example.com",
  }, { onConflict: "id" });

  if (error) throw new Error(`Failed to seed user: ${error.message}`);
  console.log("✓ User upserted");
}

async function seedConnections() {
  const connections = [
    {
      user_id: DEMO_USER_ID,
      provider: "whoop",
      provider_user_id: "whoop-demo-123",
      status: "connected",
      last_synced_at: new Date().toISOString(),
    },
    {
      user_id: DEMO_USER_ID,
      provider: "strava",
      provider_user_id: "strava-demo-456",
      status: "connected",
      last_synced_at: new Date().toISOString(),
    },
  ];

  const { error } = await supabase
    .from("oauth_connections")
    .upsert(connections, { onConflict: "user_id,provider" });

  if (error) throw new Error(`Failed to seed connections: ${error.message}`);
  console.log("✓ OAuth connections upserted");
}

async function seedWhoopRecoveries() {
  const rows = mockWhoopRecoveries.map(({ id: _, ...r }) => ({
    ...r,
    user_id: DEMO_USER_ID,
  }));

  const { error } = await supabase
    .from("whoop_recoveries")
    .upsert(rows, { onConflict: "user_id,cycle_id" });

  if (error) throw new Error(`Failed to seed recoveries: ${error.message}`);
  console.log(`✓ Seeded ${rows.length} WHOOP recoveries`);
}

async function seedWhoopSleep() {
  const rows = mockWhoopSleep.map(({ id: _, ...s }) => ({
    ...s,
    user_id: DEMO_USER_ID,
  }));

  const { error } = await supabase
    .from("whoop_sleep")
    .upsert(rows, { onConflict: "user_id,sleep_id" });

  if (error) throw new Error(`Failed to seed sleep: ${error.message}`);
  console.log(`✓ Seeded ${rows.length} WHOOP sleep records`);
}

async function seedStravaActivities() {
  const rows = mockStravaActivities.map(({ id: _, ...a }) => ({
    ...a,
    user_id: DEMO_USER_ID,
  }));

  const { error } = await supabase
    .from("strava_activities")
    .upsert(rows, { onConflict: "user_id,strava_activity_id" });

  if (error) throw new Error(`Failed to seed activities: ${error.message}`);
  console.log(`✓ Seeded ${rows.length} Strava activities`);
}

async function seedDailyMetrics() {
  const rows = mockTrendData.map((t) => ({
    user_id: DEMO_USER_ID,
    date: t.date,
    recovery_score: t.recovery_score,
    sleep_hours: t.sleep_hours,
    load_3d: t.load_3d,
    fatigue_flag: false,
    freshness_flag: false,
    computed_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("daily_metrics")
    .upsert(rows, { onConflict: "user_id,date" });

  if (error) throw new Error(`Failed to seed daily_metrics: ${error.message}`);
  console.log(`✓ Seeded ${rows.length} daily_metrics rows`);
}

async function seedUserSettings() {
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: DEMO_USER_ID,
      training_mode: "mixed",
      hiit_threshold_hr: 165,
      long_session_minutes: 75,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(`Failed to seed user_settings: ${error.message}`);
  console.log("✓ User settings upserted");
}

async function seedRecommendations() {
  const rows = mockTrendData
    .filter((t) => t.recommended_session)
    .map((t) => ({
      user_id: DEMO_USER_ID,
      date: t.date,
      recommended_session: t.recommended_session,
      readiness_bucket: (t.recovery_score ?? 50) >= 67 ? "high" : (t.recovery_score ?? 50) >= 34 ? "moderate" : "low",
      strength_allowed: false,
      rule_version: "v1",
    }));

  const { error } = await supabase
    .from("recommendations")
    .upsert(rows, { onConflict: "user_id,date" });

  if (error) throw new Error(`Failed to seed recommendations: ${error.message}`);
  console.log(`✓ Seeded ${rows.length} recommendations`);
}

async function main() {
  if (DEMO_USER_ID === "REPLACE_WITH_YOUR_USER_UUID") {
    console.error(
      "⚠ Set SEED_USER_ID env var or replace DEMO_USER_ID in this script."
    );
    process.exit(1);
  }

  console.log(`\nSeeding demo data for user: ${DEMO_USER_ID}\n`);
  await seedUser();
  await seedUserSettings();
  await seedConnections();
  await seedWhoopRecoveries();
  await seedWhoopSleep();
  await seedStravaActivities();
  await seedDailyMetrics();
  await seedRecommendations();
  console.log("\n✅ Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
