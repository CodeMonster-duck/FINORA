# FINORA — Smart Personal Finance Management Platform

> **"Take control of your money. Understand every rupee."**

FINORA is a full-stack personal finance and expense management SaaS platform built with React, TypeScript, Vite, FastAPI, SQLAlchemy, and SQLite. It is designed for students, young professionals, and freelancers to manage income, track expenses, enforce monthly category budgets, fund savings goals, inspect spending analytics, and export statements in Indian Rupees (`₹`).

---

## Key Features

- **JWT-Authenticated Multi-User Accounts**: Registration, login, encrypted bcrypt password hashing, bearer token session management, and strict per-user data isolation across every API query.
- **Dashboard & Financial Health Score**: Live net balance, monthly income, monthly expenses, savings rate, income-vs-expense charts, category donut breakdown, budget overview, smart insights, and an explainable 0–100 Financial Health Score across four weighted rules.
- **Transactions Ledger**: Create, edit, delete, search, filter (by type, category, and date range), sort, paginate, inspect details, and recalculate dependent budgets and analytics in real time.
- **Monthly Category Budgets**: Set category spending ceilings (`Food`, `Groceries`, `Transport`, `Shopping`, `Education`, `Healthcare`, `Entertainment`, `Rent`, `Bills`, `Subscriptions`, `Other`), compute utilization (`On Track`, `Approaching`, `Exceeded`), and exclude income transactions from expense utilization.
- **Savings Goals & Contributions**: Track goal milestones, add deposits with quick presets, review contribution histories, and prevent deposits after 100% completion.
- **Analytics & CSV Reports**: Monthly cash-flow trends, weekly spending velocity, payment-channel distribution, weekday-vs-weekend patterns, category summaries, and UTF-8 BOM CSV exports from the backend.
- **Notifications & Preferences**: Persistent threshold/milestone notifications with mark-read actions, INR/USD/EUR display formatting, configurable date formats, and Dark/Light theme persistence.

---

## Technology Stack

### Frontend (`frontend/`)
- **Framework**: React 19, TypeScript, Vite 8
- **Routing & HTTP**: React Router DOM 7, Axios
- **Charts & UI**: Recharts 3, Lucide React, React Hot Toast, Date-fns

### Backend (`backend/`)
- **Framework**: FastAPI, Uvicorn, Pydantic v2 (`email-validator`)
- **Database & ORM**: SQLAlchemy 2, SQLite (with Alembic migration scaffolding)
- **Auth & Security**: `bcrypt`, `python-jose` (HS256 JWT), per-IP sliding-window auth rate limiting, CORS & HTTP security headers

---

## Architecture & Folder Structure

```text
FINORA/
├── README.md
├── RELEASE_READINESS.md
├── FINAL_FINORA_VERIFICATION_REPORT.md
├── .gitignore
├── backend/
│   ├── alembic/                    # Migration environment & initial schema revision
│   ├── alembic.ini
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py             # DB session & HTTPBearer JWT auth dependencies
│   │   │   └── routes/             # auth, transactions, budgets, savings, analytics, notifications
│   │   ├── core/
│   │   │   ├── config.py           # Environment config & production fail-closed checks
│   │   │   ├── rate_limit.py       # Sliding-window auth rate limiter
│   │   │   └── security.py         # bcrypt password hashing & JWT encode/decode
│   │   ├── database/
│   │   │   ├── base.py             # SQLAlchemy DeclarativeBase
│   │   │   └── connection.py       # Engine, SessionLocal, SQLite FK pragma, init_db
│   │   ├── models/                 # User, Transaction, Budget, SavingsGoal, SavingsContribution, Notification
│   │   ├── schemas/                # Pydantic v2 request/response schemas
│   │   ├── services/               # Auth, finance CRUD, analytics, notifications, dev seeder
│   │   ├── tests/                  # FastAPI ASGI unit/integration tests
│   │   └── main.py                 # FastAPI app factory, lifespan & middleware
│   ├── scripts/
│   │   └── backup_db.py            # Online SQLite backup + integrity verification
│   ├── tests/
│   │   └── run_api_smoke.py        # Stdlib HTTP smoke test suite
│   ├── .env.example
│   ├── main.py                     # Root uvicorn compatibility entrypoint
│   ├── requirements.txt
│   └── seed.py
└── frontend/
    ├── public/
    ├── src/
    │   ├── components/             # Sidebar, Topbar, AuthScreen, charts, tables, modals
    │   ├── context/                # FinanceContext & financeStore
    │   ├── hooks/                  # useTransactions, useBudgets, useSavingsGoals
    │   ├── pages/                  # Dashboard, Transactions, Budgets, Savings, Analytics, Reports, Settings
    │   ├── services/               # api.ts, authService.ts, financeService.ts, mappers.ts, storageService.ts
    │   ├── types/                  # TypeScript domain definitions
    │   ├── utils/                  # Integer-paise calculations, formatters, validators
    │   ├── App.tsx
    │   ├── index.css
    │   └── main.tsx
    ├── .env.example
    ├── eslint.config.js
    ├── package.json
    ├── package-lock.json
    └── vite.config.ts
```

