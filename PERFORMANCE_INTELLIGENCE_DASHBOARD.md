# Performance Intelligence Dashboard System Design

## 1) System Design Overview

### 1.1 Recommended Stack: **Python + Streamlit + DuckDB/Parquet + dbt (optional) + lightweight API workers**

**Recommendation:** Use **Streamlit** for the analyst-facing app, with an ingestion/feature pipeline separated from the UI.

Why Streamlit over Shiny for this use case:
- **Python-native analytics stack** (pandas/polars, statsmodels, scikit-learn, pymc, prophet, xgboost) is better aligned with high-performance sport science workflows and future predictive modeling.
- Easier integration with API SDKs and auth patterns common in training platforms (Strava, WHOOP wrappers, custom ETL scripts).
- Faster development cycle for advanced charting and scenario-testing widgets.
- Better handoff to ML/predictive services without language/context switching.

When Shiny would still be preferred:
- Existing R-first team with established modeling in R and Shiny deployment maturity.
- Heavy use of R packages specific to sport science pipelines.

**Final architecture pattern:**
- **Ingestion layer**: Scheduled API pulls + CSV ingestion watchers.
- **Modeling layer**: Data harmonization, baseline/error models, derived features.
- **Serving layer**: Streamlit app reads from curated analytics tables.
- **Storage layer**: Raw + cleaned + feature marts (Parquet on disk, query via DuckDB; optional Postgres for multi-user scaling).

---

### 1.2 Data Structure Schema (tables + relationships)

Use an event-based star schema with athlete-day aggregation marts.

#### Core entities

1. `athlete`
- `athlete_id` (PK)
- `name`
- `sex`
- `dob`
- `sport`
- `timezone`

2. `source_system`
- `source_id` (PK)
- `source_name` (`strava`, `whoop`, `gym_app`, `cmj_system`, `manual`)
- `api_version`

3. `session`
- `session_id` (PK)
- `athlete_id` (FK)
- `source_id` (FK)
- `session_type` (`ride`, `gym`, `cmj`, `wellness`)
- `start_time_utc`
- `duration_s`
- `local_date`
- `ingested_at`

4. `ride_metrics`
- `session_id` (PK/FK)
- `tss`
- `np_w`
- `avg_power_w`
- `max_power_w`
- `hr_avg_bpm`
- `hr_max_bpm`
- `cadence_avg_rpm`
- `ftp_reference_w`
- `if` (intensity factor)
- `zone_time_z1...z7_s`

5. `gym_set_metrics`
- `set_id` (PK)
- `session_id` (FK)
- `exercise_name`
- `set_number`
- `reps`
- `load_kg`
- `velocity_mps` (nullable)
- `rpe` (nullable)
- `tonnage_kg` (derived)

6. `cmj_test`
- `test_id` (PK)
- `session_id` (FK)
- `jump_height_cm`
- `peak_power_w`
- `net_impulse_ns`
- `ecc_impulse_ns` (nullable)
- `con_impulse_ns` (nullable)
- `strategy_ratio_*` (nullable fields; e.g., countermovement depth ratio, eccentric:concentric impulse ratio)
- `device_type`

7. `whoop_recovery_daily`
- `athlete_id` (FK)
- `date` (PK composite)
- `hrv_rmssd_ms`
- `rhr_bpm`
- `sleep_duration_h`
- `sleep_efficiency_pct`
- `strain`
- `recovery_score`

8. `subjective_wellness_daily` (optional)
- `athlete_id` (FK)
- `date` (PK composite)
- `mood_1_5`
- `soreness_1_5`
- `stress_1_5`
- `notes`

9. `daily_feature_mart`
- `athlete_id`, `date` (PK composite)
- joined and derived daily features (acute/chronic loads, rolling z-scores, SWC, TE flags, indices)

10. `flag_events`
- `flag_id` (PK)
- `athlete_id`
- `date`
- `flag_type` (`output_decline`, `capacity_shift`, `strategy_change`, `fatigue_risk`)
- `metric`
- `severity`
- `value`
- `baseline`
- `threshold`
- `resolved`

