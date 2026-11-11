from __future__ import annotations

import csv
import io
from datetime import date as dt_date

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.budget import Budget
from app.models.savings import SavingsContribution, SavingsGoal
from app.models.transaction import Transaction
from app.schemas.budget import (
    BudgetCreate,
    BudgetOut,
    BudgetStatus,
    BudgetSummaryResponse,
    BudgetUpdate,
    BudgetUtilizationOut,
)
from app.schemas.savings import (
    ContributionCreate,
    ContributionOut,
    SavingsGoalCreate,
    SavingsGoalOut,
    SavingsGoalUpdate,
    SavingsSummaryResponse,
)
from app.schemas.transaction import (
    TransactionCreate,
    TransactionListResponse,
    TransactionOut,
    TransactionUpdate,
)
from app.services.auth_service import from_paise, to_paise


def serialize_transaction(tx: Transaction) -> TransactionOut:
    return TransactionOut(
        id=tx.id,
        user_id=tx.user_id,
        title=tx.title,
        amount=from_paise(tx.amount_paise),
        type=tx.type,  # type: ignore[arg-type]
        category=tx.category,
        date=tx.date,
        payment_method=tx.payment_method,
        description=tx.description,
        notes=tx.notes,
        status=tx.status,  # type: ignore[arg-type]
        created_at=tx.created_at,
        updated_at=tx.updated_at,
    )


def _apply_transaction_filters(
    stmt,
    user_id: int,
    *,
    search: str | None = None,
    tx_type: str | None = None,
    category: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
):
    stmt = stmt.where(Transaction.user_id == user_id)
    if tx_type in {"income", "expense"}:
        stmt = stmt.where(Transaction.type == tx_type)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if start_date:
        stmt = stmt.where(Transaction.date >= start_date)
    if end_date:
        stmt = stmt.where(Transaction.date <= end_date)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Transaction.title.ilike(pattern),
                Transaction.category.ilike(pattern),
                Transaction.description.ilike(pattern),
                Transaction.payment_method.ilike(pattern),
                Transaction.notes.ilike(pattern),
            )
        )
    return stmt


def list_transactions(
    db: Session,
    user_id: int,
    *,
    search: str | None = None,
    tx_type: str | None = None,
    category: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    sort_by: str = "date-desc",
    page: int = 1,
    page_size: int = 20,
) -> TransactionListResponse:
    base_stmt = _apply_transaction_filters(
        select(Transaction),
        user_id,
        search=search,
        tx_type=tx_type,
        category=category,
        start_date=start_date,
        end_date=end_date,
    )

    all_matching = list(db.scalars(base_stmt).all())
    income_paise = sum(t.amount_paise for t in all_matching if t.type == "income")
    expense_paise = sum(t.amount_paise for t in all_matching if t.type == "expense")

    if sort_by == "date-asc":
        ordered_stmt = base_stmt.order_by(asc(Transaction.date), asc(Transaction.id))
    elif sort_by == "amount-desc":
        ordered_stmt = base_stmt.order_by(desc(Transaction.amount_paise), desc(Transaction.date))
    elif sort_by == "amount-asc":
        ordered_stmt = base_stmt.order_by(asc(Transaction.amount_paise), desc(Transaction.date))
    else:
        ordered_stmt = base_stmt.order_by(desc(Transaction.date), desc(Transaction.id))

    offset = (max(1, page) - 1) * page_size
    paged = list(db.scalars(ordered_stmt.offset(offset).limit(page_size)).all())

    return TransactionListResponse(
        items=[serialize_transaction(t) for t in paged],
        total_count=len(all_matching),
        page=page,
        page_size=page_size,
        total_income=from_paise(income_paise),
        total_expenses=from_paise(expense_paise),
        net_balance=from_paise(income_paise - expense_paise),
    )


def get_transaction_or_404(db: Session, user_id: int, tx_id: int) -> Transaction:
    tx = db.scalar(
        select(Transaction).where(
            Transaction.id == tx_id,
            Transaction.user_id == user_id,
        )
    )
    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )
    return tx


