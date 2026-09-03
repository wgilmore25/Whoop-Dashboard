"""
Tests for the load proxy helper.
The normalization pipeline is tested from the Python side here;
full integration tests live in the Next.js Jest suite.
"""

from __future__ import annotations

import sys
import os
from typing import Optional
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# These tests exercise the load proxy logic documented in lib/sync/normalization.ts
# Since that file is TypeScript, we replicate the same logic here in Python
# to validate the algorithm independently.

def estimate_load(kilojoules=None, weighted_avg_watts=None, moving_time=None, average_hr=None):
    """
    Python replica of the TypeScript estimateActivityLoad() function.
    Keep in sync with lib/sync/normalization.ts.

    effortFactor is clamped to 1.0 — HR above 160 bpm does not scale linearly
    and the formula would otherwise exceed the intended 0-1 range.
    """
    minutes = (moving_time or 0) / 60

    # 1. Direct kJ
    if kilojoules is not None and kilojoules > 0:
        return kilojoules

    # 2. Power × time
    if weighted_avg_watts is not None and weighted_avg_watts > 0 and moving_time:
        return (weighted_avg_watts * moving_time) / 1000

    # 3. HR proxy — clamp effort factor to 1.0
    if average_hr is not None and average_hr > 60 and moving_time:
        effort = min((average_hr - 60) / 100, 1.0)
        return effort * minutes * 10

    # 4. Duration fallback
    return minutes * 5


class TestLoadProxy:
    def test_direct_kj_takes_priority(self):
        load = estimate_load(kilojoules=800, weighted_avg_watts=250, moving_time=3600, average_hr=150)
        assert load == 800

    def test_power_proxy_when_no_kj(self):
        # 250W × 3600s / 1000 = 900 kJ
        load = estimate_load(weighted_avg_watts=250, moving_time=3600)
        assert abs(load - 900) < 1

    def test_hr_proxy_when_no_power(self):
        # (150 - 60) / 100 * 60 * 10 = 0.9 * 60 * 10 = 540
        load = estimate_load(average_hr=150, moving_time=3600)
        assert abs(load - 540) < 1

    def test_duration_fallback(self):
        # 60 min * 5 kJ/min = 300
        load = estimate_load(moving_time=3600)
        assert load == 300

    def test_no_data_gives_zero(self):
        load = estimate_load()
        assert load == 0

    def test_zero_kj_falls_through_to_power(self):
        load = estimate_load(kilojoules=0, weighted_avg_watts=200, moving_time=3600)
        # kJ=0 so falls to power proxy
        assert load == 720

    def test_high_hr_gives_higher_load_than_low_hr(self):
        load_high = estimate_load(average_hr=175, moving_time=3600)
        load_low = estimate_load(average_hr=120, moving_time=3600)
        assert load_high > load_low

    def test_hr_effort_factor_clamped_at_160bpm(self):
        # At HR=160: effort = (160-60)/100 = 1.0 exactly (at the clamp boundary)
        # At HR=180: effort would be 1.2 unclamped, but is clamped to 1.0
        # Both should produce the same load — the clamp flattens output above 160 bpm.
        load_at_160 = estimate_load(average_hr=160, moving_time=3600)
        load_at_180 = estimate_load(average_hr=180, moving_time=3600)
        load_at_200 = estimate_load(average_hr=200, moving_time=3600)
        assert load_at_160 == load_at_180 == load_at_200

    def test_hr_below_clamp_still_scales(self):
        # Below 160 bpm the clamp has no effect — load should still increase with HR
        load_120 = estimate_load(average_hr=120, moving_time=3600)
        load_150 = estimate_load(average_hr=150, moving_time=3600)
        assert load_150 > load_120

    def test_longer_duration_gives_higher_fallback_load(self):
        load_long = estimate_load(moving_time=7200)  # 120 min
        load_short = estimate_load(moving_time=1800)  # 30 min
        assert load_long > load_short


# ── EWMA helper ───────────────────────────────────────────────
# Python replica of lib/sync/normalization.ts ewma()
# Keep in sync with the TypeScript implementation.

def ewma(values: list, alpha: float = 0.25, min_samples: int = 5) -> Optional[float]:
    """
    Exponentially weighted moving average, oldest→newest.
    Returns None when fewer than min_samples values are provided.
    """
    if len(values) < min_samples:
        return None
    result = values[0]
    for v in values[1:]:
        result = alpha * v + (1 - alpha) * result
    return result


class TestEwma:
    def test_returns_none_below_min_samples(self):
        assert ewma([60.0, 62.0, 61.0, 63.0]) is None  # only 4, need 5

    def test_returns_value_at_min_samples(self):
        result = ewma([60.0, 62.0, 61.0, 63.0, 65.0])
        assert result is not None

    def test_stable_series_returns_that_value(self):
        # All identical values → EWMA must equal that value
        values = [70.0] * 10
        result = ewma(values)
        assert abs(result - 70.0) < 0.01

    def test_recent_spike_shifts_ewma_up(self):
        # Long stable baseline then a spike — EWMA should move toward spike
        stable = [60.0] * 10
        spiked = stable + [80.0]
        baseline = ewma(stable)
        spiked_avg = ewma(spiked)
        assert spiked_avg > baseline

    def test_recent_drop_shifts_ewma_down(self):
        stable = [70.0] * 10
        dropped = stable + [50.0]
        baseline = ewma(stable)
        dropped_avg = ewma(dropped)
        assert dropped_avg < baseline

    def test_ewma_weights_recent_more_than_old(self):
        # Series ending high should produce higher EWMA than same values ending low
        ascending = [50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0]
        descending = list(reversed(ascending))
        r_asc = ewma(ascending)
        r_desc = ewma(descending)
        assert r_asc > r_desc  # ascending ends high → weighted toward high values

    def test_alpha_one_returns_last_value(self):
        # α=1.0 means only the most recent value matters
        values = [50.0, 60.0, 70.0, 80.0, 90.0]
        result = ewma(values, alpha=1.0)
        assert abs(result - 90.0) < 0.001

    def test_alpha_zero_returns_first_value(self):
        # α=0.0 means the baseline never updates (pure anchor)
        values = [50.0, 60.0, 70.0, 80.0, 90.0]
        result = ewma(values, alpha=0.0)
        assert abs(result - 50.0) < 0.001

    def test_custom_min_samples(self):
        # min_samples=3 → 3 values should be enough
        result = ewma([60.0, 65.0, 70.0], min_samples=3)
        assert result is not None
        # 2 values should still return None
        assert ewma([60.0, 65.0], min_samples=3) is None
