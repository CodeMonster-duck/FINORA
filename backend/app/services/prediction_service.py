from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date as dt_date
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.transaction import Transaction
from app.schemas.ai import ExpensePredictionCategoryOut, ExpensePredictionResponseOut
from app.services.auth_service import from_paise


def _get_past_month_keys(reference_date: dt_date, count: int = 6) -> list[str]:
    """Generates YYYY-MM keys for the past count completed months using stdlib."""
    keys = []
    y = reference_date.year
    m = reference_date.month
    for _ in range(count):
        m -= 1
        if m < 1:
            m = 12
            y -= 1
        keys.append(f"{y:04d}-{m:02d}")
    keys.reverse()  # oldest to newest
    return keys


def calculate_expense_predictions(
    db: Session, user_id: int, target_date: dt_date | None = None
) -> ExpensePredictionResponseOut:
    """
    Computes rigorous month-end expense predictions using burn-rate velocity
    and multi-month Exponential Weighted Moving Average (EWMA).
    Strictly isolates tenant ledger data and transparently reports data sufficiency.
    """
    today = target_date or dt_date.today()
    current_month_prefix = today.strftime("%Y-%m")
    _, days_in_month = calendar.monthrange(today.year, today.month)
    days_elapsed = max(1, today.day)

    # 1. Fetch all expense transactions for the user
    tx_stmt = (
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
        )
        .order_by(Transaction.date.asc())
    )
    all_expenses = list(db.scalars(tx_stmt).all())

    # 2. Segregate current month vs historical months (last 6 months)
    current_month_cat_paise: dict[str, int] = defaultdict(int)
    historical_month_cat_paise: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    # Past 6 completed months keys
    past_month_keys = _get_past_month_keys(today, count=6)

    for tx in all_expenses:
        tx_month = tx.date[:7]
        if tx_month == current_month_prefix:
            current_month_cat_paise[tx.category] += tx.amount_paise
        elif tx_month in past_month_keys:
            historical_month_cat_paise[tx_month][tx.category] += tx.amount_paise

    current_total_spent_paise = sum(current_month_cat_paise.values())
    current_spent = from_paise(current_total_spent_paise)
    daily_burn_rate = round(current_spent / days_elapsed, 2)

    # 3. Check historical data sufficiency
    completed_history_months = [m for m in past_month_keys if m in historical_month_cat_paise]
    has_sufficient_history = len(completed_history_months) >= 2

    # 4. Fetch active budgets for current month
    budgets_stmt = select(Budget).where(
        Budget.user_id == user_id,
        Budget.month == current_month_prefix,
    )
    budgets = {b.category: b for b in db.scalars(budgets_stmt).all()}

    # 5. Union of all active categories (current + historical + budgeted)
    all_categories = sorted(
        set(current_month_cat_paise.keys())
        | set(budgets.keys())
        | {cat for m in historical_month_cat_paise.values() for cat in m.keys()}
    )

    # Calculate burn vs historical weights
    # As the month progresses, current month burn velocity carries higher weight (between 0.20 and 0.85)
    burn_weight = min(0.85, max(0.20, days_elapsed / days_in_month))
    ewma_weight = 1.0 - burn_weight

    category_predictions: list[ExpensePredictionCategoryOut] = []
    budget_warnings: list[str] = []
    total_predicted_spend = 0.0

    for cat in all_categories:
        cat_current_spent = from_paise(current_month_cat_paise.get(cat, 0))
        cat_burn_rate = cat_current_spent / days_elapsed
        cat_linear_burn_projection = round(cat_burn_rate * days_in_month, 2)

        # Compute historical EWMA for this category
        historical_values: list[float] = [
            from_paise(historical_month_cat_paise[m].get(cat, 0))
            for m in completed_history_months
        ]

        if historical_values and has_sufficient_history:
            # Exponential weights with alpha=0.4 giving higher weight to recent months
            alpha = 0.4
            ewma = historical_values[0]
            for val in historical_values[1:]:
                ewma = alpha * val + (1 - alpha) * ewma
            hist_monthly_avg = round(sum(historical_values) / len(historical_values), 2)
            predicted_cat = round((cat_linear_burn_projection * burn_weight) + (ewma * ewma_weight), 2)
        else:
            hist_monthly_avg = round(sum(historical_values) / max(1, len(historical_values)), 2) if historical_values else 0.0
            predicted_cat = cat_linear_burn_projection

        # Sanity floor: projected month-end cannot be less than what has already been spent
        predicted_cat = max(cat_current_spent, predicted_cat)
        total_predicted_spend += predicted_cat

        # Budget overrun inspection
        budget = budgets.get(cat)
        budget_limit = from_paise(budget.limit_paise) if budget else None
        is_overrun = False
        overrun_amt = None

        if budget_limit is not None and budget_limit > 0:
            if predicted_cat > budget_limit:
                is_overrun = True
                overrun_amt = round(predicted_cat - budget_limit, 2)
                budget_warnings.append(
                    f"⚠️ Projected overrun in {cat}: expected ₹{predicted_cat:,.2f} exceeds monthly budget limit of ₹{budget_limit:,.2f} by ₹{overrun_amt:,.2f}"
                )

        category_predictions.append(
            ExpensePredictionCategoryOut(
                category=cat,
                current_month_spent=cat_current_spent,
                historical_monthly_avg=hist_monthly_avg,
                predicted_month_end=predicted_cat,
                budget_limit=budget_limit,
                is_overrun_projected=is_overrun,
                overrun_amount=overrun_amt,
            )
        )

    # Sort categories by predicted month end descending
    category_predictions.sort(key=lambda x: x.predicted_month_end, reverse=True)
    total_predicted_spend = round(total_predicted_spend, 2)

    methodology = (
        f"Hybrid forecasting: blended {int(burn_weight * 100)}% burn-rate velocity (day {days_elapsed}/{days_in_month}) "
        f"with {int(ewma_weight * 100)}% exponential weighted moving average (EWMA, α=0.4) across {len(completed_history_months)} historical months."
        if has_sufficient_history
        else f"Burn-rate velocity projection: based on ₹{daily_burn_rate:,.2f}/day average through day {days_elapsed} of {days_in_month}. Historical EWMA will activate once ≥ 2 complete past months exist."
    )

    return ExpensePredictionResponseOut(
        current_month=current_month_prefix,
        days_elapsed=days_elapsed,
        days_in_month=days_in_month,
        current_spent=current_spent,
        predicted_total_spend=total_predicted_spend,
        daily_burn_rate=daily_burn_rate,
        has_sufficient_history=has_sufficient_history,
        methodology_note=methodology,
        categories=category_predictions,
        budget_overrun_warnings=budget_warnings,
    )