---

## Installation Requirements

- **Node.js**: 20+ (tested with Node 24) and npm
- **Python**: 3.12+

---

## Setup & Local Startup

### 1. Backend Setup (`FINORA/backend`)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Start the FastAPI backend (port `8001` avoids Windows port `8000` socket exclusions if applicable):

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

- Health Check: `http://127.0.0.1:8001/health`
- Swagger API Docs: `http://127.0.0.1:8001/docs`

### 2. Frontend Setup (`FINORA/frontend`)

```powershell
cd frontend
npm install
Copy-Item .env.example .env
```

Ensure `frontend/.env` points to your running backend:

```env
VITE_API_BASE_URL=http://127.0.0.1:8001/api/v1
```

Start the Vite development server:

```powershell
npm run dev
```

Open `http://localhost:5173/` in your browser and register a new account via **Create Account**.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default (Dev) | Description |
|---|---|---|
| `APP_NAME` | `FINORA API` | Service title |
| `APP_ENV` | `development` | `development` or `production` (enforces fail-closed checks) |
| `API_V1_PREFIX` | `/api/v1` | REST API base prefix |
| `DATABASE_URL` | `sqlite:///./finora.db` | SQLAlchemy connection string |
| `SECRET_KEY` | Ephemeral CSPRNG in dev | **Required** (`>= 32` chars) in production |
| `ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | JWT expiration window in minutes |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Explicit origins (`https://` required in production) |
| `REQUIRE_HTTPS` | `false` (`true` in prod) | Redirect HTTP → HTTPS and set HSTS header |
| `AUTO_SEED_DEMO` | `false` | Disabled by default; forbidden in production |
| `ENABLE_DEMO_LOGIN` | `false` | Disabled by default (`403`); forbidden in production |
| `RATE_LIMIT_LOGIN_PER_MIN` | `15` | Per-IP login throttle |
| `RATE_LIMIT_REGISTER_PER_MIN` | `10` | Per-IP registration throttle |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8001/api/v1` | Backend API base URL |

---

## API Overview (`/api/v1`)

- **Auth**: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`, `PATCH /auth/me/preferences`
- **Transactions**: `GET /transactions`, `POST /transactions`, `GET /transactions/{id}`, `PUT /transactions/{id}`, `DELETE /transactions/{id}`, `GET /transactions/export/csv`
- **Budgets**: `GET /budgets?month=YYYY-MM`, `POST /budgets`, `PUT /budgets/{id}`, `DELETE /budgets/{id}`
- **Savings Goals**: `GET /savings`, `POST /savings`, `PUT /savings/{id}`, `DELETE /savings/{id}`, `POST /savings/{id}/contributions`
- **Analytics**: `GET /analytics/overview`, `GET /analytics/trends`, `GET /analytics/categories`, `GET /analytics/weekly`, `GET /analytics/health-score`, `GET /analytics/insights`
- **Notifications**: `GET /notifications`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all`

---

## Testing & Verification

- **Frontend Build & Lint** (`FINORA/frontend`):
  ```powershell
  npm run build
  npm run lint
  ```
- **Backend Automated API Smoke Suite** (`FINORA/backend`, against running server):
  ```powershell
  .\venv\Scripts\python.exe tests\run_api_smoke.py
  ```
- **Backend Unit Tests**:
  ```powershell
  .\venv\Scripts\python.exe -m unittest discover -s app/tests -v
  ```

---

## Database Setup & Backups

- Tables (`users`, `transactions`, `budgets`, `savings_goals`, `savings_contributions`, `notifications`) are created automatically on startup with `PRAGMA foreign_keys=ON`.
- Initial Alembic schema revision lives in `backend/alembic/versions/0001_initial_schema.py`.
- Create an online SQLite backup anytime via:
  ```powershell
  .\venv\Scripts\python.exe scripts\backup_db.py
  ```
  See [RELEASE_READINESS.md](RELEASE_READINESS.md) for full backup/restoration steps.

---

## Deployment & Security Notes

- Production deployment requires HTTPS/TLS termination (e.g., Nginx, Caddy, or managed cloud ingress), a strong randomly generated `SECRET_KEY`, explicit `https://` `CORS_ORIGINS`, managed database hosting (PostgreSQL recommended for multi-worker deployments), and Redis-backed or proxy-level rate limiting.
- Never commit `.env`, `*.db`, `backend/backups/`, `backend/venv/`, `frontend/node_modules/`, or `frontend/dist/`. All are excluded via `.gitignore`.
- Monetary amounts are persisted as integer paise (`amount_paise`, `limit_paise`, etc.) in SQLAlchemy to prevent IEEE-754 floating-point drift.
