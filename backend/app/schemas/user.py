from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

CurrencyCode = Literal["INR", "USD", "EUR"]
DateFormatOption = Literal["DD/MM/YYYY", "DD MMM YYYY", "YYYY-MM-DD"]
ThemeMode = Literal["dark", "light"]


class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)
    role: str = Field(default="Personal Finance Member", max_length=120)
    monthly_income_target: float = Field(default=0, ge=0, le=100_000_000)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=72)


class UserProfileUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    role: str = Field(default="Personal Finance Member", max_length=120)
    monthly_income_target: float = Field(default=0, ge=0, le=100_000_000)


class UserPreferencesUpdate(BaseModel):
    currency: CurrencyCode | None = None
    date_format: DateFormatOption | None = None
    theme: ThemeMode | None = None
    compact_numbers: bool | None = None
    show_health_score_breakdown: bool | None = None
    budget_alerts_enabled: bool | None = None
    goal_milestones_enabled: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: str
    monthly_income_target: float
    currency: CurrencyCode
    date_format: DateFormatOption
    theme: ThemeMode
    compact_numbers: bool
    show_health_score_breakdown: bool
    budget_alerts_enabled: bool
    goal_milestones_enabled: bool
    is_demo: bool
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
