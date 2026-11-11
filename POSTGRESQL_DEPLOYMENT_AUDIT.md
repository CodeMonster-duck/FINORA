# FINORA — Phase 1 PostgreSQL & Render Deployment Audit

**Date:** 2026-11-12  
**Target Stack:** Neon PostgreSQL + Render Web Service (FastAPI) + Render Static Site (React + Vite)  
**Repository:** `https://github.com/CodeMonster-duck/FINORA`  
**Phase 1 Constraint Status:** Local `backend/finora.db` and financial records were **not modified**; no cloud database was created; no Alembic migration was executed against SQLite; no Git push was executed.

---

## 1. Executive Summary: Is PostgreSQL Already Supported?

**Short Answer:** **Not out of the box before this audit; now code- and schema-ready pending live Neon PostgreSQL verification.**

Before Phase 1 fixes, running the backend against Neon PostgreSQL / Render had **five concrete blockers**:
1. **No PostgreSQL driver or Alembic package installed/declared:** `backend/requirements.txt` omitted `psycopg[binary]` and kept `alembic` commented out. Tested with `SQLAlchemy==2.1.8`: `postgresql://...` failed with `ModuleNotFoundError: No module named 'psycopg'`.
2. **`postgres://` URI rejection:** Tested with `SQLAlchemy==2.1.8`: `postgres://...` raised `NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:postgres`.
3. **Missing Render reverse-proxy handling (`HTTPSRedirectMiddleware` loop):** `config.py` defaulted `REQUIRE_HTTPS=True` whenever `APP_ENV=production`. Behind Render's TLS-terminating edge proxy (which forwards internal HTTP requests and plain-HTTP `/health` probes to Uvicorn), Starlette's `HTTPSRedirectMiddleware` responds with `307 Temporary Redirect`.
4. **Alembic index drift & env configuration:** `backend/alembic/versions/0001_initial_schema.py` created all 6 tables and `uq_budgets_user_category_month`, but omitted **all 16 SQLAlchemy indexes** (including composite query indexes `ix_transactions_user_date`, `ix_transactions_user_type`, and unique index `ix_users_email`) that exist in ORM models and `backend/finora.db`. `backend/alembic/env.py` also lacked URL normalization, SQLite batch mode, and direct engine construction (avoiding `%`-interpolation errors on URL-encoded passwords).
5. **Neon pooling & concurrency hardening:** `create_app_engine()` lacked `pool_recycle=300` / Neon `sslmode=require` fallback, and `auth_service.py` / `finance_service.py` did not catch PostgreSQL `IntegrityError` race conditions (`500` instead of `409 Conflict`).

All five issues have been fixed in source files while **preserving 100% local SQLite compatibility**.

---

## 2. Database Compatibility Audit Breakdown

