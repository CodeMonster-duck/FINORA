from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


# ---------------- AI Financial Copilot Schemas ----------------


class CopilotChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class CopilotChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User's query")
    conversation_history: list[CopilotChatMessage] = Field(
        default_factory=list,
        max_length=20,
        description="Recent conversation turns for contextual multi-turn chat",
    )


class CopilotChatResponse(BaseModel):
    reply: str
    is_generative: bool
    model_used: str
    suggested_prompts: list[str] = Field(default_factory=list)
    referenced_metrics: dict[str, Any] = Field(default_factory=dict)


# ---------------- Expense Prediction Schemas ----------------


class ExpensePredictionCategoryOut(BaseModel):
    category: str
    current_month_spent: float
    historical_monthly_avg: float
    predicted_month_end: float
    budget_limit: float | None = None
    is_overrun_projected: bool = False
    overrun_amount: float | None = None


class ExpensePredictionResponseOut(BaseModel):
    current_month: str
    days_elapsed: int
    days_in_month: int
    current_spent: float
    predicted_total_spend: float
    daily_burn_rate: float
    has_sufficient_history: bool
    methodology_note: str
    categories: list[ExpensePredictionCategoryOut]
    budget_overrun_warnings: list[str] = Field(default_factory=list)


# ---------------- AI Savings Coach Schemas ----------------


class SavingsCoachRecommendationOut(BaseModel):
    id: str
    title: str
    category: str
    current_monthly_spend: float
    target_reduction_pct: float
    monthly_potential_savings: float
    impact_summary: str
    associated_goal_id: int | None = None
    associated_goal_name: str | None = None
    days_accelerated: int = 0
    suggested_deposit_amount: float = 0.0


class SavingsCoachPlanOut(BaseModel):
    monthly_discretionary_spend: float
    total_potential_monthly_savings: float
    active_goals_count: int
    recommendations: list[SavingsCoachRecommendationOut]
    disclaimer: str


# ---------------- Voice Finance Assistant Schemas ----------------


class VoiceParsedTransactionOut(BaseModel):
    title: str
    amount: float
    type: Literal["income", "expense"]
    category: str
    payment_method: str
    date: str
    description: str = ""


class VoiceParseRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=1000)


class VoiceParseResponse(BaseModel):
    intent: Literal["add_transaction", "query_balance", "query_spending", "query_budget", "query_savings", "general"]
    confidence: float
    parsed_transaction: VoiceParsedTransactionOut | None = None
    requires_confirmation: bool = True
    spoken_feedback: str
    direct_reply: str | None = None
