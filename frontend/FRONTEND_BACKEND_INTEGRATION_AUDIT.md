# FINORA — Phase 2: Frontend–Backend Integration Audit & Plan

**Audit Date:** 2026-11-12  
**Frontend Target:** `FINORA/frontend/` (React 19 + TypeScript + Vite 8 + Axios + React Router v7 + Recharts)  
**Backend Target:** `FINORA/backend/` (FastAPI `0.162.4` + SQLAlchemy `2.1.8` + SQLite + JWT Auth)  
**Scope:** Inspection and integration architecture only — zero source files modified during this audit.

---

## 1. Current Frontend Inventory

### 1.1 Pages (`frontend/src/pages/`)
All 7 main product pages exist and are lazy-loaded in [App.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/App.tsx):

| Page | Route | File | Current Data Source |
|---|---|---|---|
| Dashboard | `/` | [Dashboard.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Dashboard.tsx) | `FinanceContext` + hooks (`localStorage`) |
| Transactions | `/transactions` | [Transactions.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Transactions.tsx) | `useTransactions()` (`localStorage`) |
| Budgets | `/budgets` | [Budgets.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Budgets.tsx) | `useBudgets()` (`localStorage`) |
| Savings Goals | `/savings` | [Savings.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Savings.tsx) | `useSavingsGoals()` (`localStorage`) |
| Analytics | `/analytics` | [Analytics.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Analytics.tsx) | `useTransactions()` + `calculations.ts` (`localStorage`) |
| Reports | `/reports` | [Reports.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Reports.tsx) | `useTransactions()` + `useSavingsGoals()` + client CSV export |
| Settings | `/settings` | [Settings.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Settings.tsx) | `FinanceContext` + `storageService.ts` (`localStorage`) |

### 1.2 Components (`frontend/src/components/`)
- **Navigation & Layout**: `Sidebar.tsx`, `Topbar.tsx`, `PageHeader.tsx`, `NotificationPanel.tsx`, `QuickActions.tsx`
- **Data Display**: `StatCard.tsx`, `ChartCard.tsx`, `ChartTooltip.tsx`, `TransactionTable.tsx`, `BudgetProgress.tsx`, `SavingsGoalCard.tsx`, `CategoryIcon.tsx`, `FinancialHealthCard.tsx`, `SmartInsightsCard.tsx`, `EmptyState.tsx`
- **Modals & Forms**: `Modal.tsx`, `TransactionFormModal.tsx`, `BudgetFormModal.tsx`, `SavingsGoalModal.tsx`, `HelpSupportModal.tsx`

### 1.3 Current Authentication & Route Protection
- **Authentication**: None implemented yet. There is no login form, registration form, or JWT token management.
- **Demo Session Handling**: [FinanceContext.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/context/FinanceContext.tsx) tracks a boolean `sessionActive` persisted under `finora_v1_demo_session_active` in `localStorage`. When exited via [Sidebar.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/components/Sidebar.tsx), [App.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/App.tsx) renders a "FINORA Demo Paused" card with Resume/Reset actions.
- **Protected Routes**: None. All 7 routes render openly inside `FinoraAppShell` once `sessionActive` is `true`.

### 1.4 Mock / Demo Data & `localStorage` Usage
- **Seed Dataset**: [demoData.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/data/demoData.ts) exports `createInitialDemoTransactions()`, `createInitialDemoBudgets()`, `createInitialDemoSavingsGoals()`, and `DEFAULT_USER_SETTINGS`.
- **Storage Wrapper**: [storageService.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/storageService.ts) reads/writes 6 `localStorage` keys (`finora_v1_transactions`, `finora_v1_budgets`, `finora_v1_savings_goals`, `finora_v1_settings`, `finora_v1_read_notifications`, `finora_v1_demo_session_active`).
- **Pages Using Mock/Local Data**: **All 7 pages** (`Dashboard`, `Transactions`, `Budgets`, `Savings`, `Analytics`, `Reports`, `Settings`).
- **Pages Already Connected to Backend**: **0 pages** (backend connection is currently `0%`, intentionally staged behind `DATA_SOURCE = 'localStorage'`).

