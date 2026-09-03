-- ============================================================
-- Training Readiness Dashboard — Initial Schema
-- ============================================================
-- Run this in Supabase SQL editor or via `supabase db push`

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- 1. users (mirrors Supabase auth.users; extended profile)
-- ────────────────────────────────────────────────────────────
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- 2. oauth_connections
-- ────────────────────────────────────────────────────────────
create table if not exists public.oauth_connections (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  provider                text not null check (provider in ('whoop', 'strava')),
  provider_user_id        text,
  access_token_encrypted  text,
  refresh_token_encrypted text,
  expires_at              timestamptz,
  scope                   text,
  -- status: disconnected | connected | token_expired | sync_error
  status                  text not null default 'disconnected',
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, provider)
);

-- ────────────────────────────────────────────────────────────
-- 3. whoop_recoveries
-- ────────────────────────────────────────────────────────────
create table if not exists public.whoop_recoveries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  cycle_id          text not null,
  score             numeric,
  hrv_rmssd         numeric,
  resting_hr        numeric,
  skin_temp         numeric,
  spo2              numeric,
  source_created_at timestamptz,
  raw_json          jsonb,
  created_at        timestamptz not null default now(),
  unique (user_id, cycle_id)
);

create index if not exists idx_whoop_recoveries_user_date
  on public.whoop_recoveries (user_id, source_created_at desc);

-- ────────────────────────────────────────────────────────────
-- 4. whoop_sleep
-- ────────────────────────────────────────────────────────────
create table if not exists public.whoop_sleep (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  sleep_id              text not null,
  start_time            timestamptz,
  end_time              timestamptz,
  sleep_seconds         integer,
  sleep_efficiency      numeric,
  sleep_performance_pct numeric,
  raw_json              jsonb,
  created_at            timestamptz not null default now(),
  unique (user_id, sleep_id)
);

create index if not exists idx_whoop_sleep_user_date
  on public.whoop_sleep (user_id, start_time desc);

-- ────────────────────────────────────────────────────────────
-- 5. whoop_cycles
-- ────────────────────────────────────────────────────────────
create table if not exists public.whoop_cycles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  cycle_id   text not null,
  start_time timestamptz,
  end_time   timestamptz,
  strain     numeric,
  avg_hr     numeric,
  max_hr     numeric,
  raw_json   jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, cycle_id)
);

create index if not exists idx_whoop_cycles_user_date
  on public.whoop_cycles (user_id, start_time desc);

-- ────────────────────────────────────────────────────────────
-- 6. whoop_workouts
-- ────────────────────────────────────────────────────────────
create table if not exists public.whoop_workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  workout_id text not null,
  sport_id   text,
  start_time timestamptz,
  end_time   timestamptz,
  strain     numeric,
  avg_hr     numeric,
  max_hr     numeric,
  raw_json   jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, workout_id)
);

create index if not exists idx_whoop_workouts_user_date
  on public.whoop_workouts (user_id, start_time desc);

-- ────────────────────────────────────────────────────────────
-- 7. strava_activities
-- ────────────────────────────────────────────────────────────
create table if not exists public.strava_activities (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  strava_activity_id  text not null,
  start_date          timestamptz,
  type                text,
  name                text,
  moving_time         integer,
  elapsed_time        integer,
  distance_m          numeric,
  elevation_gain_m    numeric,
  average_hr          numeric,
  max_hr              numeric,
  average_watts       numeric,
  weighted_avg_watts  numeric,
  kilojoules          numeric,
  trainer             boolean,
  commute             boolean,
  raw_json            jsonb,
  created_at          timestamptz not null default now(),
  unique (user_id, strava_activity_id)
);

create index if not exists idx_strava_activities_user_date
  on public.strava_activities (user_id, start_date desc);

-- ────────────────────────────────────────────────────────────
-- 8. daily_metrics
-- ────────────────────────────────────────────────────────────
create table if not exists public.daily_metrics (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users(id) on delete cascade,
  date                      date not null,
  sleep_hours               numeric,
  sleep_vs_baseline_pct     numeric,
  recovery_score            numeric,
  hrv_vs_baseline_pct       numeric,
  resting_hr_vs_baseline_pct numeric,
  whoop_strain              numeric,
  load_3d                   numeric,
  load_7d                   numeric,
  days_since_hiit           integer,
  days_since_long_session   integer,
  fatigue_flag              boolean not null default false,
  freshness_flag            boolean not null default false,
  computed_at               timestamptz,
  created_at                timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_daily_metrics_user_date
  on public.daily_metrics (user_id, date desc);

-- ────────────────────────────────────────────────────────────
-- 9. recommendations
-- ────────────────────────────────────────────────────────────
create table if not exists public.recommendations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  date               date not null,
  -- readiness_bucket: low | moderate | high
  readiness_bucket   text,
  -- recommended_session: off | recovery | zone2 | tempo | high_intensity | strength_only
  recommended_session text,
  intensity_cap      text,
  duration_min_low   integer,
  duration_min_high  integer,
  strength_allowed   boolean not null default false,
  confidence         numeric,
  rule_version       text,
  created_at         timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_recommendations_user_date
  on public.recommendations (user_id, date desc);

-- ────────────────────────────────────────────────────────────
-- 10. recommendation_explanations
-- ────────────────────────────────────────────────────────────
create table if not exists public.recommendation_explanations (
  id                      uuid primary key default gen_random_uuid(),
  recommendation_id       uuid not null references public.recommendations(id) on delete cascade,
  plain_language_summary  text,
  bullets_json            jsonb,
  llm_used                text,
  created_at              timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- user settings (training preferences)
-- ────────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade unique,
  training_mode   text not null default 'mixed' check (training_mode in ('endurance', 'mixed', 'strength_biased')),
  hiit_threshold_hr      integer not null default 165,
  long_session_minutes   integer not null default 75,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger trg_oauth_updated_at
  before update on public.oauth_connections
  for each row execute function public.set_updated_at();

create trigger trg_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();
