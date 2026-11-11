from __future__ import annotations

from datetime import date as dt_date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.connection import get_db
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsOverviewOut,
    CategoryExpenseOut,
    FinancialHealthScoreOut,
    MonthlyTrendOut,
    SpendingInsightOut,
    WeeklySpendingOut,
)
from app.services.analytics_service import (
    get_analytics_overview,
    get_category_expenses,
    get_financial_health_score,
    get_monthly_trends,
    get_smart_insights,
    get_weekly_spending,
)

router = APIRouter(prefix="/analytics", tags=["Analytics & Insights"])


@router.get("/overview", response_model=AnalyticsOverviewOut)
def read_overview(
    months: int = Query(default=6, ge=1, le=24),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsOverviewOut:
    return get_analytics_overview(db, current_user.id, months=months)


@router.get("/trends", response_model=list[MonthlyTrendOut])
def read_trends(
    months: int = Query(default=6, ge=1, le=24),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MonthlyTrendOut]:
    return get_monthly_trends(db, current_user.id, months=months)


@router.get("/categories", response_model=list[CategoryExpenseOut])
def read_categories(
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CategoryExpenseOut]:
    txs = list(
        db.scalars(
            select(Transaction).where(Transaction.user_id == current_user.id)
        ).all()
    )
    target_month = month or dt_date.today().strftime("%Y-%m")
    return get_category_expenses(txs, target_month)


@router.get("/weekly", response_model=list[WeeklySpendingOut])
def read_weekly(
    weeks: int = Query(default=8, ge=1, le=26),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WeeklySpendingOut]:
    return get_weekly_spending(db, current_user.id, weeks=weeks)


@router.get("/health-score", response_model=FinancialHealthScoreOut)
def read_health_score(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FinancialHealthScoreOut:
    return get_financial_health_score(db, current_user.id)


@router.get("/insights", response_model=list[SpendingInsightOut])
def read_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SpendingInsightOut]:
    return get_smart_insights(db, current_user.id)
