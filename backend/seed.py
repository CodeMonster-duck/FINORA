"""CLI database seed script for FINORA demo workspace data."""

from __future__ import annotations

from app.database.connection import SessionLocal, init_db
from app.services.seed_service import DEMO_USER_EMAIL, seed_demo_database


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        user = seed_demo_database(db, force_if_empty_only=True)
        print(f"FINORA seed complete for user: {user.name} ({DEMO_USER_EMAIL})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
