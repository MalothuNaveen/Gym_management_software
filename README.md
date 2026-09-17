# Gym Management System

A small, fast, mobile-friendly web application that replaces a local gym's
notebook, Excel sheets and manual receipt book.

Built for **one gym with around 50 members**, and structured so it can grow to
several hundred without a rewrite.

---

## What it does

| Area | What the owner can do |
|---|---|
| **Members** | Add, search, edit, archive. Photo from the phone camera or gallery. Automatic member IDs (`GYM-0001`). |
| **Memberships** | Sell a plan, override dates, renew. Every past term is kept. |
| **Payments** | Full, partial and advance payments. Balances calculated automatically. Nothing is ever overwritten. |
| **Receipts** | Numbered (`REC-2026-0001`), professional PDF, download / share / WhatsApp / email / print. |
| **Attendance** | Search a member, tap **Check In**. One check-in per member per day. |
| **Expiry tracking** | Dashboard list of who needs renewing, plus 7 / 15 / 30-day views. |
| **Staff & salary** | Monthly salary, payments, advances and what remains — in four numbers. |
| **Expenses** | Simple spend log by category, netted against income. |
| **Reports** | Monthly summary, collections, attendance, CSV export of everything. |
| **Backup** | One ZIP containing every record as a spreadsheet. |

It works on a phone, a tablet and a desktop, and can be installed to the home
screen as an app (PWA).

---

## Architecture

```
┌──────────────────────┐        HTTPS + JWT        ┌───────────────────────┐
│  Frontend (SPA)      │ ────────────────────────► │  Backend (FastAPI)    │
│  React + Vite + TS   │                           │  Python 3.12          │
│  Cloudflare Pages    │ ◄──────────────────────── │  Google Cloud Run     │
└──────────────────────┘        JSON / PDF         └──────────┬────────────┘
                                                              │
                                            ┌─────────────────┴─────────────┐
                                            │                               │
                                  ┌─────────▼────────┐        ┌─────────────▼──────┐
                                  │ PostgreSQL       │        │ Object storage     │
                                  │ (Neon free tier) │        │ (GCS, private)     │
                                  └──────────────────┘        └────────────────────┘
```

**Principles the code sticks to**

- **Money is decided on the server.** Every fee, discount, balance and salary
  figure is computed in Python with `Decimal`. The browser only displays a live
  preview; it is never trusted.
- **Financial records are append-only.** Payments are never edited or deleted —
  a mistake is corrected by voiding (which keeps the row) plus a new entry.
  Members and plans are archived, not removed.
- **Multi-tenant ready.** Every table already carries `gym_id`. V1 ships a
  single-gym UI; adding a second gym needs no migration.
- **Portable SQL only.** No Postgres-specific column types, so the identical
  schema runs on SQLite for local development and tests.

---

## Technology

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19, Vite 6, TypeScript, Tailwind v4 | Fast builds, small bundle (~118 KB gzipped) |
| Data fetching | TanStack Query | Caching, loading and error states for free |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic | Typed, well-documented, quick to run |
| Database | PostgreSQL 15+ (SQLite locally) | Free tier available, proper relational integrity |
| PDFs | ReportLab | Pure Python — no system libraries, small container |
| Images | Pillow | Re-encodes uploads, which also validates them |
| Auth | JWT (PyJWT) + bcrypt | Simple and secure; no third-party dependency |
| Storage | Google Cloud Storage, or local disk | Private bucket, random object keys |
| PWA | vite-plugin-pwa (Workbox) | Home-screen install, cached app shell |

---

## Local setup

**Requirements:** Python 3.12+, Node 20+. No database server needed — local
development uses a SQLite file.

### 1. Backend

```bash
cd backend

python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements-dev.txt

cp .env.example .env        # then edit .env (see below)

uvicorn app.main:app --reload --port 8000
```

On first start the app creates the gym, the owner login and four starter
membership plans (Monthly, 3 / 6 / 12 Months).

API docs while developing: <http://127.0.0.1:8000/docs>

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the backend on port 8000,
so there is no CORS setup in development.

### 3. Sign in

Use `OWNER_EMAIL` and `OWNER_PASSWORD` from `backend/.env`
(default `owner@gym.local` / `ChangeMe123!`).

> **Change this password immediately** in Settings → Your Account.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `APP_ENV` | no | `development` | `production` hides `/docs` |
| `DATABASE_URL` | **yes in prod** | `sqlite:///./gym.db` | Postgres: `postgresql+psycopg://USER:PASS@HOST/DB?sslmode=require` |
| `JWT_SECRET` | **yes in prod** | dev placeholder | Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | `720` | 12 hours |
| `CORS_ORIGINS` | **yes in prod** | localhost | Comma-separated; must list your Pages URL |
| `OWNER_EMAIL` / `OWNER_PASSWORD` / `OWNER_NAME` | first run only | — | Seeds the owner account on an empty database |
| `GYM_NAME` / `GYM_PHONE` / `GYM_ADDRESS` / `GYM_TIMEZONE` | no | Indian defaults | Editable later in Settings |
| `STORAGE_BACKEND` | no | `local` | `local` or `gcs` |
| `STORAGE_LOCAL_DIR` | no | `./uploads` | Used when `STORAGE_BACKEND=local` |
| `STORAGE_BUCKET` | if `gcs` | — | Must be a **private** bucket |
| `GOOGLE_APPLICATION_CREDENTIALS` | no | — | Leave empty on Cloud Run; use the attached service account |
| `MAX_UPLOAD_BYTES` | no | `8388608` | 8 MB |
| `PHOTO_MAX_DIMENSION` | no | `800` | Longest side after resize |
| `BCRYPT_ROUNDS` | no | `12` | Lowered only by the test suite |

