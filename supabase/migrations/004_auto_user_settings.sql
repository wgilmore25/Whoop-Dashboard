-- ============================================================
-- Migration 004: Auto-create user_settings row on new user insert
-- ============================================================
-- Ensures every user always has a settings row with sensible defaults
-- the moment their public.users row is created, even before they visit
-- the settings page. Uses SECURITY DEFINER so the trigger can write to
-- user_settings regardless of the calling session's role.

create or replace function public.handle_new_user_settings()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger trg_auto_user_settings
  after insert on public.users
  for each row execute function public.handle_new_user_settings();
