# FINORA Automated API Verification Report

- **Executed At**: 2026-11-11 19:21:38 UTC
- **Target Base URL**: `http://127.0.0.1:8000`
- **Disposable Test User**: `smoke_5da90c8f1d@example.com` (no demo login used; no existing users modified)
- **Total Tests**: 38 | **Passed**: 38 | **Failed**: 0

## Test Results

| # | Test Name | Method & Endpoint | HTTP Status | Result | Details |
|---|---|---|---:|:---:|---|
| 1 | Health check | `GET /health` | 200 | **PASS** | status=healthy |
| 2 | Unauthorized access rejected (no token) | `GET /api/v1/transactions` | 401 | **PASS** | Rejected unauthenticated request |
| 3 | Unauthorized access rejected (invalid JWT) | `GET /api/v1/auth/me` | 401 | **PASS** | Rejected invalid token |
| 4 | Register disposable user | `POST /api/v1/auth/register` | 201 | **PASS** | Registered user_id=2 |
| 5 | Login disposable user | `POST /api/v1/auth/login` | 200 | **PASS** | Issued bearer token for smoke_5da90c8f1d@example.com |
| 6 | Get current user | `GET /api/v1/auth/me` | 200 | **PASS** | email=smoke_5da90c8f1d@example.com, is_demo=False |
| 7 | Update user profile | `PATCH /api/v1/auth/me` | 200 | **PASS** | updated name=Smoke User 5da9 Updated |
| 8 | Update user preferences | `PATCH /api/v1/auth/me/preferences` | 200 | **PASS** | currency=INR, compact_numbers=True |
| 9 | Invalid negative transaction amount rejected | `POST /api/v1/transactions` | 422 | **PASS** | Rejected amount <= 0 with 422 |
| 10 | Invalid income category rejected | `POST /api/v1/transactions` | 422 | **PASS** | Rejected expense category on income with 422 |
| 11 | Create income transaction | `POST /api/v1/transactions` | 201 | **PASS** | id=2, amount=25000.0 |
| 12 | Create ₹1,000 Food expense transaction | `POST /api/v1/transactions` | 201 | **PASS** | id=3, amount=1000.0 |
| 13 | Retrieve transactions list | `GET /api/v1/transactions` | 200 | **PASS** | total_count=3, net_balance=23700.0 |
| 14 | Retrieve single transaction | `GET /api/v1/transactions/4` | 200 | **PASS** | title=Smoke Metro Pass |
| 15 | Update transaction | `PUT /api/v1/transactions/4` | 200 | **PASS** | updated_amount=450.0 |
| 16 | Delete transaction | `DELETE /api/v1/transactions/4` | 204 | **PASS** | Deleted temporary transaction |
| 17 | Verify deleted transaction returns 404 | `GET /api/v1/transactions/4` | 404 | **PASS** | Confirmed 404 after deletion |
| 18 | Create ₹5,000 Food budget | `POST /api/v1/budgets` | 201 | **PASS** | id=2, limit=5000.0 |
| 19 | Duplicate category budget rejected | `POST /api/v1/budgets` | 409 | **PASS** | Rejected duplicate Food budget for same month |
| 20 | Verify ₹5,000 budget - ₹1,000 expense = ₹4,000 remaining & 20% utilization | `GET /api/v1/budgets?month=2026-11` | 200 | **PASS** | spent=1000.0, remaining=4000.0, utilization=20.0%, status=normal |
| 21 | Update budget limit | `PUT /api/v1/budgets/2` | 200 | **PASS** | updated_limit=1200.0 |
| 22 | Create savings goal | `POST /api/v1/savings` | 201 | **PASS** | id=1, progress=40.0% |
| 23 | Retrieve savings goals summary | `GET /api/v1/savings` | 200 | **PASS** | total_saved=4000.0, total_target=10000.0 |
| 24 | Add savings goal contribution | `POST /api/v1/savings/1/contributions` | 201 | **PASS** | current=10000.0, completed=True |
| 25 | Reject contribution to completed goal | `POST /api/v1/savings/1/contributions` | 400 | **PASS** | Rejected deposit on completed goal |
| 26 | Update savings goal | `PUT /api/v1/savings/1` | 200 | **PASS** | target=12000.0, progress=83.3% |
| 27 | Dashboard overview summary | `GET /api/v1/analytics/overview` | 200 | **PASS** | income=25000.0, expenses=1000.0, savings=24000.0, rate=96.0% |
| 28 | Analytics monthly trends | `GET /api/v1/analytics/trends?months=6` | 200 | **PASS** | months_returned=6 |
| 29 | Analytics category distribution | `GET /api/v1/analytics/categories?month=2026-11` | 200 | **PASS** | categories=1 |
| 30 | Analytics weekly spending | `GET /api/v1/analytics/weekly?weeks=4` | 200 | **PASS** | weeks_returned=4 |
| 31 | Analytics financial health score | `GET /api/v1/analytics/health-score` | 200 | **PASS** | score=88, grade=Excellent |
| 32 | Analytics smart insights | `GET /api/v1/analytics/insights` | 200 | **PASS** | insights_count=3 |
| 33 | Export transactions CSV report | `GET /api/v1/transactions/export/csv` | 200 | **PASS** | content-type=text/csv; charset=utf-8, rows_present=True |
| 34 | List synced notifications | `GET /api/v1/notifications` | 200 | **PASS** | count=1, unread=1 |
| 35 | Mark single notification read | `PATCH /api/v1/notifications/1/read` | 200 | **PASS** | notification_id=1, is_read=True |
| 36 | Mark all notifications read | `PATCH /api/v1/notifications/read-all` | 200 | **PASS** | marked_read=0 |
| 37 | Delete budget | `DELETE /api/v1/budgets/2` | 204 | **PASS** | Deleted disposable Food budget |
| 38 | Delete savings goal | `DELETE /api/v1/savings/1` | 204 | **PASS** | Deleted disposable savings goal |

## Budget Calculation Verification (₹5,000 Limit - ₹1,000 Expense)

- **Budget Limit**: ₹5,000.00
- **Expense Spent**: ₹1,000.00
- **Remaining Budget**: ₹4,000.00 (Expected: ₹4,000.00)
- **Utilization**: 20.0% (Expected: 20.0%)
- **Status**: `normal` (Expected: `normal`)
- **Verification Verdict**: **PASS**

## Cleanup & Safety Notes

- **Cleanup**: tx:2->204, tx:3->204
- **User Row Note**: The API has no `DELETE /auth/me` endpoint, so only the disposable `smoke_*@example.com` user row remains in the `users` table with zero remaining transactions, budgets, or savings goals.
- **Secrets Hygiene**: Passwords, JWT access tokens, and `SECRET_KEY` values were never logged or written to this report.
