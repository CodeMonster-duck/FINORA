from __future__ import annotations

import math
from collections import defaultdict
from datetime import date as dt_date
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.savings import SavingsGoal
from app.models.transaction import Transaction
from app.schemas.analytics import (
    AnalyticsOverviewOut,
    CategoryExpenseOut,
    FinancialHealthScoreOut,
    HealthScoreFactorOut,
    MonthlyComparisonOut,
    MonthlyTrendOut,
    SpendingInsightOut,
    WeeklySpendingOut,
)
from app.services.auth_service import from_paise
from app.services.finance_service import compute_budget_utilization


def _shift_month(ref: dt_date, months_back: int) -> tuple[int, int]:
    total_months = ref.year * 12 + (ref.month - 1) - months_back
    year, month_zero = divmod(total_months, 12)
    return year, month_zero + 1


def _month_key(ref: dt_date, months_back: int = 0) -> str:
    y, m = _shift_month(ref, months_back)
    return f"{y:04d}-{m:02d}"


def _month_label(month_key: str) -> str:
    parsed = dt_date.fromisoformat(f"{month_key}-01")
    return parsed.strftime("%b %y")


def _calc_savings_rate(income_paise: int, expense_paise: int) -> float:
    if income_paise <= 0:
        return 0.0
    return round(((income_paise - expense_paise) / income_paise) * 100, 1)


def _calc_delta_pct(current_paise: int, previous_paise: int) -> float:
    if previous_paise == 0:
        return 0.0 if current_paise == 0 else 100.0
    return round(((current_paise - previous_paise) / abs(previous_paise)) * 100, 1)


def _get_user_transactions(db: Session, user_id: int) -> list[Transaction]:
    return list(
        db.scalars(
            select(Transaction).where(Transaction.user_id == user_id)
        ).all()
    )


def get_category_expenses(
    transactions: list[Transaction], month_prefix: str | None = None
) -> list[CategoryExpenseOut]:
    totals: dict[str, int] = defaultdict(int)
    counts: dict[str, int] = defaultdict(int)
    grand_total = 0

    for tx in transactions:
        if tx.type != "expense":
            continue
        if month_prefix and not tx.date.startswith(month_prefix):
            continue
        totals[tx.category] += tx.amount_paise
        counts[tx.category] += 1
        grand_total += tx.amount_paise

    items = [
        CategoryExpenseOut(
            category=cat,
            amount=from_paise(paise),
            percentage=round((paise / grand_total) * 100, 1) if grand_total > 0 else 0.0,
            count=counts[cat],
        )
        for cat, paise in totals.items()
    ]
    return sorted(items, key=lambda item: item.amount, reverse=True)


def get_monthly_trends(
    db: Session, user_id: int, months: int = 6, ref: dt_date | None = None
) -> list[MonthlyTrendOut]:
    today = ref or dt_date.today()
    txs = _get_user_transactions(db, user_id)
    points: list[MonthlyTrendOut] = []

    for i in range(months - 1, -1, -1):
        m_key = _month_key(today, i)
        inc_p = sum(
            t.amount_paise for t in txs if t.type == "income" and t.date.startswith(m_key)
        )
        exp_p = sum(
            t.amount_paise for t in txs if t.type == "expense" and t.date.startswith(m_key)
        )
        points.append(
            MonthlyTrendOut(
                month_key=m_key,
                label=_month_label(m_key),
                income=from_paise(inc_p),
                expenses=from_paise(exp_p),
                savings=from_paise(inc_p - exp_p),
                savings_rate=_calc_savings_rate(inc_p, exp_p),
            )
        )
    return points