### 1.5 Existing API Client, Services & State Management
- **API Client**: [api.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/api.ts) configures `apiClient` via `axios.create` with `baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'`, `timeout: 10000`, `DATA_SOURCE` flag (`'localStorage' | 'fastapi'`), and `extractApiError()`. It does **not** yet have Axios request/response interceptors for Bearer JWT tokens or `401` handling.
- **Domain Service**: [financeService.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/financeService.ts) exposes async CRUD methods (`loadInitialData`, `createTransaction`, `updateTransaction`, `deleteTransaction`, `createBudget`, `updateBudget`, `deleteBudget`, `createSavingsGoal`, `updateSavingsGoal`, `addGoalContribution`, `deleteSavingsGoal`, `saveSettings`, `resetDemoData`, `clearAllRecords`).
- **State Management**: Shared React Context ([financeStore.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/context/financeStore.ts) + [FinanceContext.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/context/FinanceContext.tsx)) consumed through domain hooks [useTransactions.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/hooks/useTransactions.ts), [useBudgets.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/hooks/useBudgets.ts), and [useSavingsGoals.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/hooks/useSavingsGoals.ts). Because UI components never call `localStorage` directly, switching `financeService.ts` to API calls will propagate across all pages without touching UI layouts.

---

## 2. CORS & API Base URL Audit

| Setting | Backend (`backend/app/core/config.py`, `main.py`) | Frontend (`frontend/src/services/api.ts`) | Status & Recommendation |
|---|---|---|---|
| Base URL | Prefix `/api/v1` (typically served on `127.0.0.1:8000` or `localhost:8000`) | `import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'` | Compatible, but add `frontend/.env.example` & `frontend/.env` pointing explicitly to `http://127.0.0.1:8000/api/v1` (or match the host used to start uvicorn) to avoid Windows IPv4/IPv6 `localhost` resolution delays. |
| CORS Origins | `["http://localhost:5173", "http://127.0.0.1:5173"]` | Vite dev server runs on `http://localhost:5173/` | **Compatible** (`allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`). |
| Auth Header | `HTTPBearer` expects `Authorization: Bearer <jwt>` | Not attached yet in `apiClient` | Needs Axios request interceptor in `api.ts` + `401` response handler. |

---

## 3. Frontend Feature → Backend Endpoint Mapping