def create_transaction(
    db: Session, user_id: int, payload: TransactionCreate
) -> Transaction:
    tx = Transaction(
        user_id=user_id,
        title=payload.title,
        amount_paise=to_paise(payload.amount),
        type=payload.type,
        category=payload.category,
        date=payload.date,
        payment_method=payload.payment_method,
        description=payload.description,
        notes=payload.notes,
        status=payload.status,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def update_transaction(
    db: Session, user_id: int, tx_id: int, payload: TransactionUpdate
) -> Transaction:
    tx = get_transaction_or_404(db, user_id, tx_id)
    tx.title = payload.title
    tx.amount_paise = to_paise(payload.amount)
    tx.type = payload.type
    tx.category = payload.category
    tx.date = payload.date
    tx.payment_method = payload.payment_method
    tx.description = payload.description
    tx.notes = payload.notes
    tx.status = payload.status
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def delete_transaction(db: Session, user_id: int, tx_id: int) -> None:
    tx = get_transaction_or_404(db, user_id, tx_id)
    db.delete(tx)
    db.commit()


def export_transactions_csv(
    db: Session,
    user_id: int,
    currency: str = "INR",
    *,
    tx_type: str | None = None,
    category: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    stmt = _apply_transaction_filters(
        select(Transaction),
        user_id,
        tx_type=tx_type,
        category=category,
        start_date=start_date,
        end_date=end_date,
    ).order_by(desc(Transaction.date), desc(Transaction.id))

    rows = list(db.scalars(stmt).all())
    output = io.StringIO()
    output.write("\ufeff")  # UTF-8 BOM for Excel INR compatibility
    writer = csv.writer(output)
    writer.writerow(
        [
            "ID",
            "Date",
            "Title",
            "Type",
            "Category",
            "Amount",
            "Currency",
            "Payment Method",
            "Status",
            "Description",
            "Notes",
        ]
    )
    for tx in rows:
        writer.writerow(
            [
                tx.id,
                tx.date,
                tx.title,
                tx.type,
                tx.category,
                f"{from_paise(tx.amount_paise):.2f}",
                currency,
                tx.payment_method,
                tx.status,
                tx.description,
                tx.notes or "",
            ]
        )
    return output.getvalue()


# ---------------- Budgets ----------------


def serialize_budget(budget: Budget) -> BudgetOut:
    return BudgetOut(
        id=budget.id,
        user_id=budget.user_id,
        category=budget.category,
        limit=from_paise(budget.limit_paise),
        month=budget.month,
        alert_threshold=budget.alert_threshold,
        notes=budget.notes,
        created_at=budget.created_at,
        updated_at=budget.updated_at,
    )


def compute_budget_utilization(
    budget: Budget, month_expenses: list[Transaction]
) -> BudgetUtilizationOut:
    # Rule: Only count expense transactions matching the budget category and month. Never count income.
    spent_paise = 0
    tx_count = 0
    for tx in month_expenses:
        if (
            tx.type == "expense"
            and tx.category == budget.category
            and tx.date.startswith(budget.month)
        ):
            spent_paise += tx.amount_paise
            tx_count += 1

    limit_paise = max(0, budget.limit_paise)
    remaining_paise = limit_paise - spent_paise
    utilization_pct = (
        round((spent_paise / limit_paise) * 100, 1) if limit_paise > 0 else 0.0
    )

    status_label: BudgetStatus = "normal"
    if utilization_pct > 100:
        status_label = "exceeded"
    elif utilization_pct >= budget.alert_threshold:
        status_label = "approaching"

    return BudgetUtilizationOut(
        budget=serialize_budget(budget),
        spent=from_paise(spent_paise),
        remaining=from_paise(remaining_paise),
        utilization_percentage=utilization_pct,
        status=status_label,
        transaction_count=tx_count,
    )


def list_budgets_with_utilization(
    db: Session, user_id: int, month: str
) -> BudgetSummaryResponse:
    budgets = list(
        db.scalars(
            select(Budget)
            .where(Budget.user_id == user_id, Budget.month == month)
            .order_by(Budget.category.asc())
        ).all()
    )
    month_expenses = list(
        db.scalars(
            select(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.type == "expense",
                Transaction.date.like(f"{month}%"),
            )
        ).all()
    )

    utilizations = [compute_budget_utilization(b, month_expenses) for b in budgets]
    total_limit_paise = sum(b.limit_paise for b in budgets)
    total_spent_paise = sum(to_paise(u.spent) for u in utilizations)
    total_remaining_paise = total_limit_paise - total_spent_paise
    overall_pct = (
        round((total_spent_paise / total_limit_paise) * 100, 1)
        if total_limit_paise > 0
        else 0.0
    )

    approaching = sum(1 for u in utilizations if u.status == "approaching")
    exceeded = sum(1 for u in utilizations if u.status == "exceeded")
    on_track = max(0, len(utilizations) - approaching - exceeded)

    return BudgetSummaryResponse(
        month=month,
        items=utilizations,
        total_limit=from_paise(total_limit_paise),
        total_spent=from_paise(total_spent_paise),
        total_remaining=from_paise(total_remaining_paise),
        overall_percentage=overall_pct,
        on_track_count=on_track,
        approaching_count=approaching,
        exceeded_count=exceeded,
    )


def get_budget_or_404(db: Session, user_id: int, budget_id: int) -> Budget:
    budget = db.scalar(
        select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id)
    )
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )
    return budget


