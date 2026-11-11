from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.models.budget import Budget
    from app.models.notification import Notification
    from app.models.savings import SavingsGoal
    from app.models.transaction import Transaction


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(120), default="Personal Finance Member", nullable=False
    )
    monthly_income_target_paise: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False
    )

    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    date_format: Mapped[str] = mapped_column(
        String(20), default="DD MMM YYYY", nullable=False
    )
    theme: Mapped[str] = mapped_column(String(16), default="dark", nullable=False)
    compact_numbers: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    show_health_score_breakdown: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    budget_alerts_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    goal_milestones_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False
    )

    transactions: Mapped[list[Transaction]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    budgets: Mapped[list[Budget]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    savings_goals: Mapped[list[SavingsGoal]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    notifications: Mapped[list[Notification]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
