-- ============================================================
-- Migration 006: Science-grounded daily_metrics columns
-- ============================================================
-- Adds fields computed by the updated normalization pipeline:
--   load_28d        — 28-day cumulative training load (kJ-equivalent)
--   acwr            — Acute:Chronic Workload Ratio (Gabbett et al.)
--                     = load_7d / (load_28d / 4); target zone 0.8–1.3
--   hrv_trend       — Direction of recent HRV change (Plews et al. 2013)
--                     derived from slope of last 5 readings; ±5% threshold
--   sleep_quality_score — sleep_hours × sleep_efficiency (0–1)
--                     accounts for inefficient long sleep vs short deep sleep
--   consecutive_low_recovery_days — days ending today with recovery < 50
--                     used to detect overreaching patterns
--   training_monotony — Foster's monotony: mean / SD of 7-day daily loads
--                     high monotony (>2.0) = insufficient load variation

alter table public.daily_metrics
  add column if not exists load_28d                     numeric,
  add column if not exists acwr                         numeric,
  add column if not exists hrv_trend                    text
    check (hrv_trend in ('rising', 'falling', 'flat')),
  add column if not exists sleep_quality_score          numeric,
  add column if not exists consecutive_low_recovery_days integer,
  add column if not exists training_monotony            numeric;