def create_budget(db: Session, user_id: int, payload: BudgetCreate) -> Budget:
    existing = db.scalar(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.category == payload.category,
            Budget.month == payload.month,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A budget for '{payload.category}' already exists for {payload.month}.",
        )

    budget = Budget(
        user_id=user_id,
        category=payload.category,
        limit_paise=to_paise(payload.limit),
        month=payload.month,
        alert_threshold=payload.alert_threshold,
        notes=payload.notes,
    )
    db.add(budget)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A budget for '{payload.category}' already exists for {payload.month}.",
        ) from exc
    db.refresh(budget)
    return budget


def update_budget(
    db: Session, user_id: int, budget_id: int, payload: BudgetUpdate
) -> Budget:
    budget = get_budget_or_404(db, user_id, budget_id)
    conflict = db.scalar(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.category == payload.category,
            Budget.month == payload.month,
            Budget.id != budget_id,
        )
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A budget for '{payload.category}' already exists for {payload.month}.",
        )

    budget.category = payload.category
    budget.limit_paise = to_paise(payload.limit)
    budget.month = payload.month
    budget.alert_threshold = payload.alert_threshold
    budget.notes = payload.notes
    db.add(budget)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A budget for '{payload.category}' already exists for {payload.month}.",
        ) from exc
    db.refresh(budget)
    return budget


def delete_budget(db: Session, user_id: int, budget_id: int) -> None:
    budget = get_budget_or_404(db, user_id, budget_id)
    db.delete(budget)
    db.commit()


# ---------------- Savings Goals ----------------


def serialize_savings_goal(goal: SavingsGoal) -> SavingsGoalOut:
    current_paise = max(0, goal.current_amount_paise)
    target_paise = max(0, goal.target_amount_paise)
    remaining_paise = max(0, target_paise - current_paise)
    pct = (
        min(100.0, round((current_paise / target_paise) * 100, 1))
        if target_paise > 0
        else 0.0
    )
    is_completed = target_paise > 0 and current_paise >= target_paise
    days_remaining = (dt_date.fromisoformat(goal.target_date) - dt_date.today()).days

    return SavingsGoalOut(
        id=goal.id,
        user_id=goal.user_id,
        name=goal.name,
        category=goal.category,
        target_amount=from_paise(target_paise),
        current_amount=from_paise(current_paise),
        remaining_amount=from_paise(remaining_paise),
        progress_percentage=pct,
        is_completed=is_completed,
        days_remaining=days_remaining,
        target_date=goal.target_date,
        priority=goal.priority,
        contributions=[
            ContributionOut(
                id=c.id,
                goal_id=c.goal_id,
                amount=from_paise(c.amount_paise),
                date=c.date,
                note=c.note,
                created_at=c.created_at,
            )
            for c in goal.contributions
        ],
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )


