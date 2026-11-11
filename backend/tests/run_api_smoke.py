r"""Automated stdlib HTTP smoke test suite for the running FINORA FastAPI backend.

Usage:
    .\venv\Scripts\python.exe tests\run_api_smoke.py
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import date as dt_date
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

BASE_URL = "http://127.0.0.1:8000"
API_PREFIX = "/api/v1"
TIMEOUT_SECONDS = 10
REPORT_PATH = Path(__file__).resolve().parent / "FINORA_API_TEST_REPORT.md"


@dataclass
class TestResult:
    name: str
    method: str
    endpoint: str
    status_code: int | str
    passed: bool
    details: str


def http_call(
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
    params: dict[str, Any] | None = None,
) -> tuple[int, dict[str, str], str]:
    url = f"{BASE_URL}{path}"
    if params:
        query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        if query:
            url = f"{url}?{query}"

    headers: dict[str, str] = {"Accept": "application/json"}
    data: bytes | None = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, resp_headers, body
    except urllib.error.HTTPError as err:
        resp_headers = {k.lower(): v for k, v in err.headers.items()} if err.headers else {}
        body = err.read().decode("utf-8", errors="replace")
        return err.code, resp_headers, body


def safe_json(text: str) -> Any:
    try:
        return json.loads(text) if text else {}
    except json.JSONDecodeError:
        return {"raw": text[:300]}


def redact_error(text: str) -> str:
    """Return short sanitized error text without leaking secrets or tokens."""
    cleaned = " ".join(text.strip().split())
    return cleaned[:240]


def main() -> int:
    results: list[TestResult] = []
    created_tx_ids: list[int] = []
    created_budget_ids: list[int] = []
    created_goal_ids: list[int] = []

    unique_tag = uuid.uuid4().hex[:10]
    test_email = f"smoke_{unique_tag}@example.com"
    test_password = f"Finora!{uuid.uuid4().hex[:12]}"
    test_name = f"Smoke User {unique_tag[:4]}"

    token: str | None = None
    today = dt_date.today()
    today_str = today.isoformat()
    month_str = today.strftime("%Y-%m")
    target_date_str = (today + timedelta(days=60)).isoformat()

    def record(
        name: str,
        method: str,
        endpoint: str,
        status_code: int | str,
        passed: bool,
        details: str,
    ) -> None:
        results.append(
            TestResult(
                name=name,
                method=method,
                endpoint=endpoint,
                status_code=status_code,
                passed=passed,
                details=details,
            )
        )
        badge = "PASS" if passed else "FAIL"
        print(f"[{badge}] {name} ({method} {endpoint}) -> HTTP {status_code}: {details}")

    try:
        # 0. Connectivity & Health Check
        try:
            st, _, body = http_call("GET", "/health")
            data = safe_json(body)
            ok = st == 200 and data.get("status") == "healthy"
            record("Health check", "GET", "/health", st, ok, f"status={data.get('status')}")
            if not ok:
                raise RuntimeError("Health endpoint did not return healthy status.")
        except urllib.error.URLError as exc:
            record(
                "Server reachability",
                "GET",
                "/health",
                "CONNECTION_ERROR",
                False,
                f"Cannot connect to {BASE_URL}: {exc.reason}",
            )
            return 1

        # 1. Unauthorized access checks
        st_unauth, _, body_unauth = http_call("GET", f"{API_PREFIX}/transactions")
        record(
            "Unauthorized access rejected (no token)",
            "GET",
            f"{API_PREFIX}/transactions",
            st_unauth,
            st_unauth == 401,
            "Rejected unauthenticated request" if st_unauth == 401 else redact_error(body_unauth),
        )

        st_bad_tok, _, body_bad_tok = http_call(
            "GET", f"{API_PREFIX}/auth/me", token="invalid.jwt.token"
        )
        record(
            "Unauthorized access rejected (invalid JWT)",
            "GET",
            f"{API_PREFIX}/auth/me",
            st_bad_tok,
            st_bad_tok == 401,
            "Rejected invalid token" if st_bad_tok == 401 else redact_error(body_bad_tok),
        )

        # 2. Disposable user registration
        reg_payload = {
            "name": test_name,
            "email": test_email,
            "password": test_password,
            "role": "Automated Smoke Tester",
            "monthly_income_target": 50000,
        }
        st_reg, _, body_reg = http_call(
            "POST", f"{API_PREFIX}/auth/register", payload=reg_payload
        )
        reg_json = safe_json(body_reg)
        reg_ok = st_reg == 201 and bool(reg_json.get("access_token"))
        if reg_ok:
            token = str(reg_json["access_token"])
        record(
            "Register disposable user",
            "POST",
            f"{API_PREFIX}/auth/register",
            st_reg,
            reg_ok,
            f"Registered user_id={reg_json.get('user', {}).get('id')}"
            if reg_ok
            else redact_error(body_reg),
        )

        # 3. Login with disposable credentials
        st_login, _, body_login = http_call(
            "POST",
            f"{API_PREFIX}/auth/login",
            payload={"email": test_email, "password": test_password},
        )
        login_json = safe_json(body_login)
        login_ok = st_login == 200 and bool(login_json.get("access_token"))
        if login_ok:
            token = str(login_json["access_token"])
        record(
            "Login disposable user",
            "POST",
            f"{API_PREFIX}/auth/login",
            st_login,
            login_ok,
            f"Issued bearer token for {test_email}" if login_ok else redact_error(body_login),
        )

        if not token:
            return 1

        # 4. Current user & profile updates
        st_me, _, body_me = http_call("GET", f"{API_PREFIX}/auth/me", token=token)
        me_json = safe_json(body_me)
        record(
            "Get current user",
            "GET",
            f"{API_PREFIX}/auth/me",
            st_me,
            st_me == 200 and me_json.get("email") == test_email,
            f"email={me_json.get('email')}, is_demo={me_json.get('is_demo')}",
        )

        st_patch_me, _, body_patch_me = http_call(
            "PATCH",
            f"{API_PREFIX}/auth/me",
            token=token,
            payload={
                "name": f"{test_name} Updated",
                "email": test_email,
                "role": "Capstone QA",
                "monthly_income_target": 60000,
            },
        )
        patch_me_json = safe_json(body_patch_me)
        record(
            "Update user profile",
            "PATCH",
            f"{API_PREFIX}/auth/me",
            st_patch_me,
            st_patch_me == 200 and patch_me_json.get("monthly_income_target") == 60000.0,
            f"updated name={patch_me_json.get('name')}"
            if st_patch_me == 200
            else redact_error(body_patch_me),
        )

        st_pref, _, body_pref = http_call(
            "PATCH",
            f"{API_PREFIX}/auth/me/preferences",
            token=token,
            payload={"currency": "INR", "theme": "dark", "compact_numbers": True},
        )
        pref_json = safe_json(body_pref)
        record(
            "Update user preferences",
            "PATCH",
            f"{API_PREFIX}/auth/me/preferences",
            st_pref,
            st_pref == 200 and pref_json.get("compact_numbers") is True,
            f"currency={pref_json.get('currency')}, compact_numbers={pref_json.get('compact_numbers')}"
            if st_pref == 200
            else redact_error(body_pref),
        )

        # 5. Invalid input validation tests
        st_bad_amt, _, body_bad_amt = http_call(
            "POST",
            f"{API_PREFIX}/transactions",
            token=token,
            payload={
                "title": "Invalid Negative",
                "amount": -100,
                "type": "expense",
                "category": "Food",
                "date": today_str,
                "payment_method": "UPI",
            },
        )
        record(
            "Invalid negative transaction amount rejected",
            "POST",
            f"{API_PREFIX}/transactions",
            st_bad_amt,
            st_bad_amt == 422,
            "Rejected amount <= 0 with 422" if st_bad_amt == 422 else redact_error(body_bad_amt),
        )

        st_bad_cat, _, body_bad_cat = http_call(
            "POST",
            f"{API_PREFIX}/transactions",
            token=token,
            payload={
                "title": "Mismatched Category",
                "amount": 500,
                "type": "income",
                "category": "Food",
                "date": today_str,
                "payment_method": "UPI",
            },
        )
        record(
            "Invalid income category rejected",
            "POST",
            f"{API_PREFIX}/transactions",
            st_bad_cat,
            st_bad_cat == 422,
            "Rejected expense category on income with 422"
            if st_bad_cat == 422
            else redact_error(body_bad_cat),
        )

        # 6. Transactions CRUD
        st_inc, _, body_inc = http_call(
            "POST",
            f"{API_PREFIX}/transactions",
            token=token,
            payload={
                "title": "Smoke Stipend",
                "amount": 25000,
                "type": "income",
                "category": "Salary",
                "date": today_str,
                "payment_method": "Bank Transfer",
                "description": "Disposable smoke test salary",
            },
        )
        inc_json = safe_json(body_inc)
        if st_inc == 201 and "id" in inc_json:
            created_tx_ids.append(int(inc_json["id"]))
        record(
            "Create income transaction",
            "POST",
            f"{API_PREFIX}/transactions",
            st_inc,
            st_inc == 201 and inc_json.get("amount") == 25000.0,
            f"id={inc_json.get('id')}, amount={inc_json.get('amount')}"
            if st_inc == 201
            else redact_error(body_inc),
        )

        st_exp, _, body_exp = http_call(
            "POST",
            f"{API_PREFIX}/transactions",
            token=token,
            payload={
                "title": "Smoke Food Expense",
                "amount": 1000,
                "type": "expense",
                "category": "Food",
                "date": today_str,
                "payment_method": "UPI",
                "description": "Disposable smoke test lunch",
            },
        )
        exp_json = safe_json(body_exp)
        exp_id = int(exp_json["id"]) if st_exp == 201 and "id" in exp_json else None
        if exp_id is not None:
            created_tx_ids.append(exp_id)
        record(
            "Create ₹1,000 Food expense transaction",
            "POST",
            f"{API_PREFIX}/transactions",
            st_exp,
            st_exp == 201 and exp_json.get("amount") == 1000.0,
            f"id={exp_id}, amount={exp_json.get('amount')}"
            if st_exp == 201
            else redact_error(body_exp),
        )

        # Temporary transaction to exercise update + delete without disturbing the ₹1,000 Food expense
        st_tmp, _, body_tmp = http_call(
            "POST",
            f"{API_PREFIX}/transactions",
            token=token,
            payload={
                "title": "Smoke Metro Pass",
                "amount": 300,
                "type": "expense",
                "category": "Transport",
                "date": today_str,
                "payment_method": "UPI",
            },
        )
        tmp_json = safe_json(body_tmp)
        tmp_id = int(tmp_json["id"]) if st_tmp == 201 and "id" in tmp_json else None
        if tmp_id is not None:
            created_tx_ids.append(tmp_id)

        st_tx_list, _, body_tx_list = http_call(
            "GET", f"{API_PREFIX}/transactions", token=token
        )
        tx_list_json = safe_json(body_tx_list)
        record(
            "Retrieve transactions list",
            "GET",
            f"{API_PREFIX}/transactions",
            st_tx_list,
            st_tx_list == 200 and tx_list_json.get("total_count") == 3,
            f"total_count={tx_list_json.get('total_count')}, net_balance={tx_list_json.get('net_balance')}"
            if st_tx_list == 200
            else redact_error(body_tx_list),
        )

        if tmp_id is not None:
            st_tx_get, _, body_tx_get = http_call(
                "GET", f"{API_PREFIX}/transactions/{tmp_id}", token=token
            )
            record(
                "Retrieve single transaction",
                "GET",
                f"{API_PREFIX}/transactions/{tmp_id}",
                st_tx_get,
                st_tx_get == 200 and safe_json(body_tx_get).get("id") == tmp_id,
                f"title={safe_json(body_tx_get).get('title')}"
                if st_tx_get == 200
                else redact_error(body_tx_get),
            )

            st_tx_put, _, body_tx_put = http_call(
                "PUT",
                f"{API_PREFIX}/transactions/{tmp_id}",
                token=token,
                payload={
                    "title": "Smoke Metro Pass Updated",
                    "amount": 450,
                    "type": "expense",
                    "category": "Transport",
                    "date": today_str,
                    "payment_method": "Debit Card",
                    "description": "Updated transport card",
                },
            )
            put_json = safe_json(body_tx_put)
            record(
                "Update transaction",
                "PUT",
                f"{API_PREFIX}/transactions/{tmp_id}",
                st_tx_put,
                st_tx_put == 200 and put_json.get("amount") == 450.0,
                f"updated_amount={put_json.get('amount')}"
                if st_tx_put == 200
                else redact_error(body_tx_put),
            )

            st_tx_del, _, body_tx_del = http_call(
                "DELETE", f"{API_PREFIX}/transactions/{tmp_id}", token=token
            )
            if st_tx_del == 204 and tmp_id in created_tx_ids:
                created_tx_ids.remove(tmp_id)
            record(
                "Delete transaction",
                "DELETE",
                f"{API_PREFIX}/transactions/{tmp_id}",
                st_tx_del,
                st_tx_del == 204,
                "Deleted temporary transaction" if st_tx_del == 204 else redact_error(body_tx_del),
            )

            st_tx_gone, _, _ = http_call(
                "GET", f"{API_PREFIX}/transactions/{tmp_id}", token=token
            )
            record(
                "Verify deleted transaction returns 404",
                "GET",
                f"{API_PREFIX}/transactions/{tmp_id}",
                st_tx_gone,
                st_tx_gone == 404,
                "Confirmed 404 after deletion" if st_tx_gone == 404 else f"Unexpected status {st_tx_gone}",
            )

        # 7. Budgets CRUD & EXACT ₹5,000 - ₹1,000 = ₹4,000 (20%) calculation check
        st_bgt_create, _, body_bgt_create = http_call(
            "POST",
            f"{API_PREFIX}/budgets",
            token=token,
            payload={
                "category": "Food",
                "limit": 5000,
                "month": month_str,
                "alert_threshold": 80,
                "notes": "Smoke budget test",
            },
        )
        bgt_json = safe_json(body_bgt_create)
        bgt_id = int(bgt_json["id"]) if st_bgt_create == 201 and "id" in bgt_json else None
        if bgt_id is not None:
            created_budget_ids.append(bgt_id)
        record(
            "Create ₹5,000 Food budget",
            "POST",
            f"{API_PREFIX}/budgets",
            st_bgt_create,
            st_bgt_create == 201 and bgt_json.get("limit") == 5000.0,
            f"id={bgt_id}, limit={bgt_json.get('limit')}"
            if st_bgt_create == 201
            else redact_error(body_bgt_create),
        )

        # Duplicate budget conflict check
        st_bgt_dup, _, body_bgt_dup = http_call(
            "POST",
            f"{API_PREFIX}/budgets",
            token=token,
            payload={
                "category": "Food",
                "limit": 3000,
                "month": month_str,
                "alert_threshold": 80,
            },
        )
        record(
            "Duplicate category budget rejected",
            "POST",
            f"{API_PREFIX}/budgets",
            st_bgt_dup,
            st_bgt_dup == 409,
            "Rejected duplicate Food budget for same month"
            if st_bgt_dup == 409
            else redact_error(body_bgt_dup),
        )

        # Verify transaction-to-budget calculation: ₹5,000 - ₹1,000 = ₹4,000 remaining & 20% utilization
        st_bgt_list, _, body_bgt_list = http_call(
            "GET",
            f"{API_PREFIX}/budgets",
            token=token,
            params={"month": month_str},
        )
        bgt_list_json = safe_json(body_bgt_list)
        food_util = next(
            (
                item
                for item in bgt_list_json.get("items", [])
                if item.get("budget", {}).get("category") == "Food"
            ),
            None,
        )
        budget_calc_summary: dict[str, Any] | None = None
        if food_util is not None:
            spent_val = food_util.get("spent")
            remaining_val = food_util.get("remaining")
            util_pct_val = food_util.get("utilization_percentage")
            status_val = food_util.get("status")
            calc_ok = (
                st_bgt_list == 200
                and spent_val == 1000.0
                and remaining_val == 4000.0
                and util_pct_val == 20.0
                and status_val == "normal"
            )
            budget_calc_summary = {
                "limit": food_util.get("budget", {}).get("limit"),
                "spent": spent_val,
                "remaining": remaining_val,
                "utilization_percentage": util_pct_val,
                "status": status_val,
                "passed": calc_ok,
            }
            record(
                "Verify ₹5,000 budget - ₹1,000 expense = ₹4,000 remaining & 20% utilization",
                "GET",
                f"{API_PREFIX}/budgets?month={month_str}",
                st_bgt_list,
                calc_ok,
                f"spent={spent_val}, remaining={remaining_val}, utilization={util_pct_val}%, status={status_val}",
            )
        else:
            record(
                "Verify ₹5,000 budget - ₹1,000 expense = ₹4,000 remaining & 20% utilization",
                "GET",
                f"{API_PREFIX}/budgets?month={month_str}",
                st_bgt_list,
                False,
                "Food budget utilization item missing in response",
            )

        if bgt_id is not None:
            # Update budget to ₹1,200 so ₹1,000 spend triggers 83.3% ("approaching") for notification test
            st_bgt_put, _, body_bgt_put = http_call(
                "PUT",
                f"{API_PREFIX}/budgets/{bgt_id}",
                token=token,
                payload={
                    "category": "Food",
                    "limit": 1200,
                    "month": month_str,
                    "alert_threshold": 80,
                    "notes": "Updated cap for approaching alert check",
                },
            )
            bgt_put_json = safe_json(body_bgt_put)
            record(
                "Update budget limit",
                "PUT",
                f"{API_PREFIX}/budgets/{bgt_id}",
                st_bgt_put,
                st_bgt_put == 200 and bgt_put_json.get("limit") == 1200.0,
                f"updated_limit={bgt_put_json.get('limit')}"
                if st_bgt_put == 200
                else redact_error(body_bgt_put),
            )

        # 8. Savings Goals & Contributions
        st_goal_create, _, body_goal_create = http_call(
            "POST",
            f"{API_PREFIX}/savings",
            token=token,
            payload={
                "name": "Smoke Laptop Fund",
                "category": "Tech",
                "target_amount": 10000,
                "current_amount": 4000,
                "target_date": target_date_str,
                "priority": "high",
            },
        )
        goal_json = safe_json(body_goal_create)
        goal_id = int(goal_json["id"]) if st_goal_create == 201 and "id" in goal_json else None
        if goal_id is not None:
            created_goal_ids.append(goal_id)
        record(
            "Create savings goal",
            "POST",
            f"{API_PREFIX}/savings",
            st_goal_create,
            st_goal_create == 201 and goal_json.get("progress_percentage") == 40.0,
            f"id={goal_id}, progress={goal_json.get('progress_percentage')}%"
            if st_goal_create == 201
            else redact_error(body_goal_create),
        )

        st_goal_list, _, body_goal_list = http_call(
            "GET", f"{API_PREFIX}/savings", token=token
        )
        goal_list_json = safe_json(body_goal_list)
        record(
            "Retrieve savings goals summary",
            "GET",
            f"{API_PREFIX}/savings",
            st_goal_list,
            st_goal_list == 200 and goal_list_json.get("total_saved") == 4000.0,
            f"total_saved={goal_list_json.get('total_saved')}, total_target={goal_list_json.get('total_target')}"
            if st_goal_list == 200
            else redact_error(body_goal_list),
        )

        if goal_id is not None:
            st_contrib, _, body_contrib = http_call(
                "POST",
                f"{API_PREFIX}/savings/{goal_id}/contributions",
                token=token,
                payload={"amount": 6000, "note": "Smoke completion deposit"},
            )
            contrib_json = safe_json(body_contrib)
            record(
                "Add savings goal contribution",
                "POST",
                f"{API_PREFIX}/savings/{goal_id}/contributions",
                st_contrib,
                st_contrib == 201
                and contrib_json.get("is_completed") is True
                and contrib_json.get("progress_percentage") == 100.0,
                f"current={contrib_json.get('current_amount')}, completed={contrib_json.get('is_completed')}"
                if st_contrib == 201
                else redact_error(body_contrib),
            )

            st_over, _, body_over = http_call(
                "POST",
                f"{API_PREFIX}/savings/{goal_id}/contributions",
                token=token,
                payload={"amount": 100},
            )
            record(
                "Reject contribution to completed goal",
                "POST",
                f"{API_PREFIX}/savings/{goal_id}/contributions",
                st_over,
                st_over == 400,
                "Rejected deposit on completed goal" if st_over == 400 else redact_error(body_over),
            )

            st_goal_put, _, body_goal_put = http_call(
                "PUT",
                f"{API_PREFIX}/savings/{goal_id}",
                token=token,
                payload={
                    "name": "Smoke Laptop Fund Pro",
                    "category": "Tech",
                    "target_amount": 12000,
                    "current_amount": 10000,
                    "target_date": target_date_str,
                    "priority": "medium",
                },
            )
            goal_put_json = safe_json(body_goal_put)
            record(
                "Update savings goal",
                "PUT",
                f"{API_PREFIX}/savings/{goal_id}",
                st_goal_put,
                st_goal_put == 200 and goal_put_json.get("name") == "Smoke Laptop Fund Pro",
                f"target={goal_put_json.get('target_amount')}, progress={goal_put_json.get('progress_percentage')}%"
                if st_goal_put == 200
                else redact_error(body_goal_put),
            )

        # 9. Dashboard summaries, Analytics & CSV Report
        st_ov, _, body_ov = http_call(
            "GET", f"{API_PREFIX}/analytics/overview", token=token
        )
        ov_json = safe_json(body_ov)
        ov_ok = (
            st_ov == 200
            and ov_json.get("monthly_income") == 25000.0
            and ov_json.get("monthly_expenses") == 1000.0
            and ov_json.get("monthly_savings") == 24000.0
            and ov_json.get("monthly_savings_rate") == 96.0
        )
        record(
            "Dashboard overview summary",
            "GET",
            f"{API_PREFIX}/analytics/overview",
            st_ov,
            ov_ok,
            f"income={ov_json.get('monthly_income')}, expenses={ov_json.get('monthly_expenses')}, savings={ov_json.get('monthly_savings')}, rate={ov_json.get('monthly_savings_rate')}%"
            if st_ov == 200
            else redact_error(body_ov),
        )

        st_trends, _, body_trends = http_call(
            "GET", f"{API_PREFIX}/analytics/trends", token=token, params={"months": 6}
        )
        trends_json = safe_json(body_trends)
        record(
            "Analytics monthly trends",
            "GET",
            f"{API_PREFIX}/analytics/trends?months=6",
            st_trends,
            st_trends == 200 and isinstance(trends_json, list) and len(trends_json) == 6,
            f"months_returned={len(trends_json) if isinstance(trends_json, list) else 'invalid'}",
        )

        st_cats, _, body_cats = http_call(
            "GET",
            f"{API_PREFIX}/analytics/categories",
            token=token,
            params={"month": month_str},
        )
        cats_json = safe_json(body_cats)
        record(
            "Analytics category distribution",
            "GET",
            f"{API_PREFIX}/analytics/categories?month={month_str}",
            st_cats,
            st_cats == 200 and isinstance(cats_json, list) and len(cats_json) >= 1,
            f"categories={len(cats_json) if isinstance(cats_json, list) else 'invalid'}",
        )

        st_weekly, _, body_weekly = http_call(
            "GET", f"{API_PREFIX}/analytics/weekly", token=token, params={"weeks": 4}
        )
        weekly_json = safe_json(body_weekly)
        record(
            "Analytics weekly spending",
            "GET",
            f"{API_PREFIX}/analytics/weekly?weeks=4",
            st_weekly,
            st_weekly == 200 and isinstance(weekly_json, list) and len(weekly_json) == 4,
            f"weeks_returned={len(weekly_json) if isinstance(weekly_json, list) else 'invalid'}",
        )

        st_health, _, body_health = http_call(
            "GET", f"{API_PREFIX}/analytics/health-score", token=token
        )
        health_json = safe_json(body_health)
        record(
            "Analytics financial health score",
            "GET",
            f"{API_PREFIX}/analytics/health-score",
            st_health,
            st_health == 200
            and isinstance(health_json.get("factors"), list)
            and len(health_json.get("factors", [])) == 4,
            f"score={health_json.get('total_score')}, grade={health_json.get('grade')}"
            if st_health == 200
            else redact_error(body_health),
        )

        st_ins, _, body_ins = http_call(
            "GET", f"{API_PREFIX}/analytics/insights", token=token
        )
        ins_json = safe_json(body_ins)
        record(
            "Analytics smart insights",
            "GET",
            f"{API_PREFIX}/analytics/insights",
            st_ins,
            st_ins == 200 and isinstance(ins_json, list) and len(ins_json) >= 1,
            f"insights_count={len(ins_json) if isinstance(ins_json, list) else 'invalid'}",
        )

        st_csv, hdr_csv, body_csv = http_call(
            "GET", f"{API_PREFIX}/transactions/export/csv", token=token
        )
        csv_ok = (
            st_csv == 200
            and "text/csv" in hdr_csv.get("content-type", "")
            and "Smoke Food Expense" in body_csv
            and "Smoke Stipend" in body_csv
        )
        record(
            "Export transactions CSV report",
            "GET",
            f"{API_PREFIX}/transactions/export/csv",
            st_csv,
            csv_ok,
            f"content-type={hdr_csv.get('content-type')}, rows_present={csv_ok}",
        )

        # 10. Notifications
        st_notifs, _, body_notifs = http_call(
            "GET", f"{API_PREFIX}/notifications", token=token
        )
        notifs_json = safe_json(body_notifs)
        notif_items = notifs_json.get("items", []) if isinstance(notifs_json, dict) else []
        notif_ok = st_notifs == 200 and len(notif_items) >= 1
        record(
            "List synced notifications",
            "GET",
            f"{API_PREFIX}/notifications",
            st_notifs,
            notif_ok,
            f"count={len(notif_items)}, unread={notifs_json.get('unread_count')}",
        )

        if notif_items:
            first_notif_id = notif_items[0]["id"]
            st_n_read, _, body_n_read = http_call(
                "PATCH",
                f"{API_PREFIX}/notifications/{first_notif_id}/read",
                token=token,
            )
            record(
                "Mark single notification read",
                "PATCH",
                f"{API_PREFIX}/notifications/{first_notif_id}/read",
                st_n_read,
                st_n_read == 200 and safe_json(body_n_read).get("is_read") is True,
                f"notification_id={first_notif_id}, is_read={safe_json(body_n_read).get('is_read')}",
            )

        st_n_all, _, body_n_all = http_call(
            "PATCH", f"{API_PREFIX}/notifications/read-all", token=token
        )
        record(
            "Mark all notifications read",
            "PATCH",
            f"{API_PREFIX}/notifications/read-all",
            st_n_all,
            st_n_all == 200 and "marked_read" in safe_json(body_n_all),
            f"marked_read={safe_json(body_n_all).get('marked_read')}",
        )

        # 11. Explicit Budget Delete & Savings Goal Delete tests
        if bgt_id is not None:
            st_bgt_del, _, body_bgt_del = http_call(
                "DELETE", f"{API_PREFIX}/budgets/{bgt_id}", token=token
            )
            if st_bgt_del == 204:
                created_budget_ids.remove(bgt_id)
            record(
                "Delete budget",
                "DELETE",
                f"{API_PREFIX}/budgets/{bgt_id}",
                st_bgt_del,
                st_bgt_del == 204,
                "Deleted disposable Food budget"
                if st_bgt_del == 204
                else redact_error(body_bgt_del),
            )

        if goal_id is not None:
            st_goal_del, _, body_goal_del = http_call(
                "DELETE", f"{API_PREFIX}/savings/{goal_id}", token=token
            )
            if st_goal_del == 204:
                created_goal_ids.remove(goal_id)
            record(
                "Delete savings goal",
                "DELETE",
                f"{API_PREFIX}/savings/{goal_id}",
                st_goal_del,
                st_goal_del == 204,
                "Deleted disposable savings goal"
                if st_goal_del == 204
                else redact_error(body_goal_del),
            )

    finally:
        cleanup_notes: list[str] = []
        if token:
            for tid in list(created_tx_ids):
                st, _, _ = http_call("DELETE", f"{API_PREFIX}/transactions/{tid}", token=token)
                cleanup_notes.append(f"tx:{tid}->{st}")
            for bid in list(created_budget_ids):
                st, _, _ = http_call("DELETE", f"{API_PREFIX}/budgets/{bid}", token=token)
                cleanup_notes.append(f"budget:{bid}->{st}")
            for gid in list(created_goal_ids):
                st, _, _ = http_call("DELETE", f"{API_PREFIX}/savings/{gid}", token=token)
                cleanup_notes.append(f"goal:{gid}->{st}")

        cleanup_summary = (
            ", ".join(cleanup_notes)
            if cleanup_notes
            else (
                "All created transactions, budgets, and goals deleted during test flow."
                if token
                else "Skipped (no authenticated session)."
            )
        )
        write_report(
            results,
            test_email=test_email,
            budget_calc_summary=locals().get("budget_calc_summary"),
            cleanup_summary=cleanup_summary,
        )

    passed_count = sum(1 for r in results if r.passed)
    failed_count = len(results) - passed_count
    print(f"\nSummary: {passed_count}/{len(results)} passed, {failed_count} failed.")
    print(f"Report written to: {REPORT_PATH}")
    return 0 if failed_count == 0 else 1


def write_report(
    results: list[TestResult],
    *,
    test_email: str,
    budget_calc_summary: dict[str, Any] | None,
    cleanup_summary: str,
) -> None:
    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        "# FINORA Automated API Verification Report",
        "",
        f"- **Executed At**: {timestamp}",
        f"- **Target Base URL**: `{BASE_URL}`",
        f"- **Disposable Test User**: `{test_email}` (no demo login used; no existing users modified)",
        f"- **Total Tests**: {len(results)} | **Passed**: {passed} | **Failed**: {failed}",
        "",
        "## Test Results",
        "",
        "| # | Test Name | Method & Endpoint | HTTP Status | Result | Details |",
        "|---|---|---|---:|:---:|---|",
    ]

    for idx, res in enumerate(results, start=1):
        status_label = "PASS" if res.passed else "FAIL"
        safe_details = res.details.replace("|", "\\|")
        lines.append(
            f"| {idx} | {res.name} | `{res.method} {res.endpoint}` | {res.status_code} | **{status_label}** | {safe_details} |"
        )

    lines.extend(
        [
            "",
            "## Budget Calculation Verification (₹5,000 Limit - ₹1,000 Expense)",
            "",
        ]
    )

    if budget_calc_summary is not None:
        lines.extend(
            [
                f"- **Budget Limit**: ₹{budget_calc_summary['limit']:,.2f}",
                f"- **Expense Spent**: ₹{budget_calc_summary['spent']:,.2f}",
                f"- **Remaining Budget**: ₹{budget_calc_summary['remaining']:,.2f} (Expected: ₹4,000.00)",
                f"- **Utilization**: {budget_calc_summary['utilization_percentage']}% (Expected: 20.0%)",
                f"- **Status**: `{budget_calc_summary['status']}` (Expected: `normal`)",
                f"- **Verification Verdict**: **{'PASS' if budget_calc_summary['passed'] else 'FAIL'}**",
            ]
        )
    else:
        lines.append("- **Verification Verdict**: **NOT EVALUATED / FAILED** (check test results above)")

    lines.extend(
        [
            "",
            "## Cleanup & Safety Notes",
            "",
            f"- **Cleanup**: {cleanup_summary}",
            "- **User Row Note**: The API has no `DELETE /auth/me` endpoint, so only the disposable `smoke_*@example.com` user row remains in the `users` table with zero remaining transactions, budgets, or savings goals.",
            "- **Secrets Hygiene**: Passwords, JWT access tokens, and `SECRET_KEY` values were never logged or written to this report.",
            "",
        ]
    )

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
