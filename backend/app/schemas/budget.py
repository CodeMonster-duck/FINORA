from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.transaction import EXPENSE_CATEGORIES

BudgetStatus = Literal["normal", "approaching", "exceeded"]


class BudgetBase(BaseModel):
    category: str = Field(..., min_length=2, max_length=48)
    limit: float = Field(..., gt=0, le=100_000_000)
    month: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    alert_threshold: int = Field(default=80, ge=10, le=100)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("category")
    @classmethod
    def validate_expense_category(cls, v: str) -> str:
        if v not in EXPENSE_CATEGORIES:
            raise ValueError(
                f"Budget category must be an expense category: {', '.join(EXPENSE_CATEGORIES)}"
            )
        return v


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BudgetBase):
    pass


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    category: str
    limit: float
    month: str
    alert_threshold: int
    notes: str | None
    created_at: datetime
    updated_at: datetime


class BudgetUtilizationOut(BaseModel):
    budget: BudgetOut
    spent: float
    remaining: float
    utilization_percentage: float
    status: BudgetStatus
    transaction_count: int


class BudgetSummaryResponse(BaseModel):
    month: str
    items: list[BudgetUtilizationOut]
    total_limit: float
    total_spent: float
    total_remaining: float
    overall_percentage: float
    on_track_count: int
    approaching_count: int
    exceeded_count: int