def get_weekly_spending(
    db: Session, user_id: int, weeks: int = 8, ref: dt_date | None = None
) -> list[WeeklySpendingOut]:
    today = ref or dt_date.today()
    txs = _get_user_transactions(db, user_id)
    current_monday = today - timedelta(days=today.weekday())
    points: list[WeeklySpendingOut] = []

    for i in range(weeks - 1, -1, -1):
        start = current_monday - timedelta(weeks=i)
        end = start + timedelta(days=6)
        start_str = start.isoformat()
        end_str = end.isoformat()

        paise = 0
        count = 0
        for tx in txs:
            if tx.type == "expense" and start_str <= tx.date <= end_str:
                paise += tx.amount_paise
                count += 1

        points.append(
            WeeklySpendingOut(
                week_label=start.strftime("%d %b"),
                amount=from_paise(paise),
                transaction_count=count,
            )
        )
    return points


def get_analytics_overview(
    db: Session, user_id: int, months: int = 6, ref: dt_date | None = None
) -> AnalyticsOverviewOut:
    today = ref or dt_date.today()
    txs = _get_user_transactions(db, user_id)
    curr_m = _month_key(today, 0)
    prev_m = _month_key(today, 1)

    all_inc_p = sum(t.amount_paise for t in txs if t.type == "income")
    all_exp_p = sum(t.amount_paise for t in txs if t.type == "expense")

    curr_inc_p = sum(
        t.amount_paise for t in txs if t.type == "income" and t.date.startswith(curr_m)
    )
    prev_inc_p = sum(
        t.amount_paise for t in txs if t.type == "income" and t.date.startswith(prev_m)
    )
    curr_exp_p = sum(
        t.amount_paise for t in txs if t.type == "expense" and t.date.startswith(curr_m)
    )
    prev_exp_p = sum(
        t.amount_paise for t in txs if t.type == "expense" and t.date.startswith(prev_m)
    )
    curr_sav_p = curr_inc_p - curr_exp_p
    prev_sav_p = prev_inc_p - prev_exp_p

    trends = get_monthly_trends(db, user_id, months=months, ref=today)
    active_months = [m for m in trends if m.income > 0 or m.expenses > 0]
    divisor = max(1, len(active_months))

    avg_exp = round(sum(m.expenses for m in active_months) / divisor, 2)
    avg_inc = round(sum(m.income for m in active_months) / divisor, 2)
    curr_cats = get_category_expenses(txs, curr_m)

    return AnalyticsOverviewOut(
        total_balance=from_paise(all_inc_p - all_exp_p),
        total_income_all_time=from_paise(all_inc_p),
        total_expenses_all_time=from_paise(all_exp_p),
        monthly_income=from_paise(curr_inc_p),
        monthly_expenses=from_paise(curr_exp_p),
        monthly_savings=from_paise(curr_sav_p),
        monthly_savings_rate=_calc_savings_rate(curr_inc_p, curr_exp_p),
        comparison=MonthlyComparisonOut(
            current_month_key=curr_m,
            previous_month_key=prev_m,
            current_income=from_paise(curr_inc_p),
            previous_income=from_paise(prev_inc_p),
            income_change_pct=_calc_delta_pct(curr_inc_p, prev_inc_p),
            current_expenses=from_paise(curr_exp_p),
            previous_expenses=from_paise(prev_exp_p),
            expense_change_pct=_calc_delta_pct(curr_exp_p, prev_exp_p),
            current_savings=from_paise(curr_sav_p),
            previous_savings=from_paise(prev_sav_p),
            savings_change_pct=_calc_delta_pct(curr_sav_p, prev_sav_p),
            current_savings_rate=_calc_savings_rate(curr_inc_p, curr_exp_p),
            previous_savings_rate=_calc_savings_rate(prev_inc_p, prev_exp_p),
        ),
        top_expense_category=curr_cats[0] if curr_cats else None,
        average_monthly_expenses=avg_exp,
        average_monthly_income=avg_inc,
    )


