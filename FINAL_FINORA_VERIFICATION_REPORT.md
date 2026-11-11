# FINORA — Final Data Integrity, Hardening & Verification Report

**Date:** 2026-11-12  
**Workspace:** `c:/Users/warri/OneDrive/Desktop/FINORA`  
**Frontend:** React 19 + TypeScript + Vite 8 (`http://localhost:5173`)  
**Backend:** FastAPI `0.162.4` + SQLAlchemy `2.1.8` + SQLite (`http://127.0.0.1:8000/api/v1`)

---

## 1. Actual Changes Made (Hardening & Integrity Pass)

- **Removed Demo Login & Demo UI Flows from Live Application Experience**:
  - Removed `"Explore Seeded Demo Workspace"` action and `loginDemo` usage from [AuthScreen.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/components/AuthScreen.tsx).
  - Removed `demoLogin()` from [authService.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/authService.ts), `/auth/demo-login` bypass from [api.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/api.ts), and `loginDemo` from [financeStore.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/context/financeStore.ts) and [FinanceContext.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/context/FinanceContext.tsx).
  - Replaced demo badges/labels with authenticated account indicators in [Sidebar.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/components/Sidebar.tsx), [Topbar.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/components/Topbar.tsx), [Dashboard.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Dashboard.tsx), [Settings.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Settings.tsx), and [HelpSupportModal.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/components/HelpSupportModal.tsx).
- **Fixed Real-Time & Calculation Edge Cases**:
  - Fixed unread notification counter drift in [FinanceContext.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/context/FinanceContext.tsx) by deriving `unreadNotificationCount` via `useMemo` from `notifications` and guarding `markNotificationRead()` against already-read items.
  - Fixed local-timezone vs UTC date-shift in exported CSV/JSON filenames (`format(new Date(), 'yyyy-MM-dd')` replacing `toISOString().slice(0, 10)`) in [financeService.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/financeService.ts) and [Settings.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Settings.tsx).
  - Aligned `'ALL'` period active-month tracking in [Analytics.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Analytics.tsx) with `scopedTransactions`.
