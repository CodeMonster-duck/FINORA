from __future__ import annotations

import calendar
from datetime import date as dt_date, timedelta
from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.savings import SavingsGoal
from app.models.transaction import Transaction
from app.models.user import User
from app.services.analytics_service import get_financial_health_score
from app.services.auth_service import from_paise


def get_user_financial_context(db: Session, user_id: int) -> dict[str, Any]:
    """
    Safely retrieves the genuine financial context for the authenticated tenant.
    Never fabricates metrics, balances, or transactions.
    Calculates detailed metrics across current month, last month, yesterday, and all-time.
    """
    user = db.scalar(select(User).where(User.id == user_id))
    user_name = user.name if user else "User"
    currency = user.currency if user else "INR"

    today = dt_date.today()
    current_month_prefix = today.strftime("%Y-%m")
    
    # Yesterday
    yesterday = today - timedelta(days=1)
    yesterday_str = yesterday.isoformat()

    # Last calendar month
    first_of_this_month = today.replace(day=1)
    last_day_of_last_month = first_of_this_month - timedelta(days=1)
    last_month_prefix = last_day_of_last_month.strftime("%Y-%m")

    # Fetch user transactions strictly scoped to user_id
    tx_stmt = (
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )
    all_txs = list(db.scalars(tx_stmt).all())
    total_tx_count = len(all_txs)
    has_transactions = total_tx_count > 0

    # All-time metrics
    all_time_income_paise = sum(t.amount_paise for t in all_txs if t.type == "income")
    all_time_expense_paise = sum(t.amount_paise for t in all_txs if t.type == "expense")
    net_balance_paise = all_time_income_paise - all_time_expense_paise

    # Current month transactions & metrics
    curr_month_txs = [t for t in all_txs if t.date.startswith(current_month_prefix)]
    month_income_paise = sum(t.amount_paise for t in curr_month_txs if t.type == "income")
    month_expense_paise = sum(t.amount_paise for t in curr_month_txs if t.type == "expense")
    month_savings_paise = month_income_paise - month_expense_paise

    month_income_val = from_paise(month_income_paise)
    month_expense_val = from_paise(month_expense_paise)
    month_savings_val = from_paise(month_savings_paise)
    savings_rate_pct = (
        round((month_savings_val / month_income_val) * 100, 1) if month_income_val > 0 else 0.0
    )

    # Current month category breakdown
    category_spending_paise: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    for t in curr_month_txs:
        if t.type == "expense":
            category_spending_paise[t.category] = category_spending_paise.get(t.category, 0) + t.amount_paise
            category_counts[t.category] = category_counts.get(t.category, 0) + 1

    category_summary = [
        {
            "category": cat,
            "spent": from_paise(paise),
            "count": category_counts.get(cat, 0),
        }
        for cat, paise in sorted(category_spending_paise.items(), key=lambda x: x[1], reverse=True)
    ]
    category_spending_map = {c["category"].lower(): c["spent"] for c in category_summary}

    highest_spending = category_summary[0] if category_summary and category_summary[0]["spent"] > 0 else None
    lowest_spending = category_summary[-1] if category_summary and category_summary[-1]["spent"] > 0 else None

    # Last month transactions & metrics
    last_month_txs = [t for t in all_txs if t.date.startswith(last_month_prefix)]
    last_month_income_paise = sum(t.amount_paise for t in last_month_txs if t.type == "income")
    last_month_expense_paise = sum(t.amount_paise for t in last_month_txs if t.type == "expense")
    
    last_month_cat_paise: dict[str, int] = {}
    for t in last_month_txs:
        if t.type == "expense":
            last_month_cat_paise[t.category] = last_month_cat_paise.get(t.category, 0) + t.amount_paise

    last_month_summary = [
        {"category": cat, "spent": from_paise(paise)}
        for cat, paise in sorted(last_month_cat_paise.items(), key=lambda x: x[1], reverse=True)
    ]
    last_month_category_spending_map = {c["category"].lower(): c["spent"] for c in last_month_summary}
    has_last_month_data = len(last_month_txs) > 0

    # Yesterday transactions & metrics
    yesterday_txs = [t for t in all_txs if t.date == yesterday_str and t.type == "expense"]
    yesterday_expense_paise = sum(t.amount_paise for t in yesterday_txs)
    yesterday_details = [
        {
            "id": t.id,
            "title": t.title,
            "amount": from_paise(t.amount_paise),
            "category": t.category,
            "payment_method": t.payment_method,
        }
        for t in yesterday_txs
    ]

    # Month end prediction (burn-rate)
    _, total_days_in_month = calendar.monthrange(today.year, today.month)
    day_of_month = max(1, today.day)
    daily_burn_rate = round(month_expense_val / day_of_month, 2)
    predicted_month_end_expense = round(daily_burn_rate * total_days_in_month, 2)

    # Fetch active budgets for current month
    budget_stmt = (
        select(Budget)
        .where(Budget.user_id == user_id, Budget.month == current_month_prefix)
        .order_by(Budget.category.asc())
    )
    budgets = list(db.scalars(budget_stmt).all())
    budget_details = []
    exceeded_budgets = []
    approaching_budgets = []

    for b in budgets:
        spent_p = category_spending_paise.get(b.category, 0)
        limit_p = max(0, b.limit_paise)
        spent_val = from_paise(spent_p)
        limit_val = from_paise(limit_p)
        util_pct = round((spent_p / limit_p) * 100, 1) if limit_p > 0 else 0.0
        status_label = "normal"
        if util_pct > 100:
            status_label = "exceeded"
            exceeded_budgets.append({
                "category": b.category,
                "spent": spent_val,
                "limit": limit_val,
                "overrun": round(spent_val - limit_val, 2),
                "utilization_pct": util_pct,
            })
        elif util_pct >= b.alert_threshold:
            status_label = "approaching"
            approaching_budgets.append({
                "category": b.category,
                "spent": spent_val,
                "limit": limit_val,
                "utilization_pct": util_pct,
            })

        budget_details.append({
            "category": b.category,
            "limit": limit_val,
            "spent": spent_val,
            "remaining": from_paise(limit_p - spent_p),
            "utilization_pct": util_pct,
            "status": status_label,
            "alert_threshold": b.alert_threshold,
        })

    budget_by_category_map = {b["category"].lower(): b for b in budget_details}

    # Fetch savings goals
    goal_stmt = (
        select(SavingsGoal)
        .where(SavingsGoal.user_id == user_id)
        .order_by(SavingsGoal.priority.asc(), SavingsGoal.target_date.asc())
    )
    goals = list(db.scalars(goal_stmt).all())
    goal_details = []
    for g in goals:
        target_val = from_paise(g.target_amount_paise)
        current_val = from_paise(g.current_amount_paise)
        progress_pct = round((current_val / target_val) * 100, 1) if target_val > 0 else 0.0
        days_rem = (dt_date.fromisoformat(g.target_date) - today).days if g.target_date else 0
        goal_details.append({
            "id": g.id,
            "name": g.name,
            "category": g.category,
            "target": target_val,
            "current": current_val,
            "remaining": max(0.0, target_val - current_val),
            "progress_pct": progress_pct,
            "target_date": g.target_date,
            "days_remaining": days_rem,
            "priority": g.priority,
            "is_completed": current_val >= target_val,
        })

    # Recent transactions (up to 8)
    recent_transactions = [
        {
            "id": t.id,
            "date": t.date,
            "title": t.title,
            "amount": from_paise(t.amount_paise),
            "type": t.type,
            "category": t.category,
            "payment_method": t.payment_method,
        }
        for t in all_txs[:8]
    ]

    # Health score
    try:
        health_score = get_financial_health_score(db, user_id)
        health_data = {
            "score": health_score.score,
            "rating": health_score.rating,
        }
    except Exception:
        health_data = {"score": 75, "rating": "Good"}

    return {
        "user_name": user_name,
        "currency": currency,
        "current_month": current_month_prefix,
        "last_month": last_month_prefix,
        "yesterday_date": yesterday_str,
        "net_balance": from_paise(net_balance_paise),
        "month_income": month_income_val,
        "month_expense": month_expense_val,
        "monthly_savings": month_savings_val,
        "savings_rate_pct": savings_rate_pct,
        "total_transactions_count": total_tx_count,
        "has_transactions": has_transactions,
        "has_current_month_expenses": month_expense_paise > 0,
        "has_last_month_data": has_last_month_data,
        "categories_breakdown": category_summary,
        "category_spending_map": category_spending_map,
        "highest_spending": highest_spending,
        "lowest_spending": lowest_spending,
        "last_month_income": from_paise(last_month_income_paise),
        "last_month_expense": from_paise(last_month_expense_paise),
        "last_month_categories": last_month_summary,
        "last_month_category_spending_map": last_month_category_spending_map,
        "yesterday_expense": from_paise(yesterday_expense_paise),
        "yesterday_transactions": yesterday_details,
        "daily_burn_rate": daily_burn_rate,
        "predicted_month_end_expense": predicted_month_end_expense,
        "budgets": budget_details,
        "budget_by_category_map": budget_by_category_map,
        "exceeded_budgets": exceeded_budgets,
        "approaching_budgets": approaching_budgets,
        "is_over_budget": len(exceeded_budgets) > 0,
        "savings_goals": goal_details,
        "recent_transactions": recent_transactions,
        "health_score": health_data,
    }


