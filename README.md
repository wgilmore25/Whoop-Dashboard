# Training Readiness Dashboard

A coach-grade personal dashboard that ingests WHOOP and Strava data, normalizes it into daily metrics, runs a deterministic rules-based recommendation engine, and presents today's training readiness in a clean, readable UI.

---

## What it does

1. **Connects** to WHOOP and Strava via OAuth 2.0
2. **Syncs** recent recovery, sleep, cycles, and activity data
3. **Normalizes** raw data into one `daily_metrics` row per day (rolling baselines, load proxies, flags)
4. **Computes** a deterministic training recommendation (zone2, tempo, high_intensity, etc.) via a Python FastAPI microservice
5. **Explains** the recommendation in plain language — no LLM required
6. **Displays** everything in a clean dashboard with trend charts

The recommendation engine is purely rules-based. There is no ML model. Every output is traceable to a specific rule and a set of measurable inputs.

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Next.js 15 (App Router + TypeScript)   │
│  Tailwind CSS + shadcn/ui components    │
│  Pages: /dashboard /connect /history    │
│         /settings /login /signup        │
└──────────────┬──────────────────────────┘
               │ server-side API routes
               │
   ┌───────────▼───────────┐    ┌─────────────────────────┐
   │  Supabase Postgres     │    │  Python FastAPI          │
   │  - 10 tables + RLS     │    │  POST /compute-          │
   │  - Auth                │◄───│    recommendation        │
   │  - Service role client │    │  Deterministic rules v1  │
   └───────────────────────┘    └─────────────────────────┘
               │
   ┌───────────▼───────────┐
   │  External APIs         │
   │  - WHOOP API v1        │
   │  - Strava API v3       │
   └───────────────────────┘
```

---

## Folder structure

```
training-readiness-dashboard/
├── app/                          # Next.js App Router
│   ├── dashboard/page.tsx        # Main dashboard
│   ├── connect/page.tsx          # OAuth connection management
│   ├── history/page.tsx          # History table
│   ├── settings/page.tsx         # User preferences
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── api/
│       ├── whoop/connect/        # Start WHOOP OAuth
│       ├── whoop/callback/       # WHOOP token exchange
│       ├── strava/connect/       # Start Strava OAuth
│       ├── strava/callback/      # Strava token exchange
│       ├── sync/                 # Trigger data sync
│       └── recommendation/       # Compute & store recommendation
├── components/
│   ├── ui/                       # Primitives: Button, Card, Badge
│   ├── cards/                    # RecoveryCard, SleepCard, LoadCard, etc.
│   ├── charts/                   # RecoveryLoadChart, SleepRecommendationChart
│   └── layout/                   # AppShell, Nav
├── lib/
│   ├── types.ts                  # Shared TypeScript types
│   ├── utils.ts                  # cn(), formatters, color maps
│   ├── mock-data.ts              # Mock payloads for dev/demo mode
│   ├── supabase/                 # client.ts, server.ts, middleware.ts
│   ├── sync/                     # whoop.ts, strava.ts, normalization.ts
│   ├── recommendations/          # FastAPI client + fallback
│   └── explanations/             # Deterministic explanation generator
├── python-service/
│   ├── main.py                   # FastAPI app
│   ├── models.py                 # Pydantic I/O models
│   ├── rules.py                  # Rules engine (Rules A–E)
│   ├── requirements.txt
│   └── tests/
│       ├── test_rules.py
│       └── test_normalization.py
├── supabase/migrations/
│   ├── 001_initial_schema.sql
│   └── 002_rls_policies.sql
├── scripts/
│   └── seed-mock-data.ts
└── __tests__/
    └── explanation-generator.test.ts
```

---

## Required environment variables

Copy `.env.example` → `.env.local` and fill in values:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `WHOOP_CLIENT_ID` | WHOOP developer app client ID |
| `WHOOP_CLIENT_SECRET` | WHOOP developer app client secret |
| `WHOOP_REDIRECT_URI` | `http://localhost:3000/api/whoop/callback` |
| `STRAVA_CLIENT_ID` | Strava API application client ID |
| `STRAVA_CLIENT_SECRET` | Strava API application secret |
| `STRAVA_REDIRECT_URI` | `http://localhost:3000/api/strava/callback` |
| `FASTAPI_RECOMMENDATION_URL` | `http://localhost:8000` |
| `APP_BASE_URL` | `http://localhost:3000` |
| `FEATURE_FLAG_LLM_EXPLANATION` | `false` (keep off until implemented) |
| `NEXT_PUBLIC_MOCK_MODE` | `true` for demo mode, `false` for live |

---

## How to run locally

### Prerequisites

- Node.js 20+ and npm
- Python 3.11+

