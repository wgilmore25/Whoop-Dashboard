-- ============================================================
-- Migration 007: HRV reliability and sleep continuity fields
-- ============================================================
-- HRV-CV is stored only when at least five valid nights are available.
-- Sleep continuity distinguishes total awake burden from a simple wake count.

alter table public.daily_metrics
  add column if not exists hrv_cv_7d numeric,
  add column if not exists hrv_cv_valid_nights integer,
  add column if not exists hrv_cv_confidence text
    check (hrv_cv_confidence in ('high', 'moderate', 'insufficient')),
  add column if not exists sleep_awake_minutes numeric,
  add column if not exists sleep_longest_awake_minutes numeric,
  add column if not exists sleep_continuity_confidence text
    check (sleep_continuity_confidence in ('high', 'moderate', 'insufficient'));
