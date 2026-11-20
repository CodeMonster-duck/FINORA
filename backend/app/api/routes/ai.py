from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.connection import get_db
from app.models.user import User
from app.schemas.ai import (
    CopilotChatRequest,
    CopilotChatResponse,
    ExpensePredictionResponseOut,
    SavingsCoachPlanOut,
    VoiceParseRequest,
    VoiceParseResponse,
)
from app.services.ai_copilot_service import process_copilot_chat
from app.services.prediction_service import calculate_expense_predictions
from app.services.savings_coach_service import generate_savings_coach_plan
from app.services.voice_parser_service import parse_voice_command

router = APIRouter(prefix="/ai", tags=["AI & Smart Finance"])


@router.post("/copilot/chat", response_model=CopilotChatResponse)
def copilot_chat(
    payload: CopilotChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CopilotChatResponse:
    """
    FINORA AI Financial Copilot conversational advisor.
    Uses Google Gemini 2.0 Flash when configured; seamlessly falls back to a deterministic rule engine.
    Strictly isolated to authenticated tenant data.
    """
    return process_copilot_chat(
        db,
        user_id=current_user.id,
        user_message=payload.message,
        conversation_history=payload.conversation_history,
    )


@router.get("/predictions/expenses", response_model=ExpensePredictionResponseOut)
def predict_expenses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpensePredictionResponseOut:
    """
    Month-end expense forecast using daily burn-rate velocity and multi-month EWMA.
    Separates actual spend from predicted spend and warns of potential budget overruns.
    """
    return calculate_expense_predictions(db, user_id=current_user.id)


@router.get("/savings/coach-plan", response_model=SavingsCoachPlanOut)
def savings_coach_plan(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavingsCoachPlanOut:
    """
    AI Savings Coach recommendations targeting discretionary expenses.
    Calculates milestone acceleration for active savings goals without modifying records.
    """
    return generate_savings_coach_plan(db, user_id=current_user.id)


@router.post("/voice/parse", response_model=VoiceParseResponse)
def parse_voice(
    payload: VoiceParseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VoiceParseResponse:
    """
    Parses spoken natural language commands.
    Extracts transaction parameters with mandatory user confirmation required.
    """
    return parse_voice_command(db, user_id=current_user.id, transcript=payload.transcript)
