-- ============================================================
-- Row-Level Security Policies
-- ============================================================
-- Users can only read/write their own rows across all tables.

-- Enable RLS on all tables
alter table public.users                      enable row level security;
alter table public.oauth_connections          enable row level security;
alter table public.whoop_recoveries           enable row level security;
alter table public.whoop_sleep                enable row level security;
alter table public.whoop_cycles               enable row level security;
alter table public.whoop_workouts             enable row level security;
alter table public.strava_activities          enable row level security;
alter table public.daily_metrics              enable row level security;
alter table public.recommendations            enable row level security;
alter table public.recommendation_explanations enable row level security;
alter table public.user_settings              enable row level security;

-- ── users ──────────────────────────────────────────────────
create policy "users: own row only"
  on public.users for all
  using (auth.uid() = id);

-- ── oauth_connections ──────────────────────────────────────
create policy "oauth_connections: own rows only"
  on public.oauth_connections for all
  using (auth.uid() = user_id);

-- ── whoop_recoveries ───────────────────────────────────────
create policy "whoop_recoveries: own rows only"
  on public.whoop_recoveries for all
  using (auth.uid() = user_id);

-- ── whoop_sleep ────────────────────────────────────────────
create policy "whoop_sleep: own rows only"
  on public.whoop_sleep for all
  using (auth.uid() = user_id);

-- ── whoop_cycles ───────────────────────────────────────────
create policy "whoop_cycles: own rows only"
  on public.whoop_cycles for all
  using (auth.uid() = user_id);

-- ── whoop_workouts ─────────────────────────────────────────
create policy "whoop_workouts: own rows only"
  on public.whoop_workouts for all
  using (auth.uid() = user_id);

-- ── strava_activities ──────────────────────────────────────
create policy "strava_activities: own rows only"
  on public.strava_activities for all
  using (auth.uid() = user_id);

-- ── daily_metrics ──────────────────────────────────────────
create policy "daily_metrics: own rows only"
  on public.daily_metrics for all
  using (auth.uid() = user_id);

-- ── recommendations ────────────────────────────────────────
create policy "recommendations: own rows only"
  on public.recommendations for all
  using (auth.uid() = user_id);

-- ── recommendation_explanations ────────────────────────────
-- Access via join to recommendations; user must own the parent recommendation
create policy "recommendation_explanations: own rows only"
  on public.recommendation_explanations for all
  using (
    exists (
      select 1 from public.recommendations r
      where r.id = recommendation_id
        and r.user_id = auth.uid()
    )
  );

-- ── user_settings ──────────────────────────────────────────
create policy "user_settings: own rows only"
  on public.user_settings for all
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Service-role bypass (used by server-side API routes)
-- The service role key bypasses RLS automatically in Supabase.
-- No additional policy needed; just use createClient with service key.
-- ────────────────────────────────────────────────────────────