def get_financial_health_score(
    db: Session, user_id: int, ref: dt_date | None = None
) -> FinancialHealthScoreOut:
    today = ref or dt_date.today()
    curr_m = _month_key(today, 0)
    txs = _get_user_transactions(db, user_id)
    budgets = list(
        db.scalars(
            select(Budget).where(Budget.user_id == user_id, Budget.month == curr_m)
        ).all()
    )
    goals = list(
        db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user_id)).all()
    )

    inc_p = sum(
        t.amount_paise for t in txs if t.type == "income" and t.date.startswith(curr_m)
    )
    exp_p = sum(
        t.amount_paise for t in txs if t.type == "expense" and t.date.startswith(curr_m)
    )
    savings_rate = _calc_savings_rate(inc_p, exp_p)

    # 1. Savings Rate (35 pts)
    if inc_p <= 0:
        sav_score = 0
    elif savings_rate >= 30:
        sav_score = 35
    elif savings_rate >= 20:
        sav_score = 28 + round(((savings_rate - 20) / 10) * 7)
    elif savings_rate >= 10:
        sav_score = 18 + round(((savings_rate - 10) / 10) * 10)
    elif savings_rate > 0:
        sav_score = max(6, round((savings_rate / 10) * 18))
    else:
        sav_score = 2

    sav_factor = HealthScoreFactorOut(
        id="savings-rate",
        label="Savings Rate",
        score=sav_score,
        max_score=35,
        metric_display=f"{max(0.0, savings_rate):.1f}%" if inc_p > 0 else "No income yet",
        explanation=(
            "Add monthly income transactions to evaluate your savings cushion."
            if inc_p <= 0
            else "Saving at least 25% of monthly income builds a resilient buffer."
            if savings_rate >= 25
            else "Healthy positive savings; raising toward 25% unlocks top-tier score."
            if savings_rate >= 10
            else "Expenses consume nearly all monthly income this month."
        ),
        status="strong" if sav_score >= 26 else "moderate" if sav_score >= 16 else "needs-attention",
    )

    # 2. Budget Adherence (30 pts)
    month_expenses = [
        t for t in txs if t.type == "expense" and t.date.startswith(curr_m)
    ]
    if not budgets:
        bgt_score = 18
        bgt_metric = "No budgets set"
        bgt_expl = "Create category budgets to track limits and earn full adherence points."
    else:
        utils = [compute_budget_utilization(b, month_expenses) for b in budgets]
        exceeded = sum(1 for u in utils if u.status == "exceeded")
        approaching = sum(1 for u in utils if u.status == "approaching")
        on_track = len(utils) - exceeded
        avg_util = sum(min(u.utilization_percentage, 140) for u in utils) / len(utils)
        bgt_score = max(
            4,
            min(
                30,
                round((on_track / len(utils)) * 26 + (4 if approaching == 0 else 2) - exceeded * 4),
            ),
        )
        bgt_metric = f"{on_track}/{len(utils)} within limit"
        bgt_expl = (
            f"All {len(utils)} category budgets are within cap ({avg_util:.0f}% avg used)."
            if exceeded == 0
            else f"{exceeded} budget(s) exceeded this month; trimming discretionary spend helps."
        )

    bgt_factor = HealthScoreFactorOut(
        id="budget-adherence",
        label="Budget Adherence",
        score=bgt_score,
        max_score=30,
        metric_display=bgt_metric,
        explanation=bgt_expl,
        status="strong" if bgt_score >= 23 else "moderate" if bgt_score >= 15 else "needs-attention",
    )

    # 3. Spending Consistency (20 pts)
    recent_trends = [
        t for t in get_monthly_trends(db, user_id, months=3, ref=today)
        if t.income > 0 or t.expenses > 0
    ]
    if len(recent_trends) >= 2:
        exps = [t.expenses for t in recent_trends]
        avg_exp = sum(exps) / len(exps)
        if avg_exp > 0:
            variance = sum((v - avg_exp) ** 2 for v in exps) / len(exps)
            cv = math.sqrt(variance) / avg_exp
            con_score = 20 if cv <= 0.12 else 16 if cv <= 0.25 else 12 if cv <= 0.4 else 7
            con_metric = "Steady pattern" if cv <= 0.15 else "Moderate variance" if cv <= 0.3 else "High swing"
            con_expl = (
                f"Monthly expenses stay within ±{round(cv * 100)}% of your 3-month average."
                if cv <= 0.2
                else f"Monthly spending fluctuated by ~{round(cv * 100)}% across recent months."
            )
        else:
            con_score, con_metric, con_expl = 14, "Low spend", "Minimal expenses recorded."
    elif txs:
        con_score, con_metric, con_expl = 13, "1 month active", "Consistency refines across 2+ months."
    else:
        con_score, con_metric, con_expl = 10, "Limited history", "Track expenses over multiple months."

    con_factor = HealthScoreFactorOut(
        id="spending-consistency",
        label="Spending Consistency",
        score=con_score,
        max_score=20,
        metric_display=con_metric,
        explanation=con_expl,
        status="strong" if con_score >= 16 else "moderate" if con_score >= 11 else "needs-attention",
    )

    # 4. Savings Goal Progress (15 pts)
    if not goals:
        goal_score = 6
        goal_metric = "No goals set"
        goal_expl = "Set at least one savings goal to track targeted wealth progress."
    else:
        pcts = [
            min(100.0, (g.current_amount_paise / g.target_amount_paise) * 100)
            if g.target_amount_paise > 0
            else 0.0
            for g in goals
        ]
        avg_pct = sum(pcts) / len(pcts)
        completed = sum(1 for g in goals if g.current_amount_paise >= g.target_amount_paise)
        goal_score = max(4, min(15, round((avg_pct / 100) * 12) + (3 if completed > 0 else 2)))
        goal_metric = f"{avg_pct:.0f}% avg progress"
        goal_expl = f"{len(goals)} goal(s) averaging {avg_pct:.0f}% funded ({completed} completed)."

    goal_factor = HealthScoreFactorOut(
        id="goal-progress",
        label="Savings Goal Progress",
        score=goal_score,
        max_score=15,
        metric_display=goal_metric,
        explanation=goal_expl,
        status="strong" if goal_score >= 12 else "moderate" if goal_score >= 8 else "needs-attention",
    )

    factors = [sav_factor, bgt_factor, con_factor, goal_factor]
    total_score = max(0, min(100, sum(f.score for f in factors)))

    if total_score >= 82:
        grade = "Excellent"
        summary = "Strong cash-flow discipline, healthy savings rate, and consistent budget execution."
    elif total_score >= 65:
        grade = "Good"
        summary = "Solid financial footing with manageable expenses and steady goal momentum."
    elif total_score >= 45:
        grade = "Fair"
        summary = "Moderate balance overall. Reviewing approaching budgets and boosting savings rate helps."
    else:
        grade = "Needs Attention"
        summary = "Spending currently pressures your budget guardrails. Focus on top expense categories."

    return FinancialHealthScoreOut(
        total_score=total_score,
        grade=grade,  # type: ignore[arg-type]
        summary=summary,
        disclaimer=(
            "Rule-based personal wellness metric computed strictly from your tracked "
            "transactions, budgets, and goals — not a certified financial assessment."
        ),
        factors=factors,
    )


