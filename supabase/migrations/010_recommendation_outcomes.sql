-- Outcome records make algorithm versions auditable and backtestable.
create table if not exists public.recommendation_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  date date not null,
  chosen_session text check (chosen_session in ('off', 'recovery', 'zone2', 'tempo', 'high_intensity', 'strength_only')),
  completed_session boolean,
  session_rpe smallint check (session_rpe between 1 and 10),
  achieved_intended_intensity boolean,
  excessive_fatigue boolean not null default false,
  illness_or_pain boolean not null default false,
  appropriateness_rating smallint check (appropriateness_rating between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recommendation_id)
);
create index if not exists idx_recommendation_outcomes_user_date on public.recommendation_outcomes (user_id, date desc);
alter table public.recommendation_outcomes enable row level security;
create policy "recommendation_outcomes: own rows only" on public.recommendation_outcomes for all using (auth.uid() = user_id);
create trigger trg_recommendation_outcomes_updated_at before update on public.recommendation_outcomes for each row execute function public.set_updated_at();
