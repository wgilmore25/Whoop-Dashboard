"""
Pydantic models for the recommendation service.
"""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── Input models ─────────────────────────────────────────────

class DailyMetricsInput(BaseModel):
    """Normalized daily metrics row passed in by the Next.js app."""

    user_id: str
    date: str  # ISO date string "YYYY-MM-DD"

    sleep_hours: Optional[float] = None
    sleep_vs_baseline_pct: Optional[float] = None  # negative = below baseline

    recovery_score: Optional[float] = None          # 0–100 (WHOOP scale)
    hrv_vs_baseline_pct: Optional[float] = None
    resting_hr_vs_baseline_pct: Optional[float] = None

    whoop_strain: Optional[float] = None
    load_3d: Optional[float] = None    # kJ-equivalent over last 3 days
    load_7d: Optional[float] = None    # kJ-equivalent over last 7 days

    days_since_hiit: Optional[int] = None
    days_since_long_session: Optional[int] = None

    fatigue_flag: bool = False
    freshness_flag: bool = False

    # Science-grounded fields (migration 006)
    load_28d: Optional[float] = None   # 28-day cumulative load (kJ-equivalent)
    acwr: Optional[float] = None       # Acute:Chronic Workload Ratio (load_7d / (load_28d/4))
    hrv_trend: Optional[str] = None    # "rising" | "falling" | "flat" (Plews et al.)
    hrv_cv_7d: Optional[float] = None  # 7-day HRV coefficient of variation
    hrv_cv_valid_nights: Optional[int] = None
    hrv_cv_confidence: Optional[Literal["high", "moderate", "insufficient"]] = None
    sleep_quality_score: Optional[float] = None  # sleep_hours × sleep_efficiency
    sleep_awake_minutes: Optional[float] = None  # total awake time overnight (WASO)
    sleep_longest_awake_minutes: Optional[float] = None
    sleep_continuity_confidence: Optional[Literal["high", "moderate", "insufficient"]] = None
    consecutive_low_recovery_days: Optional[int] = None  # streak of recovery < 50
    training_monotony: Optional[float] = None    # Foster's monotony: mean/SD of 7d loads
    sleep_efficiency: Optional[float] = None     # raw 0–1 sleep efficiency from WHOOP


class RecommendationRequest(BaseModel):
    user_id: str
    metrics: DailyMetricsInput
    training_mode: Literal["endurance", "mixed", "strength_biased"] = "mixed"


# ── Output models ────────────────────────────────────────────

ReadinessBucket = Literal["low", "moderate", "high"]
SessionCategory = Literal[
    "off", "recovery", "zone2", "tempo", "high_intensity", "strength_only"
]
IntensityCap = Literal["easy", "sub-threshold", "threshold", "above-threshold", None]


class RecommendationResponse(BaseModel):
    readiness_bucket: ReadinessBucket
    recommended_session: SessionCategory
    intensity_cap: Optional[str] = None
    duration_min_low: Optional[int] = None
    duration_min_high: Optional[int] = None
    strength_allowed: bool = False
    confidence: float = Field(ge=0.0, le=1.0)
    rule_version: str = "v2"
    why: list[str] = Field(default_factory=list)