### Frontend (`frontend/.env.local`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | production only | e.g. `https://gym-api-xxxx.run.app/api`. Leave unset locally so the Vite proxy is used. |

**Never commit a real `.env`.** `.gitignore` already excludes it.

---

## Database

### Migrations

The schema is managed by Alembic and is the source of truth in production.

```bash
cd backend
alembic upgrade head            # apply
alembic revision --autogenerate -m "describe the change"
alembic downgrade -1            # roll back one step
```

The container runs `alembic upgrade head` automatically on start.

> On SQLite the app calls `create_all()` on startup instead, so local
> development needs no migration step.

### Tables

| Table | Holds |
|---|---|
| `gyms` | The tenant: name, address, contact, logo |
| `settings` | Per-gym config **and the ID sequence counters** |
| `users` | Login accounts (owner / admin / staff) |
| `members` | People, photos, contact and emergency details |
| `membership_plans` | Sellable plans — deactivated, never deleted |
| `memberships` | One row per purchased term; renewals add rows |
| `payments` | Append-only money in |
| `receipts` | Numbered, immutable snapshot per payment |
| `attendance` | One row per member per day (unique constraint) |
| `staff` | Payroll people |
| `staff_salary_records` | Salary, advances and other payouts |
| `expenses` | Money out |

Indexed for the lookups that actually happen: member name, phone, member code,
membership expiry, payment date and attendance date.

### How the money works

Two formulas cover every case, and both live on the server:

```
Final Amount = Membership Fee − Discount        (discount capped at the fee)
Balance      = Σ membership.final_amount − Σ payments (not voided)
```

A positive balance is money owed. A negative balance is an advance, shown as
credit. Partial payments, full payments and advances need no special handling.

Staff salary for a month:

```
Remaining = Monthly Salary − Salary paid this month − Advances this month
```

---

## Development commands

```bash
# Backend
cd backend
uvicorn app.main:app --reload --port 8000    # run
pytest                                        # all tests
pytest tests/test_payments.py -v              # one file
pytest -k "balance"                           # by name

# Frontend
cd frontend
npm run dev          # dev server
npm run typecheck    # TypeScript only
npm run build        # production build into dist/
npm run preview      # serve the built bundle
```

---

## Testing

```bash
cd backend && pytest
```

**174 tests** covering authentication and authorization, member creation and
search, ID generation, partial / full / advance payments, balance arithmetic,
membership dates and expiry, renewals, attendance (including duplicate
prevention), receipt numbering and PDF layout, staff salary, expenses,
dashboard totals, reports, CSV export and photo upload security.

The business rules from the specification are asserted directly, for example:

```
fee 3,000 − discount 200 = 2,800
pay 2,000 → balance 800
pay 800   → balance 0

salary 15,000 − paid 10,000 − advance 2,000 = 3,000 remaining
```

Receipt PDFs are checked by parsing the generated file and asserting that no
text falls outside the page margins — a status code alone cannot see that.

---

## Build

```bash
cd frontend && npm run build     # -> frontend/dist
cd backend  && docker build -t gym-api .
```

---

## Deployment

### Database — Neon (free tier)

1. Create a project at <https://neon.tech>, region closest to the gym.
2. Copy the connection string and change the driver prefix:
   `postgresql://…` → `postgresql+psycopg://…`
3. Keep `?sslmode=require`.

### Storage — Google Cloud Storage

```bash
gcloud storage buckets create gs://YOUR-GYM-PHOTOS \
    --location=asia-south1 --uniform-bucket-level-access
```

Do **not** make it public. The API streams photos to signed-in staff only.

### Backend — Google Cloud Run

```bash
cd backend
gcloud run deploy gym-api \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --set-env-vars "APP_ENV=production,STORAGE_BACKEND=gcs,STORAGE_BUCKET=YOUR-GYM-PHOTOS,CORS_ORIGINS=https://yourgym.pages.dev" \
  --set-secrets "DATABASE_URL=gym-database-url:latest,JWT_SECRET=gym-jwt-secret:latest"
```

`--allow-unauthenticated` exposes the HTTP endpoint; the application's own JWT
login still guards every route. Store secrets in Secret Manager, not in flags.

Grant the Cloud Run service account `roles/storage.objectAdmin` on the bucket.

### Frontend — Cloudflare Pages

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Root directory | `frontend` |
| Environment variable | `VITE_API_URL = https://gym-api-xxxx.run.app/api` |

