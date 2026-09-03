-- ============================================================
-- Migration 003: Unique constraint on recommendation_explanations
-- ============================================================
-- POST /api/recommendation does:
--   .upsert({ recommendation_id, ... }, { onConflict: "recommendation_id" })
-- Without a unique index on recommendation_id that upsert errors at runtime.
-- This migration adds the required constraint.

alter table public.recommendation_explanations
  add constraint recommendation_explanations_recommendation_id_unique
  unique (recommendation_id);
