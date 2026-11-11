from __future__ import annotations

import os
import unittest
from contextlib import contextmanager
from unittest.mock import patch

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

from alembic.versions import __name__ as _versions_pkg  # noqa: F401
from app.core.config import get_settings, normalize_database_url
from app.database.base import Base, import_all_models
from app.database.connection import build_engine_options


@contextmanager
def _temp_environ(updates: dict[str, str | None]):
    original = os.environ.copy()
    try:
        for key, value in updates.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        os.environ.clear()
        os.environ.update(original)


class _RecordingOp:
    """Minimal Alembic `op` shim to verify migration DDL compiles for PostgreSQL."""

    def __init__(self) -> None:
        self.metadata = sa.MetaData()
        self.tables: dict[str, sa.Table] = {}
        self.indexes: list[tuple[str, str, list[str], bool]] = []
        self.dropped_indexes: list[tuple[str, str]] = []
        self.dropped_tables: list[str] = []

    def create_table(self, name: str, *columns_and_constraints: sa.SchemaItem) -> None:
        table = sa.Table(name, self.metadata, *columns_and_constraints)
        self.tables[name] = table

    def create_index(
        self, name: str, table_name: str, columns: list[str], unique: bool = False
    ) -> None:
        self.indexes.append((name, table_name, columns, unique))

    def drop_index(self, name: str, table_name: str) -> None:
        self.dropped_indexes.append((name, table_name))

    def drop_table(self, name: str) -> None:
        self.dropped_tables.append(name)


class PostgreSQLCompatibilityTestCase(unittest.TestCase):
    def test_normalize_database_url_schemes(self) -> None:
        self.assertEqual(
            normalize_database_url("postgres://u:p@ep-x.aws.neon.tech/neondb?sslmode=require"),
            "postgresql+psycopg://u:p@ep-x.aws.neon.tech/neondb?sslmode=require",
        )
        self.assertEqual(
            normalize_database_url("  postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=require  "),
            "postgresql+psycopg://u:p@ep-x.aws.neon.tech/neondb?sslmode=require",
        )
        self.assertEqual(
            normalize_database_url("postgresql+psycopg2://u:p@localhost:5432/finora"),
            "postgresql+psycopg2://u:p@localhost:5432/finora",
        )
        self.assertEqual(
            normalize_database_url("sqlite:///./finora.db"),
            "sqlite:///./finora.db",
        )

    def test_build_engine_options_for_sqlite_and_neon_postgres(self) -> None:
        sqlite_url, sqlite_opts = build_engine_options("sqlite:///./finora.db")
        self.assertEqual(sqlite_url, "sqlite:///./finora.db")
        self.assertEqual(sqlite_opts["connect_args"], {"check_same_thread": False})
        self.assertNotIn("pool_size", sqlite_opts)

        neon_no_ssl, neon_opts = build_engine_options(
            "postgres://user:pass@ep-demo-pooler.us-east-2.aws.neon.tech/neondb"
        )
        self.assertTrue(neon_no_ssl.startswith("postgresql+psycopg://"))
        self.assertEqual(neon_opts["connect_args"], {"sslmode": "require"})
        self.assertTrue(neon_opts["pool_pre_ping"])
        self.assertEqual(neon_opts["pool_recycle"], 300)
        self.assertEqual(neon_opts["pool_size"], 5)

        neon_with_ssl, neon_ssl_opts = build_engine_options(
            "postgresql://user:pass@ep-demo.us-east-2.aws.neon.tech/neondb?sslmode=require"
        )
        self.assertTrue(neon_with_ssl.startswith("postgresql+psycopg://"))
        self.assertEqual(neon_ssl_opts["connect_args"], {})

        local_pg, local_opts = build_engine_options(
            "postgresql://postgres:postgres@localhost:5432/finora"
        )
        self.assertTrue(local_pg.startswith("postgresql+psycopg://"))
        self.assertEqual(local_opts["connect_args"], {})

    def test_render_production_settings_defaults(self) -> None:
        base_prod_env = {
            "APP_ENV": "production",
            "SECRET_KEY": "x" * 48,
            "CORS_ORIGINS": "https://finora-web.onrender.com",
            "DATABASE_URL": "postgresql://user:pass@ep-demo.aws.neon.tech/neondb?sslmode=require",
            "REQUIRE_HTTPS": None,
            "AUTO_INIT_DB": None,
        }
        with _temp_environ({**base_prod_env, "RENDER": "true"}):
            render_settings = get_settings()
            self.assertTrue(render_settings.is_production)
            self.assertFalse(render_settings.require_https)
            self.assertTrue(render_settings.auto_init_db)
            self.assertTrue(render_settings.database_url.startswith("postgresql+psycopg://"))

        with _temp_environ({**base_prod_env, "RENDER": None}):
            direct_prod_settings = get_settings()
            self.assertTrue(direct_prod_settings.require_https)

        with _temp_environ({**base_prod_env, "RENDER": "true", "REQUIRE_HTTPS": "true", "AUTO_INIT_DB": "false"}):
            override_settings = get_settings()
            self.assertTrue(override_settings.require_https)
            self.assertFalse(override_settings.auto_init_db)

    def test_orm_and_alembic_0001_compile_for_postgresql_and_match_indexes(self) -> None:
        import importlib

        import_all_models()
        migration = importlib.import_module("alembic.versions.0001_initial_schema")
        recorder = _RecordingOp()
        with patch.object(migration, "op", recorder):
            migration.upgrade()
            migration.downgrade()

        orm_tables = {t.name: t for t in Base.metadata.sorted_tables}
        self.assertEqual(set(recorder.tables.keys()), set(orm_tables.keys()))

        orm_indexes = {
            idx.name
            for table in Base.metadata.sorted_tables
            for idx in table.indexes
            if idx.name is not None
        }
        mig_indexes = {name for name, _tbl, _cols, _uniq in recorder.indexes}
        self.assertEqual(mig_indexes, orm_indexes)

        pg_dialect = postgresql.dialect()
        for table in recorder.tables.values():
            ddl = str(CreateTable(table).compile(dialect=pg_dialect))
            self.assertIn("CREATE TABLE", ddl)
        for name, tbl, cols, uniq in recorder.indexes:
            sa_cols = [recorder.tables[tbl].c[c] for c in cols]
            idx = sa.Index(name, *sa_cols, unique=uniq)
            idx_ddl = str(CreateIndex(idx).compile(dialect=pg_dialect))
            self.assertIn(name, idx_ddl)


if __name__ == "__main__":
    unittest.main()
