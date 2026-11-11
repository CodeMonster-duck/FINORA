from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared SQLAlchemy declarative base for all FINORA ORM models."""


def import_all_models() -> None:
    """Import ORM modules so Base.metadata registers every table (used by init_db & Alembic)."""
    from app.models import (  # noqa: F401
        budget,
        notification,
        savings,
        transaction,
        user,
    )
