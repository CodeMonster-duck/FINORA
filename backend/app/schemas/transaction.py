from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TransactionType = Literal["income", "expense"]
TransactionStatus = Literal["completed", "pending"]

INCOME_CATEGORIES = (
    "Salary",
    "Freelancing",
    "Business",
    "Investment income",
    "Other income",
)

EXPENSE_CATEGORIES = (
    "Food",
    "Groceries",
    "Transport",
    "Shopping",
    "Education",
    "Healthcare",
    "Entertainment",
    "Rent",
    "Bills",
    "Subscriptions",
    "Other",
)

PAYMENT_METHODS = (
    "UPI",
    "Bank Transfer",
    "Debit Card",
    "Credit Card",
    "Net Banking",
    "Wallet",
    "Cash",
)


class TransactionBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    amount: float = Field(..., gt=0, le=100_000_000)
    type: TransactionType
    category: str = Field(..., min_length=2, max_length=48)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    payment_method: str = Field(default="UPI", min_length=2, max_length=32)
    description: str = Field(default="", max_length=255)
    notes: str | None = Field(default=None, max_length=1000)
    status: TransactionStatus = "completed"

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Transaction title must be at least 2 characters.")
        return cleaned

    @field_validator("date")
    @classmethod
    def validate_iso_date(cls, v: str) -> str:
        dt_date.fromisoformat(v)
        return v

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v: str) -> str:
        if v not in PAYMENT_METHODS:
            raise ValueError(
                f"Invalid payment method. Must be one of: {', '.join(PAYMENT_METHODS)}"
            )
        return v

    @model_validator(mode="after")
    def validate_category_for_type(self) -> TransactionBase:
        valid = INCOME_CATEGORIES if self.type == "income" else EXPENSE_CATEGORIES
        if self.category not in valid:
            raise ValueError(
                f"Category '{self.category}' is not valid for type '{self.type}'."
            )
        if not self.description.strip():
            self.description = self.title
        return self


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(TransactionBase):
    pass


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    amount: float
    type: TransactionType
    category: str
    date: str
    payment_method: str
    description: str
    notes: str | None
    status: TransactionStatus
    created_at: datetime
    updated_at: datetime


class TransactionListResponse(BaseModel):
    items: list[TransactionOut]
    total_count: int
    page: int
    page_size: int
    total_income: float
    total_expenses: float
    net_balance: float
