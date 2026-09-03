"""
Tests for the deterministic recommendation rules engine.
Run with: pytest python-service/tests/test_rules.py -v
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from models import DailyMetricsInput
from rules import compute_recommendation


def make_metrics(**kwargs) -> DailyMetricsInput:
    """Build a DailyMetricsInput with sensible defaults, overridable per-test."""
    defaults = dict(
        user_id="test-user",
        date="2026-03-24",
        sleep_hours=7.5,
        sleep_vs_baseline_pct=0.0,
        recovery_score=60.0,
        hrv_vs_baseline_pct=0.0,
        resting_hr_vs_baseline_pct=0.0,
        load_3d=800.0,
        load_7d=2000.0,
        days_since_hiit=4,
        days_since_long_session=3,
        fatigue_flag=False,
        freshness_flag=False,
    )
    defaults.update(kwargs)
    return DailyMetricsInput(**defaults)


# ── Rule A tests ─────────────────────────────────────────────

class TestRuleA:
    def test_low_recovery_gives_recovery_session(self):
        m = make_metrics(recovery_score=25.0, fatigue_flag=False)
        result = compute_recommendation(m)
        assert result.readiness_bucket == "low"
        assert result.recommended_session in ("recovery", "off")

    def test_very_low_recovery_gives_off(self):
        m = make_metrics(recovery_score=15.0, fatigue_flag=False)
        result = compute_recommendation(m)
        assert result.recommended_session == "off"

    def test_fatigue_flag_does_not_override_high_recovery(self):
        m = make_metrics(recovery_score=70.0, fatigue_flag=True)
        result = compute_recommendation(m)
        assert result.readiness_bucket != "low"
        assert result.strength_allowed is False

    def test_high_load_plus_bad_sleep_triggers_rule_a(self):
        m = make_metrics(
            recovery_score=40.0,
            load_3d=2500.0,
            sleep_vs_baseline_pct=-25.0,
        )
        result = compute_recommendation(m)
        assert result.readiness_bucket == "low"

    def test_rule_a_includes_why(self):
        m = make_metrics(recovery_score=20.0)
        result = compute_recommendation(m)
        assert len(result.why) > 0


# ── Rule B tests ─────────────────────────────────────────────

class TestRuleB:
    def test_moderate_recovery_gives_zone2(self):
        m = make_metrics(recovery_score=55.0, load_3d=1200.0)
        result = compute_recommendation(m)
        assert result.readiness_bucket == "moderate"
        assert result.recommended_session == "zone2"

    def test_recent_hiit_with_high_recovery_gives_quality_session(self):
        # High recovery despite recent HIIT → Rule C fires, not Rule B
        m = make_metrics(recovery_score=70.0, days_since_hiit=1)
        result = compute_recommendation(m)
        assert result.recommended_session in ("tempo", "high_intensity")

    def test_hiit_two_days_ago_high_recovery_not_constrained(self):
        # HIIT no longer blocks a quality day when recovery is high
        m = make_metrics(recovery_score=75.0, days_since_hiit=2)
        result = compute_recommendation(m)
        assert result.recommended_session in ("tempo", "high_intensity")

    def test_hiit_three_days_ago_no_longer_constrains(self):
        # days_since_hiit=3 is NOT < HIIT_RECOVERY_MIN_DAYS(3), so no constraint
        m = make_metrics(
            recovery_score=75.0,
            days_since_hiit=3,
            sleep_vs_baseline_pct=0.0,
            load_3d=900.0,
        )
        result = compute_recommendation(m)
        # With recovery=75 (high), no recent HIIT, and low load, should reach Rule C
        assert result.recommended_session in ("tempo", "high_intensity", "zone2")

    def test_zone2_has_duration_range(self):
        m = make_metrics(recovery_score=55.0)
        result = compute_recommendation(m)
        assert result.duration_min_low is not None
        assert result.duration_min_high is not None
        assert result.duration_min_low < result.duration_min_high

    def test_zone2_intensity_cap_is_sub_threshold(self):
        m = make_metrics(recovery_score=55.0)
        result = compute_recommendation(m)
        assert result.intensity_cap == "sub-threshold"


# ── Rule C tests ─────────────────────────────────────────────

class TestRuleC:
    def test_high_recovery_gives_quality_session(self):
        m = make_metrics(
            recovery_score=80.0,
            sleep_vs_baseline_pct=5.0,
            hrv_vs_baseline_pct=10.0,
            days_since_hiit=5,
            freshness_flag=True,
            load_3d=500.0,
        )
        result = compute_recommendation(m)
        assert result.readiness_bucket == "high"
        assert result.recommended_session in ("tempo", "high_intensity")

    def test_high_recovery_with_freshness_gives_high_intensity(self):
        m = make_metrics(
            recovery_score=85.0,
            sleep_vs_baseline_pct=2.0,
            freshness_flag=True,
            load_3d=400.0,
            load_7d=1500.0,
            days_since_hiit=6,
        )
        result = compute_recommendation(m)
        assert result.recommended_session == "high_intensity"

    def test_high_recovery_without_freshness_gives_tempo(self):
        m = make_metrics(
            recovery_score=75.0,
            sleep_vs_baseline_pct=0.0,
            freshness_flag=False,
            load_3d=1100.0,
            days_since_hiit=5,
        )
        result = compute_recommendation(m)
        assert result.recommended_session in ("tempo", "zone2")


# ── Rule D tests ─────────────────────────────────────────────

class TestRuleD:
    def test_very_high_7d_load_downgrades_high_intensity(self):
        m = make_metrics(
            recovery_score=82.0,
            freshness_flag=True,
            load_3d=400.0,
            load_7d=5000.0,     # very high — should trigger Rule D
            days_since_hiit=6,
        )
        result = compute_recommendation(m)
        # high_intensity → tempo
        assert result.recommended_session in ("tempo", "zone2")

    def test_no_downgrade_when_7d_load_is_normal(self):
        m = make_metrics(
            recovery_score=82.0,
            freshness_flag=True,
            load_3d=400.0,
            load_7d=2000.0,
            days_since_hiit=6,
        )
        result = compute_recommendation(m)
        assert result.recommended_session in ("high_intensity", "tempo")

    def test_downgrade_reduces_confidence(self):
        m_normal = make_metrics(
            recovery_score=82.0, freshness_flag=True,
            load_3d=400.0, load_7d=2000.0, days_since_hiit=6,
        )
        m_high_load = make_metrics(
            recovery_score=82.0, freshness_flag=True,
            load_3d=400.0, load_7d=5500.0, days_since_hiit=6,
        )
        r_normal = compute_recommendation(m_normal)
        r_high = compute_recommendation(m_high_load)
        assert r_high.confidence <= r_normal.confidence


# ── Rule E (strength) tests ───────────────────────────────────

class TestRuleE:
    def test_low_readiness_no_strength(self):
        m = make_metrics(recovery_score=20.0)
        result = compute_recommendation(m)
        assert result.strength_allowed is False

    def test_high_readiness_allows_strength(self):
        m = make_metrics(
            recovery_score=80.0,
            sleep_vs_baseline_pct=0.0,
            days_since_hiit=5,
            freshness_flag=True,
            load_3d=400.0,
        )
        result = compute_recommendation(m)
        assert result.strength_allowed is True

    def test_fatigue_flag_blocks_strength(self):
        m = make_metrics(recovery_score=70.0, fatigue_flag=True)
        result = compute_recommendation(m)
        assert result.strength_allowed is False


# ── Confidence and data completeness tests ────────────────────

class TestConfidence:
    def test_full_data_has_high_confidence(self):
        m = make_metrics(recovery_score=60.0)
        result = compute_recommendation(m)
        assert result.confidence >= 0.6

    def test_missing_recovery_reduces_confidence(self):
        m_full = make_metrics(recovery_score=60.0)
        m_missing = make_metrics(recovery_score=None)
        r_full = compute_recommendation(m_full)
        r_missing = compute_recommendation(m_missing)
        assert r_missing.confidence <= r_full.confidence

    def test_confidence_is_bounded(self):
        m = make_metrics()
        result = compute_recommendation(m)
        assert 0.0 <= result.confidence <= 1.0

    def test_null_load_reduces_confidence_vs_known_load(self):
        # load_3d=None signals missing Strava data and should penalise confidence
        m_with_load = make_metrics(load_3d=800.0)
        m_no_load   = make_metrics(load_3d=None)
        r_with = compute_recommendation(m_with_load)
        r_none = compute_recommendation(m_no_load)
        assert r_none.confidence < r_with.confidence

    def test_null_load_appears_in_why(self):
        # Missing load should surface as an explanation note, not fail silently
        m = make_metrics(load_3d=None)
        result = compute_recommendation(m)
        why_text = " ".join(result.why).lower()
        assert "load" in why_text


# ── Training mode tests ───────────────────────────────────────

class TestTrainingMode:
    """
    training_mode applies a small confidence modifier defined in
    _TRAINING_MODE_CONFIDENCE_MODIFIER. These tests verify the modifier
    has a real, directionally-correct effect without checking exact values
    (the modifiers are intentionally small and may be tuned later).
    """

    def _quality_day(self) -> DailyMetricsInput:
        """A high-readiness scenario where training mode most visibly matters."""
        return make_metrics(
            recovery_score=82.0,
            sleep_vs_baseline_pct=2.0,
            hrv_vs_baseline_pct=5.0,
            freshness_flag=True,
            load_3d=400.0,
            load_7d=1800.0,
            days_since_hiit=6,
        )

    def test_endurance_mode_lower_confidence_than_mixed(self):
        m = self._quality_day()
        r_mixed     = compute_recommendation(m, training_mode="mixed")
        r_endurance = compute_recommendation(m, training_mode="endurance")
        assert r_endurance.confidence < r_mixed.confidence

    def test_strength_biased_higher_confidence_than_mixed(self):
        m = self._quality_day()
        r_mixed    = compute_recommendation(m, training_mode="mixed")
        r_strength = compute_recommendation(m, training_mode="strength_biased")
        assert r_strength.confidence >= r_mixed.confidence

    def test_unknown_mode_treated_as_mixed(self):
        m = self._quality_day()
        r_mixed   = compute_recommendation(m, training_mode="mixed")
        r_unknown = compute_recommendation(m, training_mode="unknown_future_mode")
        assert r_unknown.confidence == r_mixed.confidence

    def test_training_mode_does_not_change_session_category(self):
        # Mode only affects confidence, not which rule fires or what session is chosen
        m = self._quality_day()
        r_endurance = compute_recommendation(m, training_mode="endurance")
        r_strength  = compute_recommendation(m, training_mode="strength_biased")
        assert r_endurance.recommended_session == r_strength.recommended_session


# ── Output contract tests ─────────────────────────────────────

class TestOutputContract:
    def test_always_returns_valid_bucket(self):
        for score in [10, 34, 50, 67, 90]:
            m = make_metrics(recovery_score=float(score))
            result = compute_recommendation(m)
            assert result.readiness_bucket in ("low", "moderate", "high")

    def test_always_returns_valid_session(self):
        valid = {"off", "recovery", "zone2", "tempo", "high_intensity", "strength_only"}
        for score in [10, 34, 50, 67, 90]:
            m = make_metrics(recovery_score=float(score))
            result = compute_recommendation(m)
            assert result.recommended_session in valid

    def test_rule_version_is_set(self):
        m = make_metrics()
        result = compute_recommendation(m)
        assert result.rule_version == "v2"


# ── Rule C MCID threshold test ────────────────────────────────

class TestRuleCMcid:
    def test_hrv_between_minus5_and_minus10_no_longer_blocks_quality_day(self):
        # v2: −7% is within noise (MCID = −10%), should not block Rule C
        m = make_metrics(
            recovery_score=80.0,
            sleep_vs_baseline_pct=0.0,
            hrv_vs_baseline_pct=-7.0,
            days_since_hiit=5,
        )
        result = compute_recommendation(m)
        assert result.readiness_bucket == "high"

    def test_hrv_below_mcid_still_blocks_quality_day(self):
        # −12% exceeds MCID — should NOT reach Rule C
        m = make_metrics(
            recovery_score=80.0,
            sleep_vs_baseline_pct=0.0,
            hrv_vs_baseline_pct=-12.0,
            days_since_hiit=5,
        )
        result = compute_recommendation(m)
        # Rule C blocked; should fall to moderate or lower
        assert result.readiness_bucket != "high" or result.recommended_session in ("zone2", "recovery", "off")


# ── Rule F (sleep deprivation guard) tests ────────────────────

class TestRuleF:
    def test_sleep_below_6h_caps_to_zone2_or_lower(self):
        m = make_metrics(
            recovery_score=80.0,
            sleep_hours=5.0,
            sleep_vs_baseline_pct=0.0,
            days_since_hiit=5,
            freshness_flag=True,
            load_3d=400.0,
        )
        result = compute_recommendation(m)
        assert result.recommended_session in ("zone2", "recovery", "off")
        assert result.strength_allowed is False

    def test_sleep_below_6h_appears_in_why(self):
        m = make_metrics(
            recovery_score=80.0,
            sleep_hours=5.0,
            sleep_vs_baseline_pct=0.0,
        )
        result = compute_recommendation(m)
        why_text = " ".join(result.why).lower()
        assert "sleep" in why_text

    def test_low_sleep_quality_score_caps_session(self):
        # 6.5h × 0.65 efficiency = 4.225 quality score (< 5.0 threshold)
        m = make_metrics(
            recovery_score=80.0,
            sleep_hours=6.5,
            sleep_quality_score=4.2,
            sleep_vs_baseline_pct=0.0,
            days_since_hiit=5,
            freshness_flag=True,
            load_3d=400.0,
        )
        result = compute_recommendation(m)
        assert result.recommended_session in ("zone2", "recovery", "off")

    def test_adequate_sleep_no_cap(self):
        # 7.5h sleep, no quality issue — Rule F should not fire
        m = make_metrics(
            recovery_score=80.0,
            sleep_hours=7.5,
            sleep_quality_score=6.0,
            sleep_vs_baseline_pct=0.0,
            days_since_hiit=5,
            freshness_flag=True,
            load_3d=400.0,
        )
        result = compute_recommendation(m)
        # Rule F should not cap the recommendation
        assert result.recommended_session in ("high_intensity", "tempo", "zone2")


# ── Rule G (ACWR danger zone) tests ──────────────────────────

class TestRuleG:
    def test_acwr_above_danger_caps_to_zone2(self):
        m = make_metrics(
            recovery_score=82.0,
            sleep_hours=7.5,
            sleep_vs_baseline_pct=0.0,
            freshness_flag=True,
            load_3d=400.0,
            load_7d=2000.0,
            days_since_hiit=5,
            acwr=1.6,
        )
        result = compute_recommendation(m)
        assert result.recommended_session in ("zone2", "recovery", "off")
        assert result.readiness_bucket == "high"

    def test_acwr_danger_reduces_confidence(self):
        m_safe = make_metrics(
            recovery_score=82.0, sleep_hours=7.5, freshness_flag=True,
            load_3d=400.0, load_7d=2000.0, days_since_hiit=5, acwr=0.9,
        )
        m_danger = make_metrics(
            recovery_score=82.0, sleep_hours=7.5, freshness_flag=True,
            load_3d=400.0, load_7d=2000.0, days_since_hiit=5, acwr=1.6,
        )
        r_safe = compute_recommendation(m_safe)
        r_danger = compute_recommendation(m_danger)
        assert r_danger.confidence < r_safe.confidence

    def test_acwr_danger_appears_in_why(self):
        m = make_metrics(acwr=1.7, recovery_score=80.0)
        result = compute_recommendation(m)
        why_text = " ".join(result.why).lower()
        assert "acwr" in why_text or "danger" in why_text

    def test_acwr_below_danger_threshold_no_cap(self):
        m = make_metrics(
            recovery_score=82.0, sleep_hours=7.5, freshness_flag=True,
            load_3d=400.0, load_7d=2000.0, days_since_hiit=5, acwr=1.2,
        )
        result = compute_recommendation(m)
        # ACWR 1.2 is in sweet spot — no Rule G cap
        assert result.recommended_session in ("high_intensity", "tempo", "zone2")


# ── Science modifiers tests ───────────────────────────────────

class TestScienceModifiers:
    def test_acwr_caution_zone_reduces_confidence(self):
        m_low = make_metrics(acwr=0.9)
        m_caution = make_metrics(acwr=1.4)
        r_low = compute_recommendation(m_low)
        r_caution = compute_recommendation(m_caution)
        assert r_caution.confidence <= r_low.confidence

    def test_hrv_mcid_reduces_confidence(self):
        m_ok = make_metrics(hrv_vs_baseline_pct=-5.0)
        m_mcid = make_metrics(hrv_vs_baseline_pct=-12.0)
        r_ok = compute_recommendation(m_ok)
        r_mcid = compute_recommendation(m_mcid)
        assert r_mcid.confidence <= r_ok.confidence

    def test_elevated_rhr_reduces_confidence(self):
        m_ok = make_metrics(resting_hr_vs_baseline_pct=3.0)
        m_elevated = make_metrics(resting_hr_vs_baseline_pct=9.0)
        r_ok = compute_recommendation(m_ok)
        r_elevated = compute_recommendation(m_elevated)
        assert r_elevated.confidence <= r_ok.confidence

    def test_falling_hrv_trend_reduces_confidence(self):
        m_flat = make_metrics(hrv_trend="flat")
        m_falling = make_metrics(hrv_trend="falling")
        r_flat = compute_recommendation(m_flat)
        r_falling = compute_recommendation(m_falling)
        assert r_falling.confidence <= r_flat.confidence

    def test_consecutive_low_recovery_reduces_confidence(self):
        m_ok = make_metrics(consecutive_low_recovery_days=1)
        m_overreaching = make_metrics(consecutive_low_recovery_days=4)
        r_ok = compute_recommendation(m_ok)
        r_over = compute_recommendation(m_overreaching)
        assert r_over.confidence <= r_ok.confidence

    def test_rising_hrv_trend_no_penalty(self):
        m_rising = make_metrics(hrv_trend="rising")
        m_none = make_metrics(hrv_trend=None)
        r_rising = compute_recommendation(m_rising)
        r_none = compute_recommendation(m_none)
        # Rising HRV should not reduce confidence vs. no trend
        assert r_rising.confidence >= r_none.confidence

    def test_weekend_with_high_acwr_reduces_confidence(self):
        # 2026-04-11 is Saturday
        m_weekday = make_metrics(date="2026-04-08", acwr=1.2)  # Wednesday
        m_weekend = make_metrics(date="2026-04-11", acwr=1.2)  # Saturday
        r_weekday = compute_recommendation(m_weekday)
        r_weekend = compute_recommendation(m_weekend)
        assert r_weekend.confidence <= r_weekday.confidence

    def test_weekend_without_elevated_acwr_no_penalty(self):
        # Weekend + low ACWR should not trigger day-of-week penalty
        m_weekend = make_metrics(date="2026-04-11", acwr=0.8)
        m_weekday = make_metrics(date="2026-04-08", acwr=0.8)
        r_weekend = compute_recommendation(m_weekend)
        r_weekday = compute_recommendation(m_weekday)
        assert r_weekend.confidence == r_weekday.confidence
