from __future__ import annotations

import math
from datetime import date as dt_date
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.savings import SavingsGoal
from app.models.transaction import Transaction
from app.schemas.ai import SavingsCoachPlanOut, SavingsCoachRecommendationOut
from app.services.auth_service import from_paise


DISCRETIONARY_CATEGORIES = {
    "Food": {"default_trim_pct": 15, "tip": "Cooking at home 2 more days per week"},
    "Shopping": {"default_trim_pct": 20, "tip": "Applying a 48-hour cooling-off rule on impulse purchases"},
    "Entertainment": {"default_trim_pct": 20, "tip": "Consolidating weekend outings or booking group discounts"},
    "Subscriptions": {"default_trim_pct": 15, "tip": "Auditing unused recurring streaming, cloud, or app plans"},
    "Other": {"default_trim_pct": 10, "tip": "Cataloguing miscellaneous cash or impulse outlays"},
}


def generate_savings_coach_plan(db: Session, user_id: int) -> SavingsCoachPlanOut:
    """
    Generates tailored, actionable savings recommendations from genuine ledger data.
    Simulates concrete impact on active savings goals.
    Strictly read-only; never mutates balances or transfers funds.
    """
    today = dt_date.today()
    current_month_prefix = today.strftime("%Y-%m")

    # Fetch expenses for current month
    tx_stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.type == "expense",
    )
    all_expenses = list(db.scalars(tx_stmt).all())

    # Calculate category spending this month
    cat_spend_paise: dict[str, int] = {}
    for tx in all_expenses:
        if tx.date.startswith(current_month_prefix):
            cat_spend_paise[tx.category] = cat_spend_paise.get(tx.category, 0) + tx.amount_paise

    # If current month is fresh with minimal spend (< ₹1,000), sample past 60 days
    total_month_expense_paise = sum(cat_spend_paise.values())
    if total_month_expense_paise < 100000 and len(all_expenses) > 5:
        cat_spend_paise.clear()
        for tx in all_expenses[-30:]:
            cat_spend_paise[tx.category] = cat_spend_paise.get(tx.category, 0) + tx.amount_paise

    # Fetch active savings goals
    goals_stmt = (
        select(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsGoal.current_amount_paise < SavingsGoal.target_amount_paise,
        )
        .order_by(SavingsGoal.priority.asc(), SavingsGoal.target_date.asc())
    )
    active_goals = list(db.scalars(goals_stmt).all())

    recommendations: list[SavingsCoachRecommendationOut] = []
    total_discretionary_paise = 0
    total_potential_savings = 0.0

    goal_idx = 0
    for cat_name, config in DISCRETIONARY_CATEGORIES.items():
        spend_p = cat_spend_paise.get(cat_name, 0)
        spend_val = from_paise(spend_p)
        if spend_val < 300:  # Ignore negligible outlays
            continue

        total_discretionary_paise += spend_p
        trim_pct = config["default_trim_pct"]
        monthly_saving = round(spend_val * (trim_pct / 100.0), 2)
        total_potential_savings += monthly_saving

        # Pair with an active goal if one exists
        paired_goal = active_goals[goal_idx % len(active_goals)] if active_goals else None
        if paired_goal:
            goal_idx += 1
            rem_paise = max(0, paired_goal.target_amount_paise - paired_goal.current_amount_paise)
            rem_val = from_paise(rem_paise)

            days_remaining = max(1, (dt_date.fromisoformat(paired_goal.target_date) - today).days)
            # Estimate acceleration in days
            # If current pace requires rem_val over days_remaining, how much does monthly_saving speed it up?
            current_monthly_rate = max(100.0, (rem_val / max(1.0, days_remaining / 30.0)))
            new_monthly_rate = current_monthly_rate + monthly_saving
            new_days_needed = (rem_val / new_monthly_rate) * 30.0
            days_accelerated = max(1, min(days_remaining - 1, int(days_remaining - new_days_needed)))

            impact_summary = (
                f"Trimming {trim_pct}% from {cat_name} (save ₹{monthly_saving:,.0f}/mo) accelerates "
                f"'{paired_goal.name}' by ~{days_accelerated} days! {config['tip']}."
            )
            suggested_deposit = min(rem_val, max(250.0, round(monthly_saving / 2.0, -1)))

            recommendations.append(
                SavingsCoachRecommendationOut(
                    id=f"rec-{cat_name.lower()}",
                    title=f"Trim {trim_pct}% from {cat_name}",
                    category=cat_name,
                    current_monthly_spend=spend_val,
                    target_reduction_pct=float(trim_pct),
                    monthly_potential_savings=monthly_saving,
                    impact_summary=impact_summary,
                    associated_goal_id=paired_goal.id,
                    associated_goal_name=paired_goal.name,
                    days_accelerated=days_accelerated,
                    suggested_deposit_amount=suggested_deposit,
                )
            )
        else:
            # No active goals
            impact_summary = (
                f"Trimming {trim_pct}% from {cat_name} saves ₹{monthly_saving:,.0f}/mo. "
                f"We recommend creating an Emergency Fund goal to absorb these savings! {config['tip']}."
            )
            suggested_deposit = max(500.0, round(monthly_saving / 2.0, -1))
            recommendations.append(
                SavingsCoachRecommendationOut(
                    id=f"rec-{cat_name.lower()}",
                    title=f"Optimize {cat_name} Outlay",
                    category=cat_name,
                    current_monthly_spend=spend_val,
                    target_reduction_pct=float(trim_pct),
                    monthly_potential_savings=monthly_saving,
                    impact_summary=impact_summary,
                    associated_goal_id=None,
                    associated_goal_name=None,
                    days_accelerated=0,
                    suggested_deposit_amount=suggested_deposit,
                )
            )

    # If no discretionary categories qualified (e.g. new account), provide a sensible baseline
    if not recommendations:
        paired_goal = active_goals[0] if active_goals else None
        recommendations.append(
            SavingsCoachRecommendationOut(
                id="rec-general-habit",
                title="Establish 10% Discretionary Buffer",
                category="General",
                current_monthly_spend=0.0,
                target_reduction_pct=10.0,
                monthly_potential_savings=1500.0,
                impact_summary=(
                    "Set aside a fixed 10% savings habit before spending on non-essentials. "
                    + (f"Could fund '{paired_goal.name}' faster!" if paired_goal else "Builds your safety cushion.")
                ),
                associated_goal_id=paired_goal.id if paired_goal else None,
                associated_goal_name=paired_goal.name if paired_goal else None,
                days_accelerated=15 if paired_goal else 0,
                suggested_deposit_amount=1000.0,
            )
        )
        total_potential_savings = 1500.0

    return SavingsCoachPlanOut(
        monthly_discretionary_spend=from_paise(total_discretionary_paise),
        total_potential_monthly_savings=round(total_potential_savings, 2),
        active_goals_count=len(active_goals),
        recommendations=recommendations,
        disclaimer=(
            "FINORA AI Savings Coach calculations are advisory simulations based on your actual transaction records. "
            "FINORA will never transfer or move funds automatically. Any deposit requires your explicit confirmation."
        ),
    )
