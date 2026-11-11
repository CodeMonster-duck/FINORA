from __future__ import annotations

from datetime import date as dt_date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.connection import get_db
from app.models.user import User
from app.schemas.budget import (
    BudgetCreate,
    BudgetOut,
    BudgetSummaryResponse,
    BudgetUpdate,
)
from app.services.finance_service import (
    create_budget,
    delete_budget,
    list_budgets_with_utilization,
    serialize_budget,
    update_budget,
)

router = APIRouter(prefix="/budgets", tags=["Budgets"])


@router.get("", response_model=BudgetSummaryResponse)
def get_budgets(
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetSummaryResponse:
    target_month = month or dt_date.today().strftime("%Y-%m")
    return list_budgets_with_utilization(db, current_user.id, target_month)


@router.post(
    "",
    response_model=BudgetOut,
    status_code=status.HTTP_201_CREATED,
)
def post_budget(
    payload: BudgetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetOut:
    budget = create_budget(db, current_user.id, payload)
    return serialize_budget(budget)


@router.put("/{budget_id}", response_model=BudgetOut)
def put_budget(
    budget_id: int,
    payload: BudgetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetOut:
    budget = update_budget(db, current_user.id, budget_id, payload)
    return serialize_budget(budget)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    delete_budget(db, current_user.id, budget_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