**Relationship rules:**
- One athlete → many sessions.
- One session → one ride metrics row OR many gym sets OR one+ CMJ tests.
- Daily marts are athlete-date snapshots built from all available sources.

---

### 1.3 Suggested Folder Structure

```text
whoop_dashboard/
  app/
    Home.py
    pages/
      1_Executive_Summary.py
      2_Load_Monitoring.py
      3_Recovery_Autonomic.py
      4_Performance.py
      5_Flagging_Engine.py
  config/
    settings.yaml
    thresholds.yaml
    weights.yaml
  data/
    raw/
      strava/
      whoop/
      gym/
      cmj/
      wellness/
    processed/
    marts/
  ingestion/
    strava_ingest.py
    whoop_ingest.py
    gym_csv_ingest.py
    cmj_csv_ingest.py
    scheduler.py
  modeling/
    build_daily_mart.py
    baselines.py
    te_swc.py
    indices.py
    flag_engine.py
  analytics/
    power_duration.py
    lag_correlation.py
    trends.py
  tests/
    test_indices.py
    test_flag_engine.py
  docs/
    metric_definitions.md
    data_dictionary.md
  requirements.txt
  README.md
```

---

### 1.4 API vs CSV Ingestion Strategy

Use a **hybrid ingestion architecture**:

- **API-first** where stable APIs exist:
  - Strava (cycling sessions and streams where available).
  - WHOOP recovery/sleep/strain.
- **CSV-first** where ecosystem fragmentation is high:
  - Gym systems (velocity/RPE frequently vendor-specific).
  - CMJ platforms (export formats vary by force plate/jump mat vendors).

Operational strategy:
- Run API sync jobs hourly/daily with incremental pulls (`last_successful_sync` watermark).
- Run CSV drop-folder ingestion with schema validation + mapping templates.
- Keep immutable raw payloads for audit/replay.
- Build idempotent transforms to processed and mart layers.

---

## 2) Core Dashboard Sections

## A. Executive Summary

Purpose: **single-screen decision board for coach + sport scientist.**

Widgets:
- **Weekly Readiness Score** (0–100) with 7-day sparkline.
- **Load vs Recovery Balance** (composite gauge or balance bar).
- **Acute:Chronic Load Ratio** (overall + discipline-specific).
- **Top Flags panel** sorted by severity and practical urgency.
- **Decision hint**: `Push`, `Maintain`, `Deload`, `Investigate`.

Key signals shown in first viewport:
- Readiness index percentile vs personal baseline.
- Fatigue index trend (last 14 days).
- Any red flags exceeding TE/SWC thresholds.

---

## B. Load Monitoring

Panels:
1. **Cycling Load**
   - Daily TSS bars + 7d/28d EWMA lines.
   - Power zone distribution stacked area.
   - IF and ride duration overlays.

2. **Gym Load**
   - Tonnage by movement pattern (squat/hinge/push/pull).
   - Intensity distribution (% sessions in high/medium/low load bands).
   - Velocity loss trend (if velocity available).

3. **CMJ Exposure**
   - Test frequency compliance (planned vs actual).
   - Time-series of jump height and impulse metrics.

4. **Acute vs Chronic**
   - Discipline-specific ACWR and global load index.
   - Highlight non-functional spikes (e.g., ACWR > threshold with suppressed recovery).

---

## C. Recovery & Autonomic

Panels:
- **HRV**: raw + rolling mean + SWC band + TE band.
- **RHR**: trend and baseline delta.
- **Sleep**: duration, efficiency, debt accumulation.
- **WHOOP strain vs external load (TSS/tonnage)** scatter/dual-axis trend to detect dissociation.

Interpretation layer:
- Elevated strain with low external load may suggest non-training stress.
- HRV suppression + RHR elevation + sleep deficit cluster generates fatigue-risk flag.

