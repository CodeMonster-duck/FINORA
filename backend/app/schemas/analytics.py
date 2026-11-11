from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CategoryExpenseOut(BaseModel):
    category: str
    amount: float
    percentage: float
    count: int


class MonthlyTrendOut(BaseModel):
    month_key: str
    label: str
    income: float
    expenses: float
    savings: float
    savings_rate: float


class WeeklySpendingOut(BaseModel):
    week_label: str
    amount: float
    transaction_count: int


class MonthlyComparisonOut(BaseModel):
    current_month_key: str
    previous_month_key: str
    current_income: float
    previous_income: float
    income_change_pct: float
    current_expenses: float
    previous_expenses: float
    expense_change_pct: float
    current_savings: float
    previous_savings: float
    savings_change_pct: float
    current_savings_rate: float
    previous_savings_rate: float


class HealthScoreFactorOut(BaseModel):
    id: str
    label: str
    score: int
    max_score: int
    metric_display: str
    explanation: str
    status: Literal["strong", "moderate", "needs-attention"]


class FinancialHealthScoreOut(BaseModel):
    total_score: int
    grade: Literal["Excellent", "Good", "Fair", "Needs Attention"]
    summary: str
    disclaimer: str
    factors: list[HealthScoreFactorOut]


class SpendingInsightOut(BaseModel):
    id: str
    title: str
    description: str
    tone: Literal["positive", "warning", "info", "danger"]
    metric: str | None = None
    action_route: str | None = None
    action_label: str | None = None


class AnalyticsOverviewOut(BaseModel):
    total_balance: float
    total_income_all_time: float
    total_expenses_all_time: float
    monthly_income: float
    monthly_expenses: float
    monthly_savings: float
    monthly_savings_rate: float
    comparison: MonthlyComparisonOut
    top_expense_category: CategoryExpenseOut | None
    average_monthly_expenses: float
    average_monthly_income: float
