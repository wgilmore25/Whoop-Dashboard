-- ============================================================
-- Migration 005: Auto-create public.users row on Supabase Auth signup
-- ============================================================
-- When a new user registers via Supabase Auth (signUp, OAuth, magic link),
-- a row is created in auth.users. Without this trigger there is NO corresponding
-- row in public.users, which causes FK violations on every table in the app
-- (whoop_recoveries, strava_activities, daily_metrics, etc.).
--
-- The trigger copies id + email from auth.users → public.users immediately.
-- Uses SECURITY DEFINER so it runs with owner privileges regardless of the
-- caller's role (required because auth.users is in a separate schema).

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Fire after every new row in auth.users (covers email/password, OAuth, magic link)
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ── Back-fill existing auth users who don't have a public.users row ──────
-- Safe to run multiple times; ON CONFLICT DO NOTHING is idempotent.
insert into public.users (id, email)
select id, email from auth.users
on conflict (id) do nothing;