### 1. Install JS dependencies

```bash
cd training-readiness-dashboard
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local — for demo mode, leave NEXT_PUBLIC_MOCK_MODE=true
# and only fill in SUPABASE credentials if you want live auth
```

### 3. Start the Next.js app

```bash
npm run dev
# Open http://localhost:3000
```

In mock mode (`NEXT_PUBLIC_MOCK_MODE=true`), the login page bypasses auth and the dashboard renders with realistic demo data. No WHOOP, Strava, or Supabase credentials are required.

### 4. Start the Python recommendation service (optional in mock mode)

```bash
cd python-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The Next.js API route at `/api/recommendation` calls this service. If it's unavailable, it falls back gracefully.

---

## How to connect WHOOP

1. Go to [developer.whoop.com](https://developer.whoop.com) and create an application
2. Set the OAuth redirect URI to: `http://localhost:3000/api/whoop/callback`
3. Copy the Client ID and Secret into `.env.local`
4. Set `NEXT_PUBLIC_MOCK_MODE=false`
5. Visit `/connect` → click "Connect WHOOP"

Required scopes: `read:recovery read:sleep read:workout read:cycle read:body_measurement`

---

## How to connect Strava

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app
2. Set Authorization Callback Domain to: `localhost`
3. Copy the Client ID and Secret into `.env.local`
4. Set `NEXT_PUBLIC_MOCK_MODE=false`
5. Visit `/connect` → click "Connect Strava"

Required scopes: `read,activity:read_all`

---

## How to set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Copy your project URL and keys into `.env.local`
3. Open the Supabase SQL editor and run migrations in order:
   ```
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_rls_policies.sql
   # Continue through every later numbered migration, including 007.
   ```
4. Create a user via Supabase Auth → Authentication → Users → Add user

---

## How to seed mock data

After setting up Supabase and creating a user:

```bash
SEED_USER_ID=your-supabase-user-uuid npx ts-node scripts/seed-mock-data.ts
```

This inserts 14 days of realistic WHOOP + Strava data for testing live database features.

---

## How to run tests

### Python recommendation engine tests

```bash
cd python-service
source .venv/bin/activate
pytest tests/ -v
```

### TypeScript explanation generator tests

```bash
npm test
```

---

## Backups and version history

This project is connected to GitHub. Use the workflow in
[`docs/BACKUP_WORKFLOW.md`](docs/BACKUP_WORKFLOW.md) after every meaningful
change. In short: `git pull --rebase`, commit a descriptive snapshot, then
`git push`. Real credentials remain in `.env.local` and must never be committed.

---

## Load proxy

The normalization pipeline estimates training load using this priority:

1. **Direct kilojoules** from power meter (most accurate)
2. **Weighted avg watts × moving time** (power-based estimate)
3. **Average HR × duration proxy** — `(avg_hr - 60) / 100 × minutes × 10`
4. **Duration fallback** — 5 kJ per minute

This is intentionally simple and explainable. The proxy is documented in `lib/sync/normalization.ts` and replicated in `python-service/tests/test_normalization.py`.

---

## Recommendation engine rules

| Rule | Condition | Output |
|---|---|---|
| A | Low recovery OR fatigue flag OR (high load + bad sleep) | `recovery` or `off` |
| B | Moderate recovery OR moderate load OR recent HIIT | `zone2` |
| C | High recovery + good sleep + stable HRV + no recent HIIT | `tempo` or `high_intensity` |
| D (post) | High single-day score but very high 7-day load | Downgrade by one level |
| E (post) | Endurance fatigue high → `strength_allowed=false`; readiness good → `true` | Modifies any rule output |

---

## Next recommended product improvements

1. **Encrypt OAuth tokens** at rest — use Supabase Vault or a KMS key before production
2. **CSRF protection** — store OAuth `state` parameter in a server-side session and validate on callback
3. **Cron sync jobs** — replace manual "Sync Now" with a scheduled job (Supabase Edge Functions or a cron service)
4. **Garmin / Apple Watch / Polar integration** — the data model is provider-agnostic
5. **Training load model refinement** — replace the kJ proxy with CTL/ATL/TSB (fitness/fatigue/form) using actual power or heart rate data
6. **Personalized rule tuning** — baseline thresholds (e.g., recovery_low=34) should adapt to each user's historical data
7. **Mobile-responsive layout** — cards stack well on mobile but the nav bar needs a hamburger menu
8. **Notification system** — email or push when recovery drops suddenly or a quality day is available
9. **Coach sharing mode** — read-only shareable dashboard link for a coach
10. **LLM explanation layer** — plug in behind the existing `FEATURE_FLAG_LLM_EXPLANATION` flag; the interface is already stubbed in `lib/explanations/generator.ts`
