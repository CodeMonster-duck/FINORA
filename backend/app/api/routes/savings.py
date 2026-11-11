from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.connection import get_db
from app.models.user import User
from app.schemas.savings import (
    ContributionCreate,
    SavingsGoalCreate,
    SavingsGoalOut,
    SavingsGoalUpdate,
    SavingsSummaryResponse,
)
from app.services.finance_service import (
    add_goal_contribution,
    create_savings_goal,
    delete_savings_goal,
    list_savings_goals,
    serialize_savings_goal,
    update_savings_goal,
)

router = APIRouter(prefix="/savings", tags=["Savings Goals"])


@router.get("", response_model=SavingsSummaryResponse)
def get_savings_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsSummaryResponse:
    return list_savings_goals(db, current_user.id)


@router.post(
    "",
    response_model=SavingsGoalOut,
    status_code=status.HTTP_201_CREATED,
)
def post_savings_goal(
    payload: SavingsGoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalOut:
    goal = create_savings_goal(db, current_user.id, payload)
    return serialize_savings_goal(goal)


@router.put("/{goal_id}", response_model=SavingsGoalOut)
def put_savings_goal(
    goal_id: int,
    payload: SavingsGoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalOut:
    goal = update_savings_goal(db, current_user.id, goal_id, payload)
    return serialize_savings_goal(goal)


@router.post(
    "/{goal_id}/contributions",
    response_model=SavingsGoalOut,
    status_code=status.HTTP_201_CREATED,
)
def post_contribution(
    goal_id: int,
    payload: ContributionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsGoalOut:
    goal = add_goal_contribution(db, current_user.id, goal_id, payload)
    return serialize_savings_goal(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_savings_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    delete_savings_goal(db, current_user.id, goal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