| Area | Audit Result | Notes & Findings |
|---|---|---|
| **SQLAlchemy Version** | Compatible (`2.1.8`) | Declarative `Mapped[...]` ORM (`Base`) uses standard dialect-neutral SQLAlchemy 2 types (`Integer`/`SERIAL`, `BigInteger`, `String`, `Text`, `Boolean`, `DateTime(timezone=True)`). |
| **PostgreSQL Driver** | **Fixed in `requirements.txt`** | `SQLAlchemy==2.1.8` routes `postgresql://` to `psycopg` (v3). Added `psycopg[binary]>=3.2.0,<4.0.0` (prebuilt `libpq`, no OS build tools required on Render). |
| **URI Normalization** | **Fixed in `config.py`** | Added `normalize_database_url()` mapping `postgres://` and `postgresql://` → `postgresql+psycopg://` while preserving `postgresql+psycopg2://` and `sqlite:///...`. |
| **Raw SQL / SQLite-only SQL** | Compatible | Zero SQLite-specific queries (`sqlite_master`, `STRFTIME`, etc.) in `app/services/`, `app/api/`, or `app/models/`. Search uses `.ilike()`, prefix filtering uses `.like("YYYY-MM%")`, and `is_read` uses `.is_(False)`. Only `connection.py` executes `PRAGMA foreign_keys=ON;`, strictly gated to `backend_name == "sqlite"`. |
| **Date / Time Handling** | Compatible | `created_at` / `updated_at` use `DateTime(timezone=True)` (`TIMESTAMPTZ` on PostgreSQL, returning UTC-aware `datetime`). No Python naive-vs-aware comparisons occur in backend services; frontend `date-fns` `parseISO()` parses ISO-8601 `Z`/`+00:00` timestamps cleanly. Business dates (`date`, `month`, `target_date`) are fixed-width ISO strings (`VARCHAR(10)` / `VARCHAR(7)`). |
| **JSON Fields** | N/A (Compatible) | No `JSON`/`JSONB` model columns exist; schema is strictly relational across 6 tables. |
| **Foreign Keys & Cascades** | Compatible | Every child FK declares `ondelete="CASCADE"` at DB level and `cascade="all, delete-orphan"` at ORM level (`users` → `transactions`, `budgets`, `savings_goals`, `notifications`; `savings_goals` → `savings_contributions`). PostgreSQL enforces FKs natively. |
| **Unique Constraints** | Compatible + Race Guarded | `ix_users_email` (`UNIQUE`) and `uq_budgets_user_category_month` (`UNIQUE(user_id, category, month)`) compile identically for PostgreSQL. Added `IntegrityError` rollback → `409 Conflict` guards in `auth_service.py` and `finance_service.py`. |
| **Connection Pooling & Neon SSL** | **Fixed in `connection.py`** | SQLite keeps `check_same_thread=False` + `PRAGMA foreign_keys=ON` without unsupported `pool_size` args. PostgreSQL sets `pool_pre_ping=True`, `pool_recycle=300` (5-min Neon serverless suspend compatibility), `pool_size=5`, `max_overflow=10`, `pool_timeout=30`, plus `sslmode=require` fallback for `.neon.tech` hosts if omitted in query string. |
| **Backup Utility Note** | SQLite-only | `backend/scripts/backup_db.py` uses `sqlite3.Connection.backup()` for local dev. In production, rely on Neon's automated Point-in-Time Restore (PITR) / branching / `pg_dump`. |

---

## 3. Code & Configuration Changes Applied (Phase 1)

