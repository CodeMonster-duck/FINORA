from __future__ import annotations

from collections.abc import Generator
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import normalize_database_url, settings
from app.database.base import Base, import_all_models


def _configure_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


def build_engine_options(database_url: str) -> tuple[str, dict[str, Any]]:
    """Return normalized DB URL and dialect-appropriate SQLAlchemy create_engine kwargs."""
    normalized_url = normalize_database_url(database_url)
    sa_url: URL = make_url(normalized_url)
    backend_name = sa_url.get_backend_name()
    connect_args: dict[str, Any] = {}

    if backend_name == "sqlite":
        connect_args["check_same_thread"] = False
        return normalized_url, {
            "connect_args": connect_args,
            "pool_pre_ping": True,
        }

    if backend_name == "postgresql":
        host = (sa_url.host or "").lower()
        if "sslmode" not in sa_url.query and host.endswith(".neon.tech"):
            connect_args["sslmode"] = "require"
        return normalized_url, {
            "connect_args": connect_args,
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "pool_size": 5,
            "max_overflow": 10,
            "pool_timeout": 30,
        }

    return normalized_url, {"pool_pre_ping": True}


def create_app_engine(database_url: str | None = None) -> Engine:
    normalized_url, engine_kwargs = build_engine_options(
        database_url or settings.database_url
    )
    is_sqlite = make_url(normalized_url).get_backend_name() == "sqlite"

    db_engine = create_engine(normalized_url, **engine_kwargs)
    if is_sqlite:
        event.listen(db_engine, "connect", _configure_sqlite_pragmas)
    return db_engine


engine = create_app_engine()
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=Session,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(target_engine: Engine | None = None) -> None:
    import_all_models()
    Base.metadata.create_all(bind=target_engine or engine)