- **Environment & Secrets Hygiene**:
  - Added `.env` and `.env.*` (preserving `!.env.example`) to [frontend/.gitignore](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/.gitignore) and created root [.gitignore](file:///c:/Users/warri/OneDrive/Desktop/FINORA/.gitignore) ignoring `.env`, `*.db`, `backend/venv/`, `frontend/node_modules/`, and `frontend/dist/`.

---

## 2. Demo Data References Remaining & Usage Status

- **Frontend (`frontend/src/`)**:
  - `Select-String` across `frontend/src/**/*.{ts,tsx}` returned **0** references to `demoData`, `demoLogin`, `/auth/demo-login`, `loginDemo`, or `"Explore Seeded Demo"`.
  - [demoData.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/data/demoData.ts) remains in the repository as an **unused** static development reference file (`0` imports anywhere in `frontend/src/`).
  - [types/index.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/types/index.ts#L153) and [mappers.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/mappers.ts) still define `isDemoSession` / `is_demo` purely to parse the backend `UserOut` DTO; it is no longer surfaced as a demo mode in the UI.
- **Backend (`backend/app/`)**:
  - [config.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/core/config.py#L72) still defaults `AUTO_SEED_DEMO` to `True`, [auth.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/api/routes/auth.py#L48-L56) still exposes `POST /api/v1/auth/demo-login`, and [seed_service.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/services/seed_service.py) / [seed.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/seed.py) still exist (left untouched per backend preservation rules, though no `is_demo=1` user exists in the current `finora.db`).

---

## 3. QA Account Cleanup Result (`backend/finora.db`)

- **Verified Foreign Keys & Cascade Integrity**: Inspected `finora.db` with `PRAGMA foreign_keys = ON;`.
- **Removed QA Browser Account**: Deleted `User 3` (`qa_browser_1794425717454@example.com`) along with its owned records (`2` transactions, `1` budget, `1` savings goal, `2` savings contributions, `1` notification). Confirmed `0` orphan contributions.
- **Removed Partial QA Account from Interrupted Browser Run**: Deleted `final_qa_a_1794426538508@example.com` registered before the second browser run was canceled.
- **Preserved Existing Accounts Untouched**:
  - `User 1`: `finora.test001@example.com` (`tx=1, budgets=1, goals=0, notifs=0`) — intact.
  - `User 2`: `smoke_5da90c8f1d@example.com` (`tx=0, budgets=0, goals=0, notifs=1`) — intact.

---

## 4. Database & Two-Account Isolation Verification

Verified live against `http://127.0.0.1:8000/api/v1` using two freshly registered accounts (Account A & Account B, both cleaned up immediately afterward):

| Check Performed (Authenticated as Account B after Account A created ₹50,000 salary, ₹1,000 Food expense, ₹5,000 Food budget, ₹10,000 Savings Goal) | Observed Result | Status |
|---|---|---|
| `GET /transactions` | `200`, `total_count: 0` | **PASS** |
| `GET /budgets?month=2026-11` | `200`, `items: []` | **PASS** |
| `GET /savings` | `200`, `items: []` | **PASS** |
| `GET /analytics/overview` | `200`, `total_balance: 0.0` | **PASS** |
| `GET /transactions/export/csv` | `200`, Account A records absent (`b_csv_leaked: False`) | **PASS** |
| `GET /notifications` | `200`, `items: []` | **PASS** |
| `GET /transactions/{account_a_tx_id}` | `404` | **PASS** |
| `PUT /budgets/{account_a_budget_id}` | `404` | **PASS** |
| `DELETE /savings/{account_a_goal_id}` | `404` | **PASS** |

---

## 5. Financial Calculation Verification

- **Backend API Smoke Verification (`38/38 passed`)**:
  - Integer-paise sums prevent floating-point drift (`0.1 + 0.2 = 0.3`).
  - Monthly Income (`25000.0`), Expenses (`1000.0`), Balance (`24000.0`), and Savings Rate (`96.0%`) verified via `GET /api/v1/analytics/overview`.
  - Budget tracking (`₹5,000` limit minus `₹1,000` Food expense with `₹25,000` Salary present) returned `spent=1000.0`, `remaining=4000.0`, `utilization_percentage=20.0`, `status="normal"` (income excluded from budget spend).
  - Savings Goal progress (`₹4,000` + `₹6,000` deposit on `₹10,000` target) returned `100.0%` and `is_completed=True`, rejecting post-completion deposits (`400`).
- **Frontend Unit Assertions (`verify_finora.ts` earlier pass)**:
  - Verified `calculations.ts`, `formatters.ts`, and `validators.ts` formulas (`en-IN` INR formatting, `0.1 + 0.2 === 0.3`, empty dataset safety).
  - **Code Audit Fix Applied**: Fixed UTC `toISOString().slice(0, 10)` date drift on exported filenames to match local calendar date (`date-fns` `format`).

---

## 6. UI Workflows Actually Tested vs. Unverified

- **Tested in Earlier Browser QA Session** (before the final demo-removal & notification-counter edits):
  - Registration, initial empty dashboard (`₹0`), Add Income (`₹25,000`), Add Expense (`₹1,000`), Create Budget (`₹5,000`), Savings Goal creation + contribution (`100.0%` + milestone notification), browser refresh persistence, Sign Out, and Sign Back In (`0` console errors, `0` failed requests).
- **Not Re-Tested in Live Browser After Final Edits** (the second browser QA run was stopped early by request):
  - Inline transaction editing and deletion via `/transactions` UI modals.
  - Clicking Analytics period buttons (`3M`, `6M`, `12M`, `All Time`) in the browser UI.
  - Clicking CSV Export in `/reports` in the browser UI (verified via API `200`, not via browser download UI).
  - Marking individual notifications read in `NotificationPanel.tsx` after the `useMemo` unread-count fix.
  - Switching Light/Dark themes in `/settings` and verifying theme persistence across browser reload.
  - Confirming visually in the browser that the Auth screen no longer renders the removed demo button (verified by code inspection and `npm.cmd run build`).

---

## 7. Build & Lint Results

Executed after all final edits in `FINORA/frontend`:

- `npm.cmd run build` (`tsc -b && vite build`): **PASSED** (`✓ built in 4.82s`, 0 TypeScript or bundle errors).
- `npm.cmd run lint` (`eslint .`): **PASSED** (`0` errors, `0` warnings).

---

## 8. Security Issues & Production Deployment Blockers

Before deploying FINORA beyond local development, address the following blockers (production hosting, HTTPS, secrets, and backups have **not** been configured or verified):

1. **Default Fallback `SECRET_KEY` in Backend**: [config.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/core/config.py#L63-L66) falls back to a hardcoded development `SECRET_KEY` if no `backend/.env` or environment variable is set. Production deployments must inject a strong random `SECRET_KEY` and fail closed if missing.
2. **Backend Demo Endpoint & `AUTO_SEED_DEMO` Default**: [config.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/core/config.py#L72) defaults `AUTO_SEED_DEMO=True` and [auth.py](file:///c:/Users/warri/OneDrive/Desktop/FINORA/backend/app/api/routes/auth.py#L48-L56) still serves `POST /api/v1/auth/demo-login`. Disable `AUTO_SEED_DEMO=false` and gate or remove `/auth/demo-login` in production.
3. **No HTTPS / Reverse Proxy Verified**: Both frontend (`http://localhost:5173`) and backend (`http://127.0.0.1:8000`) currently run over plain HTTP. Bearer JWT tokens require HTTPS in production, plus tightening `CORS_ORIGINS` to the production frontend origin.
4. **Rate Limiting & Password/Account Policies**: Login and registration endpoints have no rate limiting or account lockout controls against brute-force attempts, and there is no password-reset or account-deletion endpoint.
5. **Database Hosting & Backups**: Application currently persists to a local single-file SQLite database (`backend/finora.db`) with no automated backups, WAL/concurrency tuning, or Alembic migration execution (`alembic` is not installed in `backend/venv`).