---

## D. Performance Metrics

Panels:
- **FTP trend** with confidence band and detected slope changes.
- **Strength progression** by key lifts (estimated 1RM or load-velocity profile shifts).
- **CMJ output vs strategy**
  - Output: jump height, peak power, impulse.
  - Strategy: countermovement depth/time ratios, eccentric:concentric contribution.
- **Power-duration curve** (best efforts over 5s–60min windows).

Interpretive objective:
- Separate true capacity changes from altered movement strategies compensating for fatigue.

---

## E. Flagging Engine

### Threshold logic hierarchy
1. **Beyond Typical Error (TE)**
   - Flag if `|delta| > k * TE` (k often 1.0–1.5 depending risk tolerance).
2. **Z-score deviations**
   - Flag if `|z| > 1.5` (amber), `|z| > 2.0` (red) versus rolling baseline.
3. **Rolling baseline comparisons**
   - Current 3-day or 7-day mean vs 28-day individual baseline.

### Distinguishing event classes
- **Output decline**: drop in performance outputs (FTP, jump height, strength) without major strategy changes.
- **Capacity shift**: persistent multi-metric trend change (>=2 weeks) suggesting adaptation/detraining.
- **Strategy change**: stable output with altered CMJ ratios/temporal signatures indicating compensation.

### Alert schema example
- `red`: CMJ jump height -6.2% vs baseline, exceeds TE and SWC, with concurrent HRV suppression.
- `black`: within normal variation, monitor only.
- `green`: performance gain beyond SWC with stable/recovering autonomic markers.

---

## 3) Visual Design Principles

- **Minimalist information density**: prioritize trend + context + uncertainty, avoid decorative chart junk.
- **Dark mode option** with high-contrast flags and accessible color palettes.
- **Executive-first layout**: top summary row, drill-down tabs beneath.
- Use:
  - Rolling averages (7d, 28d)
  - Confidence/uncertainty bands
  - Flag colors:
    - **Green** = improving
    - **Black** = stable
    - **Red** = decline

UI behavior:
- Any flag click opens metric-level diagnostics (raw points, baseline, TE/SWC, contextual load/recovery covariates).

---

## 4) Analytics Layer (Core Calculations)

All indices should be individualized and recalibrated monthly.

### 4.1 Readiness Index (0–100)

Inputs (example):
- HRV z-score (higher is better)
- Sleep duration/efficiency z-score (higher is better)
- RHR inverse z-score (lower RHR is better)
- Optional wellness composite

Example formula:

`Readiness = 50 + 10*(0.40*HRV_z + 0.30*Sleep_z - 0.20*RHR_z + 0.10*Wellness_z)`

Then clamp to [0,100], and optionally smooth with 3-day EWMA.

### 4.2 Adaptation Index

Measures whether performance trend is favorable given recent load.

Example structure:
- `PerfTrend = slope(FTP, strength, CMJ output over last 21–42 days)`
- `LoadDose = chronic load + monotony penalties`
- `AdaptationIndex = standardized(PerfTrend / LoadDoseAdjusted)`

Interpretation:
- Positive: productive adaptation.
- Near zero: maintenance/plateau.
- Negative: maladaptation or insufficient stimulus quality.

### 4.3 Fatigue Index

Captures short-term strain burden + autonomic suppression.

Example:
- `AcuteLoadScore` from 3–7 day load relative to 28-day chronic load
- `AutonomicPenalty` from HRV suppression + RHR elevation + sleep debt
- `FatigueIndex = 0.6*AcuteLoadScore + 0.4*AutonomicPenalty`

Risk zones:
- Low (<40), Moderate (40–60), High (>60).

### 4.4 Strategy Stability Index (CMJ)

Detects movement strategy drift independent of output.

Inputs:
- Eccentric:concentric impulse ratio
- Time to takeoff
- Countermovement depth/time variables
- Braking phase contribution

