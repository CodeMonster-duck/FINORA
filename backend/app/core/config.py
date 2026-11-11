from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

_DEV_ENVIRONMENTS = {"development", "dev", "test", "local"}
_INSECURE_SECRET_MARKERS = {
    "",
    "secret",
    "changeme",
    "change-this-to-a-long-random-secret-key-in-production",
    "replace-with-a-64-char-random-secret",
    "finora-dev-secret-key-change-before-production-deployment",
}


def _load_dotenv_file(env_path: Path) -> None:
    """Lightweight .env loader avoiding external python-dotenv dependency."""
    if not env_path.is_file():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        pass


_load_dotenv_file(BASE_DIR / ".env")


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def normalize_database_url(raw_url: str) -> str:
    """Normalize SQLAlchemy DATABASE_URL for local SQLite and Neon/Render PostgreSQL."""
    url = raw_url.strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def _parse_origins(raw: str | None, *, is_production: bool) -> list[str]:
    if not raw or not raw.strip():
        if is_production:
            raise RuntimeError(
                "CORS_ORIGINS must be explicitly configured with HTTPS origin(s) in production."
            )
        return ["http://localhost:5173", "http://127.0.0.1:5173"]

    origins = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
    if is_production:
        if not origins or "*" in origins:
            raise RuntimeError(
                "Wildcard or empty CORS_ORIGINS is forbidden in production."
            )
        for origin in origins:
            if not origin.startswith("https://"):
                raise RuntimeError(
                    f"Production CORS origin must use HTTPS: '{origin}'"
                )
    return origins


def _resolve_secret_key(*, is_production: bool) -> str:
    raw_secret = os.getenv("SECRET_KEY", "").strip()
    is_placeholder = raw_secret.lower() in _INSECURE_SECRET_MARKERS

    if is_production:
        if not raw_secret or is_placeholder or len(raw_secret) < 32:
            raise RuntimeError(
                "SECRET_KEY environment variable must be set to a cryptographically strong "
                "secret (>= 32 characters) in production."
            )
        return raw_secret

    if raw_secret and not is_placeholder:
        return raw_secret

    # Development-only ephemeral cryptographic secret avoids hardcoding static keys in source.
    return secrets.token_urlsafe(48)


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    is_development: bool
    is_production: bool
    api_v1_prefix: str
    database_url: str
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    cors_origins: list[str]
    auto_seed_demo: bool
    enable_demo_login: bool
    require_https: bool
    auto_init_db: bool
    rate_limit_login_per_min: int
    rate_limit_register_per_min: int


def get_settings() -> Settings:
    app_env = os.getenv("APP_ENV", "development").strip().lower() or "development"
    is_dev = app_env in _DEV_ENVIRONMENTS
    is_prod = not is_dev
    is_render = _parse_bool(os.getenv("RENDER"), False)

    default_sqlite = f"sqlite:///{(BASE_DIR / 'finora.db').as_posix()}"
    raw_database_url = os.getenv("DATABASE_URL", default_sqlite)
    auto_seed = _parse_bool(os.getenv("AUTO_SEED_DEMO"), False)
    enable_demo = _parse_bool(os.getenv("ENABLE_DEMO_LOGIN"), False)

    if is_prod:
        auto_seed = False
        enable_demo = False

    return Settings(
        app_name=os.getenv("APP_NAME", "FINORA API"),
        app_env=app_env,
        is_development=is_dev,
        is_production=is_prod,
        api_v1_prefix=os.getenv("API_V1_PREFIX", "/api/v1"),
        database_url=normalize_database_url(raw_database_url),
        secret_key=_resolve_secret_key(is_production=is_prod),
        algorithm=os.getenv("ALGORITHM", "HS256"),
        access_token_expire_minutes=int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
        ),
        cors_origins=_parse_origins(os.getenv("CORS_ORIGINS"), is_production=is_prod),
        auto_seed_demo=auto_seed,
        enable_demo_login=enable_demo,
        require_https=_parse_bool(os.getenv("REQUIRE_HTTPS"), is_prod and not is_render),
        auto_init_db=_parse_bool(os.getenv("AUTO_INIT_DB"), True),
        rate_limit_login_per_min=max(
            1, int(os.getenv("RATE_LIMIT_LOGIN_PER_MIN", "15"))
        ),
        rate_limit_register_per_min=max(
            1, int(os.getenv("RATE_LIMIT_REGISTER_PER_MIN", "10"))
        ),
    )


settings = get_settings()