| File | Change Summary |
|---|---|
| [backend/app/core/config.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/app/core/config.py) | Added `normalize_database_url()`, normalized `Settings.database_url`, added `auto_init_db` (`AUTO_INIT_DB` env flag, default `True`), and defaulted `require_https` to `False` when `RENDER=true` unless explicitly set in `REQUIRE_HTTPS` (prevents proxy `307` loops while keeping HSTS active). |
| [backend/app/database/connection.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/app/database/connection.py) | Added `build_engine_options()` using `sqlalchemy.engine.make_url` to separate SQLite args (`check_same_thread=False` + FK pragma listener) from PostgreSQL pooling/Neon SSL args (`pool_pre_ping=True`, `pool_recycle=300`, `pool_size=5`, `max_overflow=10`, `pool_timeout=30`). |
| [backend/app/main.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/app/main.py) | Gated `init_db()` in `lifespan` behind `if settings.auto_init_db:` so Alembic-managed / multi-worker deployments can disable startup `create_all()` via `AUTO_INIT_DB=false`. |
| [backend/app/services/auth_service.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/app/services/auth_service.py) | Caught `sqlalchemy.exc.IntegrityError` on `register_user()` and `update_user_profile()` to roll back and return `409 Conflict`. |
| [backend/app/services/finance_service.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/app/services/finance_service.py) | Caught `sqlalchemy.exc.IntegrityError` on `create_budget()` and `update_budget()` to roll back and return `409 Conflict`. |
| [backend/alembic/env.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic/env.py) | Reused `build_engine_options()` with `pool.NullPool`, direct `create_engine()` (avoids `configparser` `%`-escaping failures), SQLite `PRAGMA foreign_keys=ON` listener, `render_as_batch=is_sqlite`, and `compare_type=True`. |
| [backend/alembic/versions/0001_initial_schema.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic/versions/0001_initial_schema.py) | Aligned `0001_initial_schema` with ORM `Base.metadata` and `backend/finora.db` by adding all 16 indexes (`ix_users_id`, unique `ix_users_email`, `ix_transactions_*`, `ix_budgets_*`, `ix_savings_goals_*`, `ix_savings_contributions_*`, `ix_notifications_*`) and matching `downgrade()` index drops. |
| [backend/requirements.txt](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/requirements.txt) | Added `psycopg[binary]>=3.2.0,<4.0.0` and enabled `alembic>=1.14.0,<2.0.0`. |
| [backend/.env.example](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/.env.example) | Added commented Neon PostgreSQL `DATABASE_URL` placeholder, `AUTO_INIT_DB=true`, and Render `REQUIRE_HTTPS=false` guidance while keeping local SQLite default intact. |
| [frontend/.env.example](file:///C:/Users/warri/OneDrive/Desktop/FINORA/frontend/.env.example) | Kept local `VITE_API_BASE_URL=http://127.0.0.1:8001/api/v1` and documented the Render production URL example. |
| [backend/app/tests/test_pg_compatibility.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/app/tests/test_pg_compatibility.py) | Added unit tests covering URI normalization, SQLite/Neon engine options, Render `REQUIRE_HTTPS` / `AUTO_INIT_DB` defaults, and `0001_initial_schema` PostgreSQL DDL & index parity. |

---

## 4. Migration Status

- **Alembic setup exists:** [backend/alembic.ini](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic.ini), [backend/alembic/env.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic/env.py), and [backend/alembic/versions/0001_initial_schema.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic/versions/0001_initial_schema.py).
- **Schema coverage:** Covers all 6 tables (`users`, `transactions`, `budgets`, `savings_goals`, `savings_contributions`, `notifications`), foreign keys (`ON DELETE CASCADE`), `uq_budgets_user_category_month`, and all 16 indexes matching ORM `Base.metadata`.
- **Local `backend/finora.db` status:** Verified read-only (`PRAGMA integrity_check` → `ok`, 6 tables present, untouched). No `alembic_version` table exists locally, and migrations were **not** run against SQLite.
- **Neon PostgreSQL bootstrap command (when ready in Phase 2):** Run `alembic upgrade head` against the Neon `DATABASE_URL` before serving traffic.

---

## 5. Required Python Dependencies

Added to [backend/requirements.txt](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/requirements.txt):
- `psycopg[binary]>=3.2.0,<4.0.0` (PostgreSQL driver matching SQLAlchemy 2.1.8)
- `alembic>=1.14.0,<2.0.0` (schema migrations on deploy)

All existing pins (`fastapi==0.162.4`, `uvicorn==0.54.0`, `SQLAlchemy==2.1.8`, `pydantic==2.14.3`, `email-validator==2.3.0`, `python-jose==3.5.0`, `passlib==1.7.4`, `bcrypt==5.0.0`, `python-multipart==0.0.33`) remain intact.  
*(Note: `psycopg[binary]` and `alembic` were not installed into the local Windows `backend/venv` during Phase 1; Render installs them during `pip install -r requirements.txt`.)*

---

## 6. Environment Variable Checklist

### Backend — Render Web Service (FastAPI)

| Variable | Example / Requirement | Notes |
|---|---|---|
| `APP_NAME` | `FINORA API` | Display name |
| `APP_ENV` | `production` | Activates fail-closed security validation |
| `API_V1_PREFIX` | `/api/v1` | Matches frontend `VITE_API_BASE_URL` |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@EP-HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require` | Secret from Neon Console; normalized automatically to `postgresql+psycopg://` |
| `SECRET_KEY` | `<64+ char CSPRNG secret>` | Generate via `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token TTL in minutes |
| `CORS_ORIGINS` | `https://<your-frontend>.onrender.com` | **Required HTTPS origin(s)**; wildcards (`*`) and `http://` fail startup in prod |
| `REQUIRE_HTTPS` | `false` | Render terminates TLS at edge proxy (`RENDER=true` also defaults this to `false`; HSTS remains active in prod) |
| `AUTO_INIT_DB` | `false` | Recommended `false` when `alembic upgrade head` runs on startup |
| `AUTO_SEED_DEMO` | `false` | Always forced `false` in production |
| `ENABLE_DEMO_LOGIN` | `false` | Always forced `false` in production (`403`) |
| `RATE_LIMIT_LOGIN_PER_MIN` | `15` | Per-IP login throttle |
| `RATE_LIMIT_REGISTER_PER_MIN` | `10` | Per-IP signup throttle |

### Frontend — Render Static Site (React + Vite)

| Variable | Example / Requirement | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://<your-backend>.onrender.com/api/v1` | Baked at Vite build time (`npm run build`); must use `https://` matching backend domain |

---

## 7. Exact Render Build & Start Configuration

### A. Backend Service (Render Web Service)
- **Root Directory:** `backend`
- **Build Command:**
  ```bash
  pip install --upgrade pip && pip install -r requirements.txt
  ```
- **Start Command:**
  ```bash
  alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"
  ```
- **Health Check Path:** `/health` *(returns `200 OK` `{"status":"healthy"}`)*
- **Recommended Workers:** Keep default single worker (`1`) on Free/Starter unless Redis rate limiting is added (because `SlidingWindowRateLimiter` is in-memory per process).

### B. Frontend Service (Render Static Site)
- **Root Directory:** `frontend`
- **Build Command:**
  ```bash
  npm ci && npm run build
  ```
- **Publish Directory:** `dist`
- **Redirects / Rewrites Rule (Required for React Router `BrowserRouter`):**
  - **Source:** `/*`
  - **Destination:** `/index.html`
  - **Action:** `Rewrite`

---

## 8. Concise Deployment Guide (Phase 2 Execution Order — Do Not Run Until Ready)

1. **Provision Neon PostgreSQL:** Create a Neon database/branch and copy the pooled connection string (`?sslmode=require`).
2. **Deploy Backend on Render:** Create a Render Web Service pointing to `backend/`, set all Backend Environment Variables (`DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS=https://<planned-frontend>.onrender.com`, `APP_ENV=production`, `REQUIRE_HTTPS=false`, `AUTO_INIT_DB=false`), and configure Build/Start commands + `/health` check above.
3. **Verify Backend Live:** Confirm `alembic upgrade head` created all 6 tables + 16 indexes in Neon and `GET https://<backend>.onrender.com/health` returns `200`.
4. **Deploy Frontend on Render Static Site:** Point to `frontend/`, set `VITE_API_BASE_URL=https://<backend>.onrender.com/api/v1`, set `npm ci && npm run build` / `dist`, and add the `/* -> /index.html` **Rewrite** rule.
5. **Update `CORS_ORIGINS` (if frontend URL changed):** Ensure `CORS_ORIGINS` matches the exact deployed `https://...` Static Site origin (no trailing slash needed; comma-separate multiple origins if using a custom domain).
6. **Smoke Test Live App:** Register a fresh account in production, reload deep routes (`/transactions`, `/budgets`), verify persistence across reloads, and verify CSV export.

---

## 9. Verification Status (Passed vs. Interrupted vs. Unverified)

### Passed (Directly Observed in Phase 1 Finalization)
- **Targeted PostgreSQL Compatibility Suite (`backend/app/tests/test_pg_compatibility.py`):**
  Command: `.\venv\Scripts\python.exe -m unittest app.tests.test_pg_compatibility -v` — **4/4 PASSED (`0.119s`, exit code `0`)**:
  - `test_build_engine_options_for_sqlite_and_neon_postgres`: **PASS**
  - `test_normalize_database_url_schemes`: **PASS**
  - `test_orm_and_alembic_0001_compile_for_postgresql_and_match_indexes`: **PASS**
  - `test_render_production_settings_defaults`: **PASS**
- **Frontend Production Build & Lint (`frontend/`):** `npm.cmd run build` (`tsc -b && vite build`, `✓ built in 5.35s`) and `npm.cmd run lint` passed with exit code `0` (`task-657`). *(Frontend source `.ts`/`.tsx` files were not modified; only `frontend/.env.example` received commented documentation.)*
- **PostgreSQL DDL Dialect Compilation:** `SQLAlchemy==2.1.8` `postgresql.dialect()` successfully compiled `CREATE TABLE` and `CREATE INDEX` statements for all 6 tables (`users`, `transactions`, `budgets`, `savings_goals`, `savings_contributions`, `notifications`) and all 16 indexes (`SERIAL`, `BIGINT`, `TIMESTAMP WITH TIME ZONE`, `ON DELETE CASCADE`, `uq_budgets_user_category_month`).
- **Local `backend/finora.db` Read-Only Integrity Check:** Read-only `sqlite3` `PRAGMA integrity_check` returned `ok` (all 6 tables and 16 indexes intact); `finora.db` and `backend/backups/` were preserved untouched without migrations.
- **URI Scheme & Middleware Verification:** Observed `SQLAlchemy==2.1.8` rejecting `postgres://` (`NoSuchModuleError`) and requesting `psycopg` for `postgresql://`; inspected `starlette.middleware.httpsredirect.HTTPSRedirectMiddleware` source confirming `307` redirects on internal `http` scopes.

### Prior Interrupted Run (Not Restarted per Policy)
- **Full Backend Suite (`task-686` earlier in Phase 1):** `Get-FileHash` on `backend/finora.db` failed due to a Windows file lock held by the active process using `finora.db`. `compileall -q app alembic scripts seed.py` emitted zero syntax errors before `unittest` started `test_auth_protection_and_user_isolation`, where the task stalled and was canceled (`Tool execution was canceled`). Per policy, the full suite was not restarted.

### Unverified
- **Full `backend/app/tests/test_finora_api.py` Suite Post-Edit:** Not re-run after Phase 1 edits (per instructions not to restart the full suite).
- **Package Installation in Local `venv`:** `psycopg[binary]` and `alembic` were added to `requirements.txt` for production deployment on Render and were not required/installed locally for the targeted unit test.
- **Live Neon PostgreSQL & Render Execution:** No Neon database has been provisioned yet, `alembic upgrade head` has not been run against live PostgreSQL, and Render Web Service / Static Site deployment has not been executed.

---

## 10. Confirmed GitHub Status & Remaining Cloud Deployment Blockers

### Confirmed Migration Files (Tracked Safe Sources Only)
- [backend/alembic.ini](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic.ini)
- [backend/alembic/env.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic/env.py)
- [backend/alembic/versions/0001_initial_schema.py](file:///C:/Users/warri/OneDrive/Desktop/FINORA/backend/alembic/versions/0001_initial_schema.py)

### Confirmed GitHub Commit
- **Repository:** `https://github.com/CodeMonster-duck/FINORA`
- **Branch / Commit:** Pending final push confirmation (updated immediately upon push).

### Remaining Cloud Deployment Blockers
1. **No Neon PostgreSQL Database Provisioned Yet:** `DATABASE_URL` does not yet exist in cloud environment configuration.
2. **Alembic Not Executed Against Live PostgreSQL Yet:** `alembic upgrade head` must run during Render backend deploy after Neon is provisioned.
3. **Render Services Not Created Yet:** Render Web Service (backend) and Render Static Site (frontend, with `VITE_API_BASE_URL` + `/* -> /index.html` SPA Rewrite + explicit HTTPS `CORS_ORIGINS`) remain for Phase 2.
4. **Full Runtime Verification Against PostgreSQL Pending:** End-to-end auth/CRUD/budget/savings/analytics tests against live Neon PostgreSQL and post-edit `test_finora_api.py` should run once cloud DB or local Postgres test target is ready.

### Exact Next Steps (Phase 2)
1. Provision the Neon PostgreSQL database and copy its `?sslmode=require` connection string into Render Web Service secret env vars.
2. Deploy the FastAPI backend Web Service and React Static Site on Render using the checklist/commands in Sections 6–8 (`alembic upgrade head` + `uvicorn` start command + `/* -> /index.html` Rewrite).
3. Run live smoke tests (`GET /health`, registration, login, transaction/budget persistence across reloads, CSV export).
