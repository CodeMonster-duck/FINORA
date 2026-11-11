# FINORA — Release Readiness, Security & Operations Guide

**Last Updated:** 2026-11-12  
**Status:** Local full-stack development verified; **not yet deployed to a production host** (see Section 5 for remaining deployment blockers).

---

## 1. Local Startup Instructions

### Backend (`FINORA/backend`)
From `c:\Users\warri\OneDrive\Desktop\FINORA\backend`:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

> **Note:** If you had an older `uvicorn` instance running without `--reload`, restart it using the command above so the updated security settings (`config.py`, `rate_limit.py`, `auth.py`, `main.py`) take effect on port `8000`.

### Frontend (`FINORA/frontend`)
From `c:\Users\warri\OneDrive\Desktop\FINORA\frontend`:

```powershell
npm.cmd run dev
```

Open `http://localhost:5173/` in your browser.

---

## 2. Required Environment Variables

### Backend (`backend/.env`, copied from `backend/.env.example`)

| Variable | Local Default | Production Requirement |
|---|---|---|
| `APP_NAME` | `FINORA API` | Application display name |
| `APP_ENV` | `development` | Must be set to `production` |
| `API_V1_PREFIX` | `/api/v1` | API path prefix |
| `DATABASE_URL` | `sqlite:///./finora.db` | Production DB URI (PostgreSQL recommended for multi-worker deployments) |
| `SECRET_KEY` | Ephemeral CSPRNG key generated per process in dev if unset | **Required** (`>= 32` chars; generate via `python -c "import secrets; print(secrets.token_urlsafe(48))"`). Startup fails if missing or placeholder when `APP_ENV=production` |
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Consider shorter TTL (`15`–`60` min) + refresh strategy in production |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | **Required explicit HTTPS list** (e.g., `https://finora.yourdomain.com`). Wildcards (`*`) and `http://` origins are rejected in production |
| `REQUIRE_HTTPS` | `false` (dev) / `true` (prod) | Enforces `HTTPSRedirectMiddleware` & `Strict-Transport-Security` |
| `AUTO_SEED_DEMO` | `false` | Forced `false` in production; seeds blocked outside dev |
| `ENABLE_DEMO_LOGIN` | `false` | Forced `false` in production; `POST /api/v1/auth/demo-login` returns `403` unless explicitly enabled in dev |
| `RATE_LIMIT_LOGIN_PER_MIN` | `15` | Per-IP login attempts per minute |
| `RATE_LIMIT_REGISTER_PER_MIN` | `10` | Per-IP registrations per minute |

### Frontend (`frontend/.env`, copied from `frontend/.env.example`)

| Variable | Local Value | Production Requirement |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000/api/v1` | Must point to your HTTPS API domain (e.g. `https://api.yourdomain.com/api/v1`) |

*(Both `.env` and `backend/backups/` are excluded via `.gitignore`.)*

---

## 3. Production Security Controls & Recommendations

### Implemented in Codebase
- **Fail-Closed Secrets**: Static insecure fallback `SECRET_KEY` values were removed from [config.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/core/config.py). Production mode refuses to boot without a `>= 32`-character non-placeholder `SECRET_KEY`.
- **Password Hashing**: `bcrypt` (`5.0.0`) with per-password random salts in [security.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/core/security.py).
- **Demo Isolation**: `AUTO_SEED_DEMO` and `ENABLE_DEMO_LOGIN` both default to `false`, `POST /api/v1/auth/demo-login` returns `403`, and `seed_demo_database()` raises `RuntimeError` in production.
- **Explicit CORS & Security Headers**: [main.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/main.py) restricts CORS methods/headers, validates explicit HTTPS origins in production, enables `HTTPSRedirectMiddleware` when `REQUIRE_HTTPS=true`, and emits `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Strict-Transport-Security` (when HTTPS/production is active).
- **Auth Rate Limiting (Single-Process)**: [rate_limit.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/core/rate_limit.py) enforces per-IP sliding-window throttling (`429 Too Many Requests` + `Retry-After`) on `/auth/login`, `/auth/register`, and `/auth/demo-login`.
- **Strict Tenant Isolation**: Every private endpoint requires `Depends(get_current_user)` and scopes SQLAlchemy queries by `user_id == current_user.id`.

### Required for Production Deployment
1. **TLS / HTTPS Termination**: Place FastAPI behind Nginx, Caddy, Cloudflare, or a cloud load balancer serving valid TLS certificates; never expose plain HTTP in production.
2. **Distributed Rate Limiting**: Replace or supplement the in-memory `SlidingWindowRateLimiter` with Redis-backed `slowapi` (or reverse-proxy rate limiting) when running multiple Uvicorn/Gunicorn workers.
3. **Token Storage & Rotation**: Moving JWT storage from `localStorage` to `HttpOnly; Secure; SameSite=Lax` cookies with short-lived access tokens and refresh rotation further mitigates XSS token theft.

---

