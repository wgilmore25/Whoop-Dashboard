-- Athlete-specific meaningful-change thresholds. Values are percentage changes
-- derived from 0.2 × the athlete's 28-day within-athlete SD; null until 21
-- valid prior days exist.
alter table public.daily_metrics
  add column if not exists hrv_swc_pct numeric,
  add column if not exists resting_hr_swc_pct numeric,
  add column if not exists sleep_swc_pct numeric;