def list_savings_goals(db: Session, user_id: int) -> SavingsSummaryResponse:
    goals = list(
        db.scalars(
            select(SavingsGoal)
            .options(selectinload(SavingsGoal.contributions))
            .where(SavingsGoal.user_id == user_id)
            .order_by(SavingsGoal.id.desc())
        ).all()
    )

    items = [serialize_savings_goal(g) for g in goals]
    saved_paise = sum(max(0, g.current_amount_paise) for g in goals)
    target_paise = sum(max(0, g.target_amount_paise) for g in goals)
    remaining_paise = max(0, target_paise - saved_paise)
    overall_pct = (
        min(100.0, round((saved_paise / target_paise) * 100, 1))
        if target_paise > 0
        else 0.0
    )
    completed = sum(1 for item in items if item.is_completed)

    return SavingsSummaryResponse(
        items=items,
        total_saved=from_paise(saved_paise),
        total_target=from_paise(target_paise),
        total_remaining=from_paise(remaining_paise),
        overall_percentage=overall_pct,
        completed_count=completed,
        active_count=max(0, len(items) - completed),
    )


def get_savings_goal_or_404(db: Session, user_id: int, goal_id: int) -> SavingsGoal:
    goal = db.scalar(
        select(SavingsGoal)
        .options(selectinload(SavingsGoal.contributions))
        .where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id)
    )
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )
    return goal


def create_savings_goal(
    db: Session, user_id: int, payload: SavingsGoalCreate
) -> SavingsGoal:
    initial_paise = to_paise(payload.current_amount)
    goal = SavingsGoal(
        user_id=user_id,
        name=payload.name,
        category=payload.category,
        target_amount_paise=to_paise(payload.target_amount),
        current_amount_paise=initial_paise,
        target_date=payload.target_date,
        priority=payload.priority,
    )
    db.add(goal)
    db.flush()

    if initial_paise > 0:
        db.add(
            SavingsContribution(
                goal_id=goal.id,
                amount_paise=initial_paise,
                date=dt_date.today().isoformat(),
                note="Opening deposit",
            )
        )

    db.commit()
    return get_savings_goal_or_404(db, user_id, goal.id)


def update_savings_goal(
    db: Session, user_id: int, goal_id: int, payload: SavingsGoalUpdate
) -> SavingsGoal:
    goal = get_savings_goal_or_404(db, user_id, goal_id)
    goal.name = payload.name
    goal.category = payload.category
    goal.target_amount_paise = to_paise(payload.target_amount)
    goal.current_amount_paise = to_paise(payload.current_amount)
    goal.target_date = payload.target_date
    goal.priority = payload.priority
    db.add(goal)
    db.commit()
    return get_savings_goal_or_404(db, user_id, goal.id)


def add_goal_contribution(
    db: Session, user_id: int, goal_id: int, payload: ContributionCreate
) -> SavingsGoal:
    goal = get_savings_goal_or_404(db, user_id, goal_id)
    if goal.current_amount_paise >= goal.target_amount_paise:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This savings goal is already 100% completed.",
        )

    amount_paise = to_paise(payload.amount)
    goal.current_amount_paise += amount_paise
    contrib = SavingsContribution(
        goal_id=goal.id,
        amount_paise=amount_paise,
        date=payload.date or dt_date.today().isoformat(),
        note=(payload.note or "Manual deposit").strip(),
    )
    db.add(contrib)
    db.add(goal)
    db.commit()
    return get_savings_goal_or_404(db, user_id, goal.id)


def delete_savings_goal(db: Session, user_id: int, goal_id: int) -> None:
    goal = get_savings_goal_or_404(db, user_id, goal_id)
    db.delete(goal)
    db.commit()