Method:
- Compute multivariate distance from personal baseline centroid (e.g., Mahalanobis or robust z-composite).
- Convert to 0–100 stability score (higher = more stable strategy).

Use case:
- Falling stability with preserved jump height = early compensation signal.

---

## 5) Future Extensions

1. **Predictive modeling**
- Next-7-day readiness forecast.
- Injury/illness risk probability with calibrated uncertainty.

2. **Lag correlation analysis**
- Quantify athlete-specific lag windows between load inputs and performance/recovery outputs.
- Use distributed lag or cross-correlation matrices.

3. **Auto-generated weekly narrative**
- Model-generated summary:
  - What changed materially?
  - Which changes are meaningful vs noise?
  - Suggested action for next microcycle.

---

## Wireframe Description (textual)

### Screen 1: Executive Summary
- Top row: Readiness (big number), Fatigue, Adaptation, ACWR.
- Middle row: Load vs Recovery balance chart; top 5 flags.
- Bottom row: Decision support card with rationale and confidence.

### Screen 2: Load Monitoring
- Left: Cycling timeline (TSS + zones).
- Middle: Gym tonnage/intensity/velocity.
- Right: CMJ exposure + trend.
- Footer: ACWR by modality.

### Screen 3: Recovery & Autonomic
- HRV + SWC/TE bands.
- RHR and sleep debt trends.
- Strain vs external load dissociation plot.

### Screen 4: Performance
- FTP trajectory + changepoints.
- Strength progression table + plots.
- CMJ output/strategy linked charts.
- Power-duration curve comparison (current vs best block).

### Screen 5: Flagging Engine
- Event timeline and filter panel.
- Rule transparency panel (which thresholds fired).
- Practical action suggestions with confidence grading.

---

## Example Metric Definitions

- **Smallest Worthwhile Change (SWC)**: `0.2 * between-subject SD` or individual benchmark-based practical threshold.
- **Typical Error (TE)**: within-athlete measurement noise from repeated measures.
- **Meaningful change**: exceed both TE and SWC when possible.
- **Signal-to-noise ratio**: `|observed_change| / TE`.

Practical defaults (to tune per athlete/device):
- HRV suppression flag: >0.5–1.0 SD below 28-day baseline for >=2 days.
- RHR elevation flag: >3–5 bpm above baseline.
- CMJ output decline flag: >1.5*TE and >SWC.
- ACWR caution band: >1.3; high risk >1.5 (context-dependent, not standalone).

---

## Suggested Implementation Steps (12-week rollout)

1. **Weeks 1–2: Foundations**
- Set up repository, env, data model, and ingestion scaffolding.
- Implement raw-to-processed ETL for Strava and WHOOP.

2. **Weeks 3–4: Multi-source ingestion**
- Add gym and CMJ CSV parsers with schema contracts.
- Build daily feature mart.

3. **Weeks 5–6: Core analytics**
- Implement rolling baselines, z-scores, TE/SWC modules.
- Implement Readiness/Fatigue/Adaptation/Strategy indices.

4. **Weeks 7–8: Dashboard modules**
- Build Executive, Load, Recovery, and Performance pages.
- Add drill-down interactions and athlete filters.

5. **Weeks 9–10: Flagging engine + decision layer**
- Deploy hierarchical threshold logic.
- Add interpretable flags and action suggestions.

6. **Weeks 11–12: Validation + refinement**
- Backtest flags against known training blocks.
- Calibrate thresholds per athlete.
- Add weekly narrative prototype and lag-correlation beta.

---

## Decision-Making Framework Embedded in the Dashboard

Each daily recommendation should map to one of four states:
- **Push**: high readiness, low fatigue, stable strategy, positive adaptation.
- **Maintain**: moderate readiness and stable trends.
- **Deload**: high fatigue and/or autonomic suppression with performance drift.
- **Investigate**: conflicting signals (e.g., output stable but strategy instability rising).

This ensures the dashboard functions as a **performance intelligence system**, not just a monitoring screen.