## 4. Database Safety, Migrations, Backup & Restoration

### Foreign-Key Enforcement & Schema / Migration Status
- **Foreign Keys**: [connection.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/database/connection.py) attaches a SQLAlchemy `connect` listener running `PRAGMA foreign_keys=ON;`. Verified live: `PRAGMA foreign_keys` returns `1`.
- **Migration Inspection**: [0001_initial_schema.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic/versions/0001_initial_schema.py) matches all 6 tables (`users`, `transactions`, `budgets`, `savings_goals`, `savings_contributions`, `notifications`) and columns in `backend/finora.db`. However, `alembic` is **not** installed in `backend/venv` yet, and tables were initialized via `Base.metadata.create_all()` (no `alembic_version` table exists yet). Before running future schema migrations, install `alembic` and run `alembic stamp 0001_initial_schema`.

### Creating an Online SQLite Backup
Run from `FINORA/backend`:

```powershell
.\venv\Scripts\python.exe scripts\backup_db.py
```

[backup_db.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/scripts/backup_db.py) uses SQLite's online `Connection.backup()` API (safe while FastAPI is running) and executes `PRAGMA integrity_check;` on the resulting snapshot under `backend/backups/`.

### Restoring a Backup Safely
1. Stop the running FastAPI/Uvicorn backend process so no writes are in flight.
2. Preserve the current database file before overwriting:
   ```powershell
   Copy-Item backend\finora.db backend\finora.db.pre-restore
   ```
3. Verify the target backup file's integrity, then copy it into place:
   ```powershell
   .\backend\venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('backend/backups/<backup-file>.db'); print(c.execute('PRAGMA integrity_check;').fetchone()); c.close()"
   Copy-Item backend\backups\<backup-file>.db backend\finora.db -Force
   ```
4. Restart the FastAPI server and verify `GET /health` and user record counts.

---

## 5. Deployment Blockers Remaining

- **No Production Host / TLS Reverse Proxy Configured**: Currently verified only on local HTTP (`http://127.0.0.1:8000` and `http://localhost:5173`).
- **No `alembic` Installed in `venv`**: Automated schema version upgrades require installing `alembic` and stamping `0001_initial_schema`.
- **SQLite Concurrency**: Single-file SQLite works well for local/capstone use, whereas multi-instance cloud hosting should migrate `DATABASE_URL` to managed PostgreSQL with scheduled automated backups.
- **Missing Account Lifecycle Endpoints**: Password reset, email verification, and self-service `DELETE /auth/me` are not implemented.

---

## 6. Verified vs. Unverified Features (Honest Summary)

### Verified
- **Frontend Production Build & Lint**: `npm.cmd run build` (`tsc -b && vite build`, `✓ built in 4.82s`) and `npm.cmd run lint` (`0` errors, `0` warnings).
- **Zero Demo Data in Live Flows**: `Select-String` across `frontend/src/**/*.{ts,tsx}` confirmed `0` live references to `demoData` or demo login.
- **Backend Security Hardening**: Verified on isolated test runs (`config.py` production fail-closed checks for `SECRET_KEY` and HTTPS `CORS_ORIGINS`, `SlidingWindowRateLimiter` `429` throttling, `PRAGMA foreign_keys = 1`) and via ephemeral `uvicorn` check on port `8009` (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `POST /api/v1/auth/demo-login` returning `403`, `POST /api/v1/auth/register` returning `201`).
- **Database Backup & Restore**: Created verified backup (`finora-backup-20261112-013754.db`) and confirmed copy-restore + `PRAGMA integrity_check` (`ok`, `2` preserved users).
- **Two-Account API Data Isolation**: Confirmed Account B sees `0` records, `0.0` balance, `0` notifications, no Account A rows in CSV export, and `404` on cross-account `GET/PUT/DELETE` requests.
- **Backend API Smoke Suite**: `38/38` passed against `http://127.0.0.1:8000` (including ₹5,000 budget minus ₹1,000 expense = ₹4,000 remaining / `20.0%` utilization).
- **Focused Live Browser UI Checks (`http://localhost:5173`)**: Verified registration, transaction edit (`₹1,000` → `₹1,500`) & delete with live budget recalculation (`20.0%` → `30.0%`), notification mark-read (`1` → `0`), CSV export download (`finora-transactions-2026-11-12.csv`), and Light/Dark theme persistence across browser reload (`0` console errors, `0` network errors).

### Unverified / Pending
- **Live Port `8000` Process Restart**: The external `uvicorn` process (`PID 17616`) on port `8000` was started before the latest backend security edits and has not been restarted by this session; restart it locally to activate the hardened security middleware and `403` demo-login guard on port `8000`.
- **Production Deployment, HTTPS & Multi-Worker Load Testing**: Not performed against a remote production server or PostgreSQL instance.
- **Analytics Date Filter Clicks in UI**: Not re-tested interactively in the browser during the final focused UI pass (analytics logic and API endpoints were verified via backend tests).
