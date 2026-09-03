-- Personal workload context and athlete-reported inputs.
alter table public.daily_metrics
  add column if not exists load_method text check (load_method in ('power_kj', 'power_estimate', 'hr_proxy', 'duration_proxy', 'mixed')),
  add column if not exists load_confidence text check (load_confidence in ('high', 'moderate', 'insufficient')),
  add column if not exists load_status text check (load_status in ('stable', 'rising', 'unusually_high', 'insufficient_history')),
  add column if not exists load_7d_vs_baseline_pct numeric;

create table if not exists public.morning_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  fatigue smallint check (fatigue between 1 and 5),
  soreness smallint check (soreness between 1 and 5),
  stress smallint check (stress between 1 and 5),
  motivation smallint check (motivation between 1 and 5),
  illness_symptoms boolean not null default false,
  pain_or_injury boolean not null default false,
  travel_or_jet_lag boolean not null default false,
  planned_session text check (planned_session in ('off', 'recovery', 'zone2', 'tempo', 'high_intensity', 'strength_only')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table public.morning_checkins enable row level security;
create policy "morning_checkins: own rows only" on public.morning_checkins for all using (auth.uid() = user_id);
create trigger trg_morning_checkins_updated_at before update on public.morning_checkins for each row execute function public.set_updated_at();
