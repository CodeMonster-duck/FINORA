from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import login_rate_limiter, register_rate_limiter
from app.core.security import create_access_token
from app.database.connection import get_db
from app.models.user import User
from app.schemas.user import (
    TokenResponse,
    UserLogin,
    UserOut,
    UserPreferencesUpdate,
    UserProfileUpdate,
    UserRegister,
)
from app.services.auth_service import (
    authenticate_user,
    register_user,
    serialize_user,
    update_user_preferences,
    update_user_profile,
)
from app.services.seed_service import seed_demo_database

router = APIRouter(prefix="/auth", tags=["Authentication & Profile"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_rate_limiter)],
)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> TokenResponse:
    user = register_user(db, payload)
    token = create_access_token(user.id, extra_claims={"email": user.email})
    return TokenResponse(access_token=token, user=serialize_user(user))


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(login_rate_limiter)],
)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate_user(db, payload.email, payload.password)
    token = create_access_token(user.id, extra_claims={"email": user.email})
    return TokenResponse(access_token=token, user=serialize_user(user))


@router.post(
    "/demo-login",
    response_model=TokenResponse,
    dependencies=[Depends(login_rate_limiter)],
)
def demo_login(db: Session = Depends(get_db)) -> TokenResponse:
    """Development-only demo login; disabled by default and blocked in production."""
    if settings.is_production or not settings.enable_demo_login:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo login is disabled.",
        )
    user = seed_demo_database(db, force_if_empty_only=True)
    token = create_access_token(
        user.id,
        extra_claims={"email": user.email, "demo": True},
    )
    return TokenResponse(access_token=token, user=serialize_user(user))


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return serialize_user(current_user)


@router.patch("/me", response_model=UserOut)
def patch_me(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    updated = update_user_profile(db, current_user, payload)
    return serialize_user(updated)


@router.patch("/me/preferences", response_model=UserOut)
def patch_preferences(
    payload: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    updated = update_user_preferences(db, current_user, payload)
    return serialize_user(updated)
