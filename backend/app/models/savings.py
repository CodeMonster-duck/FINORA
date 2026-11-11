from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

if TYPE_CHECKING:
    from app.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SavingsGoal(Base):
    __tablename__ = "savings_goals"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(32), default="Emergency", nullable=False)
    target_amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_amount_paise: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    target_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    priority: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="savings_goals")
    contributions: Mapped[list[SavingsContribution]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="SavingsContribution.date.desc(), SavingsContribution.id.desc()",
    )


class SavingsContribution(Base):
    __tablename__ = "savings_contributions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    goal_id: Mapped[int] = mapped_column(
        ForeignKey("savings_goals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, nullable=False
    )

    goal: Mapped[SavingsGoal] = relationship(back_populates="contributions")