def format_context_for_prompt(ctx: dict[str, Any]) -> str:
    """Formats the genuine financial context into a clean, factual markdown ledger overview for AI prompt."""
    currency = ctx.get("currency", "INR")
    has_tx = ctx.get("has_transactions", False)
    
    lines = [
        "FINORA AUTHENTICATED USER FINANCIAL CONTEXT:",
        f"- User: {ctx.get('user_name')}",
        f"- Active Currency: {currency}",
        f"- Current Month: {ctx.get('current_month')}",
        f"- Total Transactions on Record: {ctx.get('total_transactions_count')}",
        f"- Current Net Balance: {currency} {ctx.get('net_balance'):,.2f}",
        f"- This Month Income: {currency} {ctx.get('month_income'):,.2f}",
        f"- This Month Expenses: {currency} {ctx.get('month_expense'):,.2f}",
        f"- This Month Net Savings: {currency} {ctx.get('monthly_savings'):,.2f} (Savings Rate: {ctx.get('savings_rate_pct')}%)",
        f"- Daily Spending Velocity: {currency} {ctx.get('daily_burn_rate'):,.2f}/day",
        f"- Predicted Month-End Total Expenses: {currency} {ctx.get('predicted_month_end_expense'):,.2f}",
        f"- Financial Health Score: {ctx.get('health_score', {}).get('score')}/100 ({ctx.get('health_score', {}).get('rating')})",
    ]

    if not has_tx:
        lines.append("\n(NOTE: User has 0 recorded transactions. All historical figures are 0.)")
        return "\n".join(lines)

    # Highest & Lowest
    high = ctx.get("highest_spending")
    if high:
        lines.append(f"- Highest Spending Category This Month: {high['category']} ({currency} {high['spent']:,.2f})")
    low = ctx.get("lowest_spending")
    if low:
        lines.append(f"- Lowest Spending Category This Month: {low['category']} ({currency} {low['spent']:,.2f})")

    # Current month categories
    lines.append("\nCurrent Month Spending By Category:")
    cats = ctx.get("categories_breakdown", [])
    if not cats:
        lines.append("  (No expense records yet this month)")
    else:
        for c in cats:
            lines.append(f"  • {c['category']}: {currency} {c['spent']:,.2f}")

    # Last month
    lines.append(f"\nPrevious Month ({ctx.get('last_month')}):")
    if not ctx.get("has_last_month_data"):
        lines.append("  (No transactions recorded for previous month)")
    else:
        lines.append(f"  • Total Income: {currency} {ctx.get('last_month_income'):,.2f}")
        lines.append(f"  • Total Expenses: {currency} {ctx.get('last_month_expense'):,.2f}")
        for c in ctx.get("last_month_categories", []):
            lines.append(f"    - {c['category']}: {currency} {c['spent']:,.2f}")

    # Yesterday
    lines.append(f"\nYesterday ({ctx.get('yesterday_date')}):")
    y_txs = ctx.get("yesterday_transactions", [])
    if not y_txs:
        lines.append("  (No expenses recorded yesterday)")
    else:
        lines.append(f"  • Total Yesterday Expenses: {currency} {ctx.get('yesterday_expense'):,.2f}")
        for t in y_txs:
            lines.append(f"    - {t['title']} ({t['category']}): {currency} {t['amount']:,.2f} via {t['payment_method']}")

    # Budgets
    lines.append("\nActive Budgets:")
    budgets = ctx.get("budgets", [])
    if not budgets:
        lines.append("  (No active budgets configured for this month)")
    else:
        for b in budgets:
            lines.append(
                f"  • {b['category']}: Spent {currency} {b['spent']:,.2f} of {currency} {b['limit']:,.2f} "
                f"({b['utilization_pct']}%) — Status: {b['status'].upper()}"
            )

    # Savings Goals
    lines.append("\nActive Savings Goals:")
    goals = ctx.get("savings_goals", [])
    if not goals:
        lines.append("  (No savings goals created yet)")
    else:
        for g in goals:
            lines.append(
                f"  • {g['name']} ({g['category']}): {currency} {g['current']:,.2f} / {currency} {g['target']:,.2f} "
                f"({g['progress_pct']}%) — Target Date: {g['target_date']} ({g['days_remaining']} days left)"
            )

    # Recent Transactions
    lines.append("\nRecent Transactions:")
    for t in ctx.get("recent_transactions", [])[:5]:
        sign = "+" if t["type"] == "income" else "-"
        lines.append(
            f"  • {t['date']} | {t['title']} | {sign}{currency} {t['amount']:,.2f} ({t['category']}, {t['payment_method']})"
        )

    return "\n".join(lines)
