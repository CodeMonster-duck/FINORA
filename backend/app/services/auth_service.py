from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.user import (
    UserOut,
    UserPreferencesUpdate,
    UserProfileUpdate,
    UserRegister,
)


def to_paise(rupees: float) -> int:
    return int(round(rupees * 100))


def from_paise(paise: int) -> float:
    return round(paise / 100, 2)


def serialize_user(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        monthly_income_target=from_paise(user.monthly_income_target_paise),
        currency=user.currency,  # type: ignore[arg-type]
        date_format=user.date_format,  # type: ignore[arg-type]
        theme=user.theme,  # type: ignore[arg-type]
        compact_numbers=user.compact_numbers,
        show_health_score_breakdown=user.show_health_score_breakdown,
        budget_alerts_enabled=user.budget_alerts_enabled,
        goal_milestones_enabled=user.goal_milestones_enabled,
        is_demo=user.is_demo,
        is_active=user.is_active,
        created_at=user.created_at,
    )


def get_user_by_email(db: Session, email: str) -> User | None:
    normalized = email.strip().lower()
    return db.scalar(select(User).where(User.email == normalized))


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.scalar(select(User).where(User.id == user_id))


def register_user(db: Session, payload: UserRegister) -> User:
    normalized_email = payload.email.strip().lower()
    if get_user_by_email(db, normalized_email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user = User(
        name=payload.name.strip(),
        email=normalized_email,
        hashed_password=hash_password(payload.password),
        role=payload.role.strip() or "Personal Finance Member",
        monthly_income_target_paise=to_paise(payload.monthly_income_target),
        is_demo=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This user account is inactive.",
        )
    return user


def update_user_profile(db: Session, user: User, payload: UserProfileUpdate) -> User:
    normalized_email = payload.email.strip().lower()
    if normalized_email != user.email:
        conflict = get_user_by_email(db, normalized_email)
        if conflict and conflict.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email is already used by another account.",
            )

    user.name = payload.name.strip()
    user.email = normalized_email
    user.role = payload.role.strip() or user.role
    user.monthly_income_target_paise = to_paise(payload.monthly_income_target)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user_preferences(
    db: Session, user: User, payload: UserPreferencesUpdate
) -> User:
    if payload.currency is not None:
        user.currency = payload.currency
    if payload.date_format is not None:
        user.date_format = payload.date_format
    if payload.theme is not None:
        user.theme = payload.theme
    if payload.compact_numbers is not None:
        user.compact_numbers = payload.compact_numbers
    if payload.show_health_score_breakdown is not None:
        user.show_health_score_breakdown = payload.show_health_score_breakdown
    if payload.budget_alerts_enabled is not None:
        user.budget_alerts_enabled = payload.budget_alerts_enabled
    if payload.goal_milestones_enabled is not None:
        user.goal_milestones_enabled = payload.goal_milestones_enabled

    db.add(user)
    db.commit()
    db.refresh(user)
    return user