def get_smart_insights(
    db: Session, user_id: int, ref: dt_date | None = None
) -> list[SpendingInsightOut]:
    today = ref or dt_date.today()
    curr_m = _month_key(today, 0)
    prev_m = _month_key(today, 1)
    txs = _get_user_transactions(db, user_id)
    budgets = list(
        db.scalars(
            select(Budget).where(Budget.user_id == user_id, Budget.month == curr_m)
        ).all()
    )
    goals = list(
        db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user_id)).all()
    )

    insights: list[SpendingInsightOut] = []
    curr_cats = get_category_expenses(txs, curr_m)
    prev_cats = {c.category: c.amount for c in get_category_expenses(txs, prev_m)}

    if curr_cats:
        biggest_shift = None
        for cat_item in curr_cats:
            prev_amt = prev_cats.get(cat_item.category, 0.0)
            if prev_amt > 0:
                pct_change = round(((cat_item.amount - prev_amt) / prev_amt) * 100)
                if biggest_shift is None or abs(pct_change) > abs(biggest_shift[1]):
                    biggest_shift = (cat_item, pct_change)

        if biggest_shift and abs(biggest_shift[1]) >= 5:
            cat_item, pct_change = biggest_shift
            increased = pct_change > 0
            insights.append(
                SpendingInsightOut(
                    id="insight-mom-category",
                    title=f"{cat_item.category} {'spend uptick' if increased else 'savings win'}",
                    description=(
                        f"You spent {abs(pct_change)}% {'more' if increased else 'less'} on "
                        f"{cat_item.category} (₹{cat_item.amount:,.0f}) compared with last month."
                    ),
                    tone="warning" if increased else "positive",
                    metric=f"{'+' if increased else '-'}{abs(pct_change)}%",
                    action_route="/analytics",
                    action_label="View trends",
                )
            )
        else:
            top = curr_cats[0]
            insights.append(
                SpendingInsightOut(
                    id="insight-top-category",
                    title=f"Top spend: {top.category}",
                    description=f"{top.category} accounts for {top.percentage}% of this month's expenses.",
                    tone="info",
                    metric=f"{top.percentage}%",
                    action_route="/transactions",
                    action_label="Inspect entries",
                )
            )

    if budgets:
        month_expenses = [
            t for t in txs if t.type == "expense" and t.date.startswith(curr_m)
        ]
        utils = sorted(
            [compute_budget_utilization(b, month_expenses) for b in budgets],
            key=lambda u: u.utilization_percentage,
            reverse=True,
        )
        exceeded = next((u for u in utils if u.status == "exceeded"), None)
        approaching = next((u for u in utils if u.status == "approaching"), None)
        if exceeded:
            insights.append(
                SpendingInsightOut(
                    id="insight-budget-exceeded",
                    title=f"{exceeded.budget.category} budget exceeded",
                    description=(
                        f"Spent ₹{exceeded.spent:,.0f} against a ₹{exceeded.budget.limit:,.0f} cap "
                        f"({exceeded.utilization_percentage:.0f}% used)."
                    ),
                    tone="danger",
                    metric=f"{exceeded.utilization_percentage:.0f}%",
                    action_route="/budgets",
                    action_label="Review budget",
                )
            )
        elif approaching:
            insights.append(
                SpendingInsightOut(
                    id="insight-budget-approaching",
                    title=f"{approaching.budget.category} nearing limit",
                    description=(
                        f"₹{approaching.remaining:,.0f} remaining in your {approaching.budget.category} "
                        f"monthly budget ({approaching.utilization_percentage:.0f}% utilized)."
                    ),
                    tone="warning",
                    metric=f"{approaching.utilization_percentage:.0f}%",
                    action_route="/budgets",
                    action_label="Adjust limit",
                )
            )

    active_goals = [
        g for g in goals if g.target_amount_paise > 0 and g.current_amount_paise < g.target_amount_paise
    ]
    if active_goals:
        nearest = max(
            active_goals,
            key=lambda g: g.current_amount_paise / g.target_amount_paise,
        )
        pct = round((nearest.current_amount_paise / nearest.target_amount_paise) * 100)
        rem = from_paise(nearest.target_amount_paise - nearest.current_amount_paise)
        insights.append(
            SpendingInsightOut(
                id="insight-nearest-goal",
                title=f"{nearest.name} at {pct}%",
                description=f"Only ₹{rem:,.0f} remaining to complete this savings milestone.",
                tone="positive" if pct >= 75 else "info",
                metric=f"{pct}%",
                action_route="/savings",
                action_label="Add money",
            )
        )

    if not insights:
        insights.append(
            SpendingInsightOut(
                id="insight-empty",
                title="Ready for your financial activity",
                description="Add transactions, budgets, or savings goals to generate personalized insights.",
                tone="info",
                action_route="/transactions",
                action_label="Add transaction",
            )
        )

    return insights[:4]