`public/_redirects` already handles SPA routing and `public/_headers` sets the
security headers.

### After deploying

1. Sign in with the seeded owner account and **change the password**.
2. Settings → gym name, address, phone, logo, receipt footer.
3. Membership Plans → adjust prices to the gym's real rates.

---

## Cost

For a gym with 50–100 members, on current free tiers:

| Service | Free allowance | Expected use | Cost |
|---|---|---|---|
| Neon PostgreSQL | 0.5 GB storage | well under 50 MB | **₹0** |
| Cloud Run | 2M requests, 360k GB-s / month | a few thousand requests | **₹0** |
| Cloud Storage | 5 GB (US regions) | ~60 KB per photo → ~6 MB | **₹0** |
| Cloudflare Pages | unlimited static requests | — | **₹0** |
| **Total** | | | **≈ ₹0 / month** |

Notes worth knowing before you rely on it:

- Cloud Storage's *always free* 5 GB applies to US multi-regions. An
  `asia-south1` bucket is billed, but ~6 MB costs a few paise a month.
- `--min-instances 0` means the first request after an idle period takes a few
  seconds to wake. Setting `--min-instances 1` removes that delay but costs
  roughly ₹800–1,200/month — worth it only if the wait annoys the owner.
- Neon suspends an idle database; the first query reconnects automatically.
- WhatsApp and email sharing use the phone's own share sheet, so there is **no
  messaging API cost**.

---

## Installing on a phone (PWA)

**Android (Chrome):** open the site → ⋮ menu → *Add to Home screen*.
**iPhone (Safari):** open the site → Share → *Add to Home Screen*.

It then opens full-screen like an app. The shell is cached so it loads on a
weak connection, but live data (members, payments) always needs the network —
financial figures are never served stale.

---

## Backup and export

**In the app:** Reports → **Download Backup** gives one ZIP containing every
member, membership, payment, attendance record, expense, salary entry and
outstanding due as CSV files that open in Excel.

Individual reports export separately from the same page.

**Recommended routine:** download the backup on the 1st of each month and email
it to yourself or copy it to a pen drive.

**Database-level backup:** Neon keeps point-in-time history on its free tier.
For your own copy:

```bash
pg_dump "postgresql://USER:PASS@HOST/DB?sslmode=require" -Fc -f gym-backup.dump
```

Photos live in the storage bucket and are not in the ZIP; copy them with
`gcloud storage rsync gs://YOUR-GYM-PHOTOS ./photo-backup` if you want them too.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Could not reach the server" | Backend is not running, or `VITE_API_URL` is wrong. Check `/health`. |
| Login always fails | Wrong password, or the database was reset — the owner is only seeded when the `users` table is empty. |
| Browser console shows a CORS error | Add the exact frontend origin (scheme + host, no trailing slash) to `CORS_ORIGINS` and redeploy. |
| Photos do not appear | The bucket is unreachable or the service account lacks `storage.objectAdmin`. Photos need a signed-in session — a direct URL will not work, by design. |
| Receipt prints `Rs.` instead of `₹` | No font with the rupee glyph was found. Install `fonts-dejavu-core` (the Dockerfile already does). |
| Signed out unexpectedly | The 12-hour token expired. Raise `ACCESS_TOKEN_EXPIRE_MINUTES` if that is inconvenient. |
| First request of the day is slow | Cloud Run cold start. See the cost notes above. |
| Dates look a day off | Set the right `timezone` in Settings; all dates use the gym's timezone, not the server's. |
| Member ID skipped a number | Expected. Numbers are allocated on save and never reused, so a failed save consumes one. |
| Attendance says "already marked present" | That member is already checked in today. Use **Undo** on the roster to correct it. |

---

## Project layout

```
backend/
  app/
    main.py            FastAPI app, CORS, error handlers
    config.py          environment settings
    db.py              engine and session
    deps.py            current user, gym scope, timezone-aware "today"
    security.py        bcrypt + JWT
    errors.py          turns every failure into a plain sentence
    models/            SQLAlchemy tables
    schemas/           request/response validation
    services/          business rules (money, membership, payments,
                       salary, receipts, PDF, storage, images, exports)
    routers/           HTTP endpoints
    seed.py            first-run gym, owner and starter plans
  alembic/             migrations
  tests/               174 tests
  Dockerfile

frontend/
  src/
    lib/               api client, auth, formatting, toasts, types
    components/ui/     Button, Field, Data, Overlay, Search, Avatar, PhotoCapture
    components/        ReceiptDialog, PaymentDialog, RenewDialog, form field groups
    components/layout/ AppShell (sidebar, bottom bar, page header)
    pages/             one file per screen
  public/              icons, _redirects, _headers
```

---

## Not built in V1

Deliberately left out to keep the app simple, and straightforward to add later:

- Automated WhatsApp / SMS / email reminders (needs a paid API; sharing is
  manual today and works well)
- QR-code attendance scanning
- Multi-gym UI (the database already supports it)
- Workout plans, diet plans, trainer scheduling
- Online payment collection