| Frontend Feature / Action | Current Frontend Location | Backend Endpoint (`prefix = /api/v1`) | Schema / Behavior Notes |
|---|---|---|---|
| User Sign Up | *Missing (Phase 2)* | `POST /auth/register` | Returns `{ access_token, token_type, user }`. Note: `email-validator` rejects `.test` reserved domains. |
| User Sign In | *Missing (Phase 2)* | `POST /auth/login` | Expects `{ email, password }`; returns `{ access_token, user }`. |
| One-Click Demo Login | `App.tsx` (`resumeDemoSession`) | `POST /auth/demo-login` | Seeds & signs in `aarav.sharma@finora.demo` with real JWT; preserves seamless demo UX. |
| Fetch Current User & Settings | `financeService.loadInitialData()` | `GET /auth/me` | Maps flat `UserOut` fields (`monthly_income_target`, `currency`, `date_format`, `theme`, `compact_numbers`, `show_health_score_breakdown`, `budget_alerts_enabled`, `goal_milestones_enabled`) into `UserSettings`. |
| Save Profile Settings | `Settings.tsx` (`ProfileForm`) | `PATCH /auth/me` | Sends `{ name, email, role, monthly_income_target }`. |
| Save Preferences / Theme | `Settings.tsx`, `Topbar.tsx`, `FinanceContext` | `PATCH /auth/me/preferences` | Sends `{ currency, date_format, theme, compact_numbers, show_health_score_breakdown, budget_alerts_enabled, goal_milestones_enabled }`. Keep `defaultPeriod` & `sidebarCollapsed` in local UI storage. |
| Load Transactions | `FinanceContext`, `Transactions.tsx` | `GET /transactions` | Backend paginates (`page`, `page_size <= 200`). Phase 2 can load up to 200 items for client views or query server filters/analytics directly. |
| Add Transaction | `TransactionFormModal.tsx`, `QuickActions.tsx`, `Topbar.tsx` | `POST /transactions` | Map `paymentMethod` ↔ `payment_method`. Backend `id` is `number` (convert `String(id)` for frontend `Transaction.id`). |
| Edit Transaction | `Transactions.tsx` | `PUT /transactions/{transaction_id}` | Same mapper; convert frontend string ID to integer path param. |
| Delete Transaction | `Transactions.tsx` | `DELETE /transactions/{transaction_id}` | Returns `204 No Content`. |
| Export Transactions CSV | `Reports.tsx` | `GET /transactions/export/csv` | Can stream/download directly with Bearer auth (`responseType: 'blob'`), or keep existing category CSV export client-side alongside backend transaction CSV. |
| Load Budgets & Utilization | `Budgets.tsx`, `Dashboard.tsx` | `GET /budgets?month=YYYY-MM` | Backend computes `spent`, `remaining`, `utilization_percentage`, `status` server-side for the requested month. Note: `Budgets.tsx` switching `selectedMonth` should trigger a fetch for that month when in API mode. |
| Create / Edit / Delete Budget | `BudgetFormModal.tsx`, `Budgets.tsx` | `POST /budgets`, `PUT /budgets/{budget_id}`, `DELETE /budgets/{budget_id}` | Map `alertThreshold` ↔ `alert_threshold`. Handle `409 Conflict` duplicate-category error cleanly via `extractApiError`. |
| Load Savings Goals & Deposits | `Savings.tsx`, `Dashboard.tsx` | `GET /savings` | Backend returns nested `contributions` ordered newest-first + computed `remaining_amount`, `progress_percentage`, `is_completed`, `days_remaining`. |
| Create / Edit / Delete Goal | `SavingsGoalModal.tsx`, `Savings.tsx` | `POST /savings`, `PUT /savings/{goal_id}`, `DELETE /savings/{goal_id}` | Map `targetAmount` ↔ `target_amount`, `currentAmount` ↔ `current_amount`, `targetDate` ↔ `target_date`. |
| Add Money to Savings Goal | `Savings.tsx` | `POST /savings/{goal_id}/contributions` | Sends `{ amount, note }`; returns updated `SavingsGoalOut`. Handles `400` if goal is already completed. |
| Dashboard KPIs & Trends | `Dashboard.tsx`, `Analytics.tsx` | `GET /analytics/overview`, `/analytics/trends`, `/analytics/categories`, `/analytics/weekly` | Can either consume backend analytics endpoints directly or hydrate from backend transactions while keeping Recharts configs unchanged. Using `/analytics/*` ensures DB-backed accuracy beyond `page_size=200`. |
| Financial Health Score | `Dashboard.tsx` (`FinancialHealthCard`) | `GET /analytics/health-score` | Map snake_case (`total_score`, `max_score`, `metric_display`) → frontend camelCase (`totalScore`, `maxScore`, `metricDisplay`). |
| Smart Spending Insights | `Dashboard.tsx` (`SmartInsightsCard`) | `GET /analytics/insights` | Map `action_route` ↔ `actionRoute`, `action_label` ↔ `actionLabel`. |
| Notifications List & Read | `NotificationPanel.tsx`, `Topbar.tsx` | `GET /notifications`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all` | Map `is_read` ↔ `read`, `created_at` ↔ `timestamp` formatted cleanly. |
| Reset Demo / Clear All | `Settings.tsx` | *Not implemented on backend* | Backend has no reset/clear-account endpoint. In API mode, show appropriate scope (e.g., hide/adapt local-only "Clear Browser Cache" or add an optional backend demo-reset route if desired). |

---

## 4. Schema & Contract Gaps Identified

1. **ID Type Mismatch (`string` vs `int`)**: Frontend IDs are `string` (`'tx-demo-001'`), while SQLAlchemy primary keys are integers (`1`, `2`). Converting `String(row.id)` in a dedicated `mappers.ts` adapter layer preserves all existing UI component prop types untouched.
2. **CamelCase vs Snake_Case Payloads**: Backend uses snake_case (`payment_method`, `alert_threshold`, `target_amount`, `current_amount`, `target_date`, `is_read`, `monthly_income_target`). Frontend types use camelCase. A thin adapter layer inside `services/mappers.ts` avoids changing any component JSX.
3. **Token Storage & Auth Lifecycle**: Need `finora_v1_access_token` persistence (or `sessionStorage`/`localStorage`), Axios interceptor attachment, and an Auth View (`Login`, `Create Account`, and `Try Demo Workspace` via `/auth/demo-login`) before rendering protected routes.
4. **Pagination Boundary on Transactions**: `GET /transactions` caps `page_size` at `200`. For full-history client charts/reports, either fetch `/analytics/*` endpoints from the backend for charts + KPIs (recommended) or paginate cleanly in `financeService`.
5. **No Backend Delete-User / Demo-Reset Endpoint**: `Settings.tsx` currently offers `Reset Demo Data` and `Clear All Records` for `localStorage`. In FastAPI mode, either make those local-mode-only or add a `POST /api/v1/auth/demo-reset` endpoint for demo accounts (`is_demo=True`).

---

## 5. Exact Files to Create / Modify in Phase 2

### New Frontend Files Recommended
1. `frontend/.env.example` (and local `.env` with `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1` and `VITE_DATA_SOURCE=fastapi`)
2. `frontend/src/services/authService.ts` — `register()`, `login()`, `demoLogin()`, `getMe()`, `updateProfile()`, `updatePreferences()`, token persistence helpers
3. `frontend/src/services/mappers.ts` — Clean snake_case ↔ camelCase and `int` ↔ `string` ID adapters between FastAPI schemas and existing frontend TypeScript interfaces
4. `frontend/src/components/AuthScreen.tsx` (or `pages/Auth.tsx`) — Styled in FINORA's dark glassmorphic theme supporting Sign In, Register, and "Continue with Demo Workspace" (`/auth/demo-login`)

### Existing Frontend Files to Modify
1. [frontend/src/services/api.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/api.ts) — Read `VITE_DATA_SOURCE`, attach JWT Bearer request interceptor, add `401` unauthorized event/callback handling.
2. [frontend/src/services/storageService.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/storageService.ts) — Add `accessToken` storage key & token helpers (`getAuthToken`, `setAuthToken`, `clearAuthToken`).
3. [frontend/src/services/financeService.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/services/financeService.ts) — Implement `fastapi` branches alongside existing `localStorage` fallback for transactions, budgets, savings goals, contributions, notifications, analytics, and settings.
4. [frontend/src/context/financeStore.ts](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/context/financeStore.ts) & [frontend/src/context/FinanceContext.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/context/FinanceContext.tsx) — Add `user`, `isAuthenticated`, `login`, `register`, `loginDemo`, `logout`, server-backed notification read actions, and error handling when API calls fail.
5. [frontend/src/App.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/App.tsx) — Render `AuthScreen` when unauthenticated (in `fastapi` mode) and wire protected routes cleanly.
6. [frontend/src/pages/Budgets.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Budgets.tsx) — Fetch budgets/utilization when `selectedMonth` changes in `fastapi` mode.
7. [frontend/src/pages/Reports.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Reports.tsx) — Optionally hook "Export Transactions CSV" to `GET /api/v1/transactions/export/csv` with date-range params when in `fastapi` mode.
8. [frontend/src/pages/Settings.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/pages/Settings.tsx) — Update "Demo Workspace" badge dynamically from `user.is_demo`, persist profile & preference edits through `PATCH /auth/me` & `PATCH /auth/me/preferences`, and gate local-only reset actions appropriately.
9. [frontend/src/components/Sidebar.tsx](file:///c:/Users/warri/OneDrive/Desktop/FINORA/frontend/src/components/Sidebar.tsx) — Wire Logout button to clear JWT token and return to `AuthScreen` in `fastapi` mode.

*(Optional minimal backend addition only if desired later: `POST /api/v1/auth/demo-reset` if "Reset Demo Data" should reset SQLite demo rows for `is_demo` users.)*

---

## 6. Recommended Phase 2 Implementation Order

1. **Step 1 — Environment & Axios Auth Plumbing**: Add `frontend/.env.example`, token storage in `storageService.ts`, and Bearer + `401` interceptors in `api.ts`.
2. **Step 2 — API DTO Mappers & Auth Service**: Build `mappers.ts` and `authService.ts` matching all verified FastAPI schemas (`user`, `transaction`, `budget`, `savings`, `analytics`, `notification`).
3. **Step 3 — Dual-Mode `financeService.ts`**: Implement FastAPI HTTP branches in `financeService.ts` while keeping `localStorage` fallback intact behind `DATA_SOURCE`.
4. **Step 4 — Auth State & Protected App Shell**: Extend `FinanceContext.tsx` with `login`, `register`, `loginDemo`, and `logout`, and add `AuthScreen.tsx` inside `App.tsx` without altering existing page layouts.
5. **Step 5 — Page-Specific Syncing (`Budgets`, `Notifications`, `Reports`, `Settings`)**: Wire month-scoped budget fetches, persistent notification read calls, backend CSV export option, and live profile/preference updates.
6. **Step 6 — End-to-End Browser & Build Verification**: Run `npm.cmd run build`, `npm.cmd run lint`, and live browser tests against both `http://localhost:5173` and `http://127.0.0.1:8000` (register, login, demo login, CRUD persistence across page refreshes, budget math, CSV download, and logout).
