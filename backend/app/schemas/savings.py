from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

GoalCategory = Literal[
    "Emergency",
    "Tech",
    "Education",
    "Travel",
    "Lifestyle",
    "Investment",
    "Other",
]
GoalPriority = Literal["high", "medium", "low"]


class ContributionCreate(BaseModel):
    amount: float = Field(..., gt=0, le=100_000_000)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str | None = Field(default=None, max_length=255)

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str | None) -> str | None:
        if v is not None:
            dt_date.fromisoformat(v)
        return v


class ContributionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    goal_id: int
    amount: float
    date: str
    note: str | None
    created_at: datetime


class SavingsGoalBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    category: GoalCategory = "Emergency"
    target_amount: float = Field(..., gt=0, le=100_000_000)
    current_amount: float = Field(default=0, ge=0, le=100_000_000)
    target_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    priority: GoalPriority = "medium"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Goal name must be at least 2 characters.")
        return cleaned

    @field_validator("target_date")
    @classmethod
    def validate_target_date(cls, v: str) -> str:
        dt_date.fromisoformat(v)
        return v


class SavingsGoalCreate(SavingsGoalBase):
    pass


class SavingsGoalUpdate(SavingsGoalBase):
    pass


class SavingsGoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    category: str
    target_amount: float
    current_amount: float
    remaining_amount: float
    progress_percentage: float
    is_completed: bool
    days_remaining: int
    target_date: str
    priority: str
    contributions: list[ContributionOut]
    created_at: datetime
    updated_at: datetime


class SavingsSummaryResponse(BaseModel):
    items: list[SavingsGoalOut]
    total_saved: float
    total_target: float
    total_remaining: float
    overall_percentage: float
    completed_count: int
    active_count: int
