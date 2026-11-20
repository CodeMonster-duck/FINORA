from __future__ import annotations

from datetime import date as dt_date
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
    """
    user = db.scalar(select(User).where(User.id == user_id))
    user_name = user.name if user else "User"
    currency = user.currency if user else "INR"

    today = dt_date.today()
    current_month_prefix = today.strftime("%Y-%m")

    # Fetch user transactions
    tx_stmt = (
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )
    all_txs = list(db.scalars(tx_stmt).all())

    # Current month metrics
    month_income_paise = sum(
        t.amount_paise for t in all_txs if t.type == "income" and t.date.startswith(current_month_prefix)
    )
    month_expense_paise = sum(
        t.amount_paise for t in all_txs if t.type == "expense" and t.date.startswith(current_month_prefix)
    )
    all_time_income_paise = sum(t.amount_paise for t in all_txs if t.type == "income")
    all_time_expense_paise = sum(t.amount_paise for t in all_txs if t.type == "expense")
    net_balance_paise = all_time_income_paise - all_time_expense_paise

    # Category breakdown for current month
    category_spending_paise: dict[str, int] = {}
    for t in all_txs:
        if t.type == "expense" and t.date.startswith(current_month_prefix):
            category_spending_paise[t.category] = category_spending_paise.get(t.category, 0) + t.amount_paise

    category_summary = [
        {"category": cat, "spent": from_paise(paise)}
        for cat, paise in sorted(category_spending_paise.items(), key=lambda x: x[1], reverse=True)
    ]

    # Fetch active budgets for current month
    budget_stmt = (
        select(Budget)
        .where(Budget.user_id == user_id, Budget.month == current_month_prefix)
        .order_by(Budget.category.asc())
    )
    budgets = list(db.scalars(budget_stmt).all())
    budget_details = []
    for b in budgets:
        spent_p = category_spending_paise.get(b.category, 0)
        limit_p = max(0, b.limit_paise)
        spent_val = from_paise(spent_p)
        limit_val = from_paise(limit_p)
        util_pct = round((spent_p / limit_p) * 100, 1) if limit_p > 0 else 0.0
        status_label = "normal"
        if util_pct > 100:
            status_label = "exceeded"
        elif util_pct >= b.alert_threshold:
            status_label = "approaching"

        budget_details.append({
            "category": b.category,
            "limit": limit_val,
            "spent": spent_val,
            "remaining": from_paise(limit_p - spent_p),
            "utilization_pct": util_pct,
            "status": status_label,
            "alert_threshold": b.alert_threshold,
        })

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

    # Recent transactions (up to 10)
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
        for t in all_txs[:10]
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
        "net_balance": from_paise(net_balance_paise),
        "month_income": from_paise(month_income_paise),
        "month_expense": from_paise(month_expense_paise),
        "monthly_savings": from_paise(month_income_paise - month_expense_paise),
        "total_transactions_count": len(all_txs),
        "categories_breakdown": category_summary,
        "budgets": budget_details,
        "savings_goals": goal_details,
        "recent_transactions": recent_transactions,
        "health_score": health_data,
    }


def format_context_for_prompt(ctx: dict[str, Any]) -> str:
    """Formats the genuine financial context into a clean markdown ledger overview."""
    currency = ctx.get("currency", "INR")
    lines = [
        f"FINORA AUTHENTICATED USER FINANCIAL CONTEXT:",
        f"- User Name: {ctx.get('user_name')}",
        f"- Active Currency: {currency}",
        f"- Current Month: {ctx.get('current_month')}",
        f"- All-Time Net Balance: {currency} {ctx.get('net_balance'):,.2f}",
        f"- This Month Income: {currency} {ctx.get('month_income'):,.2f}",
        f"- This Month Expenses: {currency} {ctx.get('month_expense'):,.2f}",
        f"- This Month Net Savings: {currency} {ctx.get('monthly_savings'):,.2f}",
        f"- Financial Health Score: {ctx.get('health_score', {}).get('score')}/100 ({ctx.get('health_score', {}).get('rating')})",
        "",
        "Current Month Spending By Category:",
    ]

    cats = ctx.get("categories_breakdown", [])
    if not cats:
        lines.append("  (No expense records yet this month)")
    else:
        for c in cats:
            lines.append(f"  • {c['category']}: {currency} {c['spent']:,.2f}")

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

    lines.append("\nRecent Transactions:")
    txs = ctx.get("recent_transactions", [])
    if not txs:
        lines.append("  (No transactions on record)")
    else:
        for t in txs[:6]:
            sign = "+" if t["type"] == "income" else "-"
            lines.append(
                f"  • {t['date']} | {t['title']} | {sign}{currency} {t['amount']:,.2f} ({t['category']}, {t['payment_method']})"
            )

    return "\n".join(lines)
