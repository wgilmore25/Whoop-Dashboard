"""
Deterministic rules-based recommendation engine — v2.

Rules are applied in order. Each rule either returns a recommendation
or passes through to the next. Post-processing steps (Rules D, F, G,
and science modifiers) are applied after the initial recommendation.

Science changes from v1:
  - Rule C HRV threshold: −5% → −10% (MCID per Plews et al.)
  - Rule F: hard cap on sleep deprivation (< 6h absolute OR quality < 5.0)
  - Rule G: hard cap on ACWR danger zone (> 1.5)
  - _apply_science_modifiers: multiplicative confidence penalties for
      ACWR caution zone, HRV MCID, RHR MCID, HRV trend falling,
      consecutive low recovery days, day-of-week fatigue signal
  - rule_version: v1 → v2

All thresholds are module-level constants — easy to tune.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from typing import Optional

from models import (
    DailyMetricsInput,
    RecommendationResponse,
)

# ── Configurable thresholds ───────────────────────────────────

# Recovery score bands
RECOVERY_LOW_THRESHOLD = 34      # below = low readiness
RECOVERY_HIGH_THRESHOLD = 67     # above = high readiness

# Sleep deviation thresholds (percent vs baseline)
SLEEP_ACCEPTABLE = -10           # within 10% of baseline is acceptable
SLEEP_BELOW = -20                # more than 20% below = problem

# Absolute sleep thresholds (Rule F — science guard)
SLEEP_HOURS_CRITICAL = 6.0       # absolute floor; < 6h → low-intensity cap
SLEEP_QUALITY_CRITICAL = 5.0     # sleep_hours × efficiency; < 5.0 → cap

# Load thresholds (kJ-equivalent)
LOAD_3D_HIGH = 2000              # 3-day load: elevated
LOAD_3D_MODERATE = 1000
LOAD_7D_VERY_HIGH = 4500         # Rule D: accumulated fatigue trigger

# ACWR thresholds (Gabbett et al.)
ACWR_DANGER = 1.5                # Rule G: hard cap — injury risk zone
ACWR_CAUTION = 1.3               # above sweet spot, approaching danger

# Days since HIIT
HIIT_RECOVERY_MIN_DAYS = 3

# HRV MCID threshold (Plews et al.) — minimum clinically important difference
HRV_MCID_PCT = -10.0             # below −10% vs baseline = meaningful decline
RHR_MCID_PCT = 7.0               # above +7% vs baseline = meaningful elevation

# Consecutive low recovery days — overreaching indicator
CONSECUTIVE_LOW_RECOVERY_CONCERN = 3  # ≥ 3 consecutive days signals overreaching

# Training monotony — Foster's metric
TRAINING_MONOTONY_HIGH = 2.0     # > 2.0 = insufficient load variation

# Confidence modifiers (start at 1.0, apply penalties for uncertainty)
MISSING_DATA_PENALTY = 0.10

# Science confidence multipliers — applied after rule decisions
_CONF_ACWR_CAUTION = 0.90        # ACWR in caution zone (1.3–1.5)
_CONF_HRV_MCID = 0.88            # HRV below MCID threshold
_CONF_RHR_MCID = 0.90            # RHR elevated above MCID threshold
_CONF_HRV_TREND_FALLING = 0.92   # HRV trending downward
_CONF_CONSECUTIVE_LOW = 0.88     # ≥ 3 consecutive low recovery days
_CONF_DOW_WEEKEND_HIGH_ACWR = 0.97  # weekend days with ACWR > 1.0 (fatigue pattern)
_CONF_RULE_F = 0.85              # sleep deprivation cap
_CONF_RULE_G = 0.88              # ACWR danger zone cap


# ── Internal decision container ───────────────────────────────

@dataclass
class Decision:
    readiness_bucket: str
    recommended_session: str
    intensity_cap: Optional[str]
    duration_min_low: Optional[int]
    duration_min_high: Optional[int]
    strength_allowed: bool
    confidence: float
    why: list[str] = field(default_factory=list)


# ── Helper: assess data completeness ─────────────────────────

def _data_confidence(m: DailyMetricsInput) -> tuple[float, list[str]]:
    """
    Returns a (confidence_modifier, missing_fields) tuple.
    Each missing key field reduces confidence.
    """
    missing = []
    if m.recovery_score is None:
        missing.append("recovery score unavailable")
    if m.sleep_vs_baseline_pct is None:
        missing.append("sleep baseline not yet established")
    if m.load_3d is None:
        missing.append("3-day load unavailable")
    if m.hrv_vs_baseline_pct is None:
        missing.append("HRV baseline not yet established")
    if m.hrv_cv_confidence == "insufficient":
        missing.append("HRV stability needs at least five valid nights")

    # HRV-CV is a supporting reliability feature, not a prerequisite for a
    # WHOOP recovery score. Apply a smaller penalty when only this is missing.
    penalty = len(missing) * MISSING_DATA_PENALTY
    if m.hrv_cv_confidence == "insufficient":
        penalty -= 0.05
    return max(0.4, 1.0 - penalty), missing


def _recovery_score(m: DailyMetricsInput) -> float:
    """Returns recovery score; defaults to 50 (moderate) if missing."""
    return m.recovery_score if m.recovery_score is not None else 50.0


def _sleep_ok(m: DailyMetricsInput) -> bool:
    """Sleep is acceptable if vs-baseline is above SLEEP_ACCEPTABLE threshold."""
    if m.sleep_vs_baseline_pct is None:
        return True  # give benefit of doubt
    return m.sleep_vs_baseline_pct >= SLEEP_ACCEPTABLE


def _sleep_below(m: DailyMetricsInput) -> bool:
    if m.sleep_vs_baseline_pct is None:
        return False
    return m.sleep_vs_baseline_pct < SLEEP_BELOW


def _load_3d(m: DailyMetricsInput) -> float:
    return m.load_3d if m.load_3d is not None else 0.0


def _load_7d(m: DailyMetricsInput) -> float:
    return m.load_7d if m.load_7d is not None else 0.0


def _recent_hiit(m: DailyMetricsInput) -> bool:
    """True if HIIT was done within the recovery window."""
    if m.days_since_hiit is None:
        return False
    return m.days_since_hiit < HIIT_RECOVERY_MIN_DAYS


# ── Strength allowed helper ───────────────────────────────────

def _strength_allowed(m: DailyMetricsInput, bucket: str) -> bool:
    """
    Rule E: allow strength if readiness is not low and the fatigue flag is clear.
    HIIT history is intentionally not a blocker — high-intensity cardio and
    strength work target different energy systems and complement each other.
    """
    if bucket == "low":
        return False
    if m.fatigue_flag:
        return False
    return bucket in ("moderate", "high")


# ── Rule A — low readiness / high fatigue ────────────────────

def rule_a(m: DailyMetricsInput, confidence: float) -> Optional[Decision]:
    """
    If recovery is low OR fatigue flag is set OR both sleep and load are bad,
    recommend recovery or off.
    """
    score = _recovery_score(m)
    low_recovery = score < RECOVERY_LOW_THRESHOLD
    high_load = _load_3d(m) > LOAD_3D_HIGH
    sleep_bad = _sleep_below(m)

    # A recent-load fatigue flag should not turn a genuinely strong recovery
    # with supportive sleep/HRV into a low-readiness rest day. High-readiness
    # load spikes are handled later by the 7-day-load and ACWR intensity caps.
    fatigue_override = m.fatigue_flag and score < RECOVERY_HIGH_THRESHOLD

    if low_recovery or fatigue_override or (high_load and sleep_bad):
        why = []
        if low_recovery:
            why.append(f"recovery score is low ({score:.0f}/100)")
        if fatigue_override:
            why.append("fatigue flag triggered")
        if high_load:
            why.append("3-day training load is elevated")
        if sleep_bad:
            why.append("sleep is significantly below baseline")

        session = "off" if (score < 20 or fatigue_override) else "recovery"
        return Decision(
            readiness_bucket="low",
            recommended_session=session,
            intensity_cap="easy",
            duration_min_low=20 if session == "recovery" else None,
            duration_min_high=40 if session == "recovery" else None,
            strength_allowed=False,
            confidence=round(confidence * 0.90, 3),
            why=why,
        )
    return None


# ── Rule B — moderate readiness / moderate fatigue ───────────

def rule_b(m: DailyMetricsInput, confidence: float) -> Optional[Decision]:
    """
    Moderate recovery or elevated recent load → zone2.
    Recent HIIT alone no longer triggers this rule — if recovery is high,
    Rule C handles the day. HIIT only matters here when recovery is genuinely
    moderate.
    """
    score = _recovery_score(m)
    moderate_recovery = RECOVERY_LOW_THRESHOLD <= score < RECOVERY_HIGH_THRESHOLD
    moderate_load = LOAD_3D_MODERATE <= _load_3d(m) <= LOAD_3D_HIGH
    had_recent_hiit = _recent_hiit(m)

    if moderate_recovery or (moderate_load and _sleep_ok(m)):
        why = []
        if moderate_recovery:
            why.append(f"recovery score is moderate ({score:.0f}/100)")
        if moderate_load:
            why.append("moderately elevated recent training load (3-day)")
        if had_recent_hiit:
            why.append(
                f"hard session detected {m.days_since_hiit} day(s) ago — partial recovery pattern"
            )
        if not _sleep_ok(m):
            why.append("sleep came in slightly below your rolling baseline")

        return Decision(
            readiness_bucket="moderate",
            recommended_session="zone2",
            intensity_cap="sub-threshold",
            duration_min_low=45,
            duration_min_high=75,
            strength_allowed=_strength_allowed(m, "moderate"),
            confidence=round(confidence * 0.82, 3),
            why=why,
        )
    return None


# ── Rule C — high readiness / quality day ────────────────────

def rule_c(m: DailyMetricsInput, confidence: float) -> Optional[Decision]:
    """
    High recovery, good sleep, HRV not below MCID threshold (−10%) → quality day.

    v2: HRV threshold changed from −5% to −10% (MCID per Plews et al. 2013).
    Sub-MCID HRV changes are within normal biological variation and should not
    block a quality day recommendation when all other signals are green.

    Recent HIIT is intentionally not a blocker here. High recovery with good
    sleep is the signal that matters; HIIT and strength work target different
    systems and can be paired productively.
    """
    score = _recovery_score(m)
    high_recovery = score >= RECOVERY_HIGH_THRESHOLD
    sleep_good = _sleep_ok(m)
    # MCID: only block quality day if HRV decline exceeds the minimum clinically
    # important difference. Smaller deviations are noise.
    hrv_stable = m.hrv_vs_baseline_pct is None or m.hrv_vs_baseline_pct >= HRV_MCID_PCT
    low_load = _load_3d(m) < LOAD_3D_MODERATE

    if high_recovery and sleep_good and hrv_stable:
        # Choose tempo vs high_intensity based on recent load + freshness
        if m.freshness_flag and low_load:
            session = "high_intensity"
            intensity_cap = "above-threshold"
            duration_low, duration_high = 40, 70
        else:
            session = "tempo"
            intensity_cap = "threshold"
            duration_low, duration_high = 45, 80

        why = [
            f"recovery score is high ({score:.0f}/100)",
            "sleep is at or above baseline" if (m.sleep_vs_baseline_pct or 0) >= 0
            else "sleep is close to baseline",
        ]
        if m.freshness_flag:
            why.append("freshness flag indicates accumulated rest")
        if m.days_since_hiit:
            why.append(f"last hard session was {m.days_since_hiit} day(s) ago")

        return Decision(
            readiness_bucket="high",
            recommended_session=session,
            intensity_cap=intensity_cap,
            duration_min_low=duration_low,
            duration_min_high=duration_high,
            strength_allowed=_strength_allowed(m, "high"),
            confidence=round(confidence * 0.92, 3),
            why=why,
        )
    return None


# ── Rule D — false green light protection ────────────────────

def rule_d_downgrade(decision: Decision, m: DailyMetricsInput) -> Decision:
    """
    Post-processing: if 7-day load is very high despite good single-day numbers,
    downgrade recommendation by one level to guard against accumulated fatigue.
    """
    very_high_7d = _load_7d(m) > LOAD_7D_VERY_HIGH

    if not very_high_7d:
        return decision  # no change needed

    downgrade_map = {
        "high_intensity": ("tempo", "threshold", 50, 80),
        "tempo": ("zone2", "sub-threshold", 45, 75),
        "zone2": ("zone2", "sub-threshold", 40, 60),
    }

    if decision.recommended_session in downgrade_map:
        session, cap, dur_low, dur_high = downgrade_map[decision.recommended_session]
        decision.recommended_session = session
        decision.intensity_cap = cap
        decision.duration_min_low = dur_low
        decision.duration_min_high = dur_high
        decision.why.append(
            f"7-day load is very high ({m.load_7d:.0f} kJ) — downgraded to protect against accumulated fatigue"
        )
        decision.confidence = round(decision.confidence * 0.9, 2)

    return decision


# ── Rule F — sleep deprivation guard ─────────────────────────

def rule_f_sleep_guard(decision: Decision, m: DailyMetricsInput) -> Decision:
    """
    Post-processing: if absolute sleep is critically low (< 6h) OR the
    sleep quality score (hours × efficiency) is below 5.0, enforce a hard
    cap toward low-intensity training and reduce confidence.

    Sleep < 6h impairs motor learning, immune function, and HRV recovery
    regardless of the athlete's subjective recovery score (Milewski et al. 2014).
    Sleep quality < 5.0 catches the case where 7h of sleep at 60% efficiency
    is effectively worse than 6.5h of high-quality sleep.
    """
    sleep_critically_low = m.sleep_hours is not None and m.sleep_hours < SLEEP_HOURS_CRITICAL
    quality_critically_low = (
        m.sleep_quality_score is not None and m.sleep_quality_score < SLEEP_QUALITY_CRITICAL
    )

    if not (sleep_critically_low or quality_critically_low):
        return decision

    why_parts = []
    if sleep_critically_low:
        why_parts.append(f"sleep was {m.sleep_hours:.1f}h (below 6h critical threshold)")
    if quality_critically_low:
        why_parts.append(
            f"sleep quality score is {m.sleep_quality_score:.1f} (duration and continuity are critically low)"
        )

    # Downgrade to recovery or zone2 at most
    cap_map = {
        "high_intensity": ("zone2", "sub-threshold", 30, 50),
        "tempo":          ("zone2", "sub-threshold", 30, 50),
        "zone2":          ("recovery", "easy", 20, 40),
    }
    if decision.recommended_session in cap_map:
        session, cap, dur_low, dur_high = cap_map[decision.recommended_session]
        decision.recommended_session = session
        decision.intensity_cap = cap
        decision.duration_min_low = dur_low
        decision.duration_min_high = dur_high
        if decision.readiness_bucket == "high":
            decision.readiness_bucket = "moderate"

    decision.why.append("sleep deprivation: " + "; ".join(why_parts))
    decision.confidence = round(decision.confidence * _CONF_RULE_F, 3)
    decision.strength_allowed = False
    return decision


# ── Rule G — ACWR danger zone ────────────────────────────────

def rule_g_acwr_danger(decision: Decision, m: DailyMetricsInput) -> Decision:
    """
    Post-processing: if ACWR exceeds the danger threshold (> 1.5), enforce a
    hard cap to prevent injury from spike loading (Gabbett et al. 2016).

    An ACWR > 1.5 means the acute (7-day) load is more than 50% above the
    chronic weekly average — the strongest predictor of non-contact injury
    in team sport athletes.
    """
    if m.acwr is None or m.acwr <= ACWR_DANGER:
        return decision

    # Hard cap: nothing above zone2 when ACWR is in danger zone
    hard_cap_sessions = {"high_intensity", "tempo"}
    if decision.recommended_session in hard_cap_sessions:
        decision.recommended_session = "zone2"
        decision.intensity_cap = "sub-threshold"
        decision.duration_min_low = 30
        decision.duration_min_high = 60
        # Preserve physiological readiness. ACWR modifies the training
        # prescription, not the athlete's same-day recovery classification.

    decision.why.append(
        f"ACWR is {m.acwr:.2f} — in danger zone (>1.5); capped to zone2 to reduce injury risk"
    )
    decision.confidence = round(decision.confidence * _CONF_RULE_G, 3)
    return decision


# ── Science modifiers ─────────────────────────────────────────

def _apply_science_modifiers(decision: Decision, m: DailyMetricsInput) -> Decision:
    """
    Applies multiplicative confidence penalties for sub-clinical signals that
    don't trigger a hard rule but increase uncertainty. Applied after Rules D/F/G.

    Modifiers are multiplicative (not additive) to prevent double-counting and
    allow independent signals to stack correctly.
    """
    # ACWR caution zone (1.3–1.5) — approaching danger but not there yet
    if m.acwr is not None and ACWR_CAUTION < m.acwr <= ACWR_DANGER:
        decision.confidence = round(decision.confidence * _CONF_ACWR_CAUTION, 3)
        decision.why.append(
            f"ACWR is {m.acwr:.2f} — in caution zone (1.3–1.5); workload spike risk"
        )

    # HRV MCID — decline exceeds minimum clinically important difference (−10%)
    if m.hrv_vs_baseline_pct is not None and m.hrv_vs_baseline_pct < HRV_MCID_PCT:
        decision.confidence = round(decision.confidence * _CONF_HRV_MCID, 3)
        decision.why.append(
            f"HRV is {m.hrv_vs_baseline_pct:.1f}% below baseline (MCID threshold: −10%)"
        )

    # RHR MCID — elevation exceeds minimum clinically important difference (+7%)
    if m.resting_hr_vs_baseline_pct is not None and m.resting_hr_vs_baseline_pct > RHR_MCID_PCT:
        decision.confidence = round(decision.confidence * _CONF_RHR_MCID, 3)
        decision.why.append(
            f"resting HR is {m.resting_hr_vs_baseline_pct:.1f}% above baseline (elevated RHR signal)"
        )

    # HRV trend falling — directional decline signal (Plews et al. 2013)
    if m.hrv_trend == "falling":
        decision.confidence = round(decision.confidence * _CONF_HRV_TREND_FALLING, 3)
        decision.why.append("HRV trend is falling over the last 5 readings")

    # Consecutive low recovery days — overreaching pattern
    if (
        m.consecutive_low_recovery_days is not None
        and m.consecutive_low_recovery_days >= CONSECUTIVE_LOW_RECOVERY_CONCERN
    ):
        decision.confidence = round(decision.confidence * _CONF_CONSECUTIVE_LOW, 3)
        decision.why.append(
            f"{m.consecutive_low_recovery_days} consecutive days of low recovery — overreaching pattern"
        )

    # Day-of-week adjustment — weekend fatigue pattern when under load
    # Weekend days (Sat=5, Sun=6) carry elevated residual fatigue risk when ACWR > 1.0
    # because most athletes accumulate their week's load Mon–Fri and carry it forward.
    try:
        dow = datetime.date.fromisoformat(m.date).weekday()  # 0=Mon, 6=Sun
        is_weekend = dow >= 5
        acwr_elevated = m.acwr is not None and m.acwr > 1.0
        if is_weekend and acwr_elevated:
            decision.confidence = round(decision.confidence * _CONF_DOW_WEEKEND_HIGH_ACWR, 3)
    except (ValueError, AttributeError):
        pass  # malformed date — skip silently

    return decision


# ── Default fallback ──────────────────────────────────────────

def _default_decision(confidence: float, why: list[str]) -> Decision:
    return Decision(
        readiness_bucket="moderate",
        recommended_session="zone2",
        intensity_cap="sub-threshold",
        duration_min_low=30,
        duration_min_high=60,
        strength_allowed=False,
        confidence=max(0.4, confidence * 0.7),
        why=why + ["defaulting to conservative aerobic recommendation"],
    )


# ── Main engine entrypoint ────────────────────────────────────

# Training mode confidence adjustments.
# These are intentionally modest — training mode is a preference hint, not a
# hard override. An endurance athlete's engine should be slightly more
# conservative about high-intensity days; a strength-biased athlete slightly
# less so. Full rule-weight tuning by mode is a future iteration.
_TRAINING_MODE_CONFIDENCE_MODIFIER: dict[str, float] = {
    "endurance":       -0.04,  # be a bit more cautious about hard days
    "mixed":            0.00,  # no adjustment
    "strength_biased": +0.03,  # slightly more willing to recommend quality sessions
}


def compute_recommendation(
    m: DailyMetricsInput,
    training_mode: str = "mixed",
) -> RecommendationResponse:
    """
    Applies rules in priority order, then post-processes with Rules D, F, G,
    and science modifiers. Returns a fully populated RecommendationResponse.

    Rule order:
      1. Rule A — low readiness / high fatigue (hard override)
      2. Rule B — moderate readiness / moderate fatigue
      3. Rule C — high readiness / quality day
      4. Default fallback (conservative zone2)
      5. Rule D — false green light (7d accumulated fatigue)
      6. Rule F — sleep deprivation guard (absolute and quality thresholds)
      7. Rule G — ACWR danger zone (spike loading cap)
      8. Science modifiers — sub-clinical confidence penalties
      9. Training mode modifier
    """
    base_confidence, missing_why = _data_confidence(m)

    decision = (
        rule_a(m, base_confidence)
        or rule_b(m, base_confidence)
        or rule_c(m, base_confidence)
        or _default_decision(base_confidence, missing_why)
    )

    # Post-processing — order matters: D before F/G before science modifiers
    decision = rule_d_downgrade(decision, m)
    decision = rule_f_sleep_guard(decision, m)
    decision = rule_g_acwr_danger(decision, m)
    decision = _apply_science_modifiers(decision, m)

    # Training mode modifier applied last so it survives all per-rule ceilings
    mode_modifier = _TRAINING_MODE_CONFIDENCE_MODIFIER.get(training_mode, 0.0)
    decision.confidence = max(0.3, min(1.0, decision.confidence + mode_modifier))

    # Prepend any missing-data notes to why list
    why = missing_why + [w for w in decision.why if w not in missing_why]

    return RecommendationResponse(
        readiness_bucket=decision.readiness_bucket,
        recommended_session=decision.recommended_session,
        intensity_cap=decision.intensity_cap,
        duration_min_low=decision.duration_min_low,
        duration_min_high=decision.duration_min_high,
        strength_allowed=decision.strength_allowed,
        confidence=round(decision.confidence, 2),
        rule_version="v2",
        why=why[:6],  # cap to 6 reasons (expanded from 5 to accommodate new signals)
    )
