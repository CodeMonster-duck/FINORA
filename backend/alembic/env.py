from __future__ import annotations

from logging.config import fileConfig

from sqlalchemy import create_engine, event, pool
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.database.base import Base, import_all_models
from app.database.connection import _configure_sqlite_pragmas, build_engine_options

try:
    from alembic import context
except ImportError:  # pragma: no cover - optional runtime package
    context = None  # type: ignore[assignment]

import_all_models()
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    assert context is not None
    db_url, _ = build_engine_options(settings.database_url)
    is_sqlite = make_url(db_url).get_backend_name() == "sqlite"
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=is_sqlite,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    assert context is not None
    config = context.config
    if config.config_file_name is not None:
        fileConfig(config.config_file_name)

    db_url, engine_kwargs = build_engine_options(settings.database_url)
    is_sqlite = make_url(db_url).get_backend_name() == "sqlite"

    connectable = create_engine(
        db_url,
        connect_args=engine_kwargs.get("connect_args", {}),
        poolclass=pool.NullPool,
    )
    if is_sqlite:
        event.listen(connectable, "connect", _configure_sqlite_pragmas)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context is not None:
    if context.is_offline_mode():
        run_migrations_offline()
    else:
        run_migrations_online()
