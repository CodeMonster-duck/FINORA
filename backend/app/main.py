from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

from app.api.routes import (
    ai,
    analytics,
    auth,
    budgets,
    notifications,
    savings,
    transactions,
)
from app.core.config import settings
from app.database.connection import SessionLocal, init_db
from app.services.seed_service import seed_demo_database


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if settings.auto_init_db:
        init_db()
    if settings.auto_seed_demo and settings.is_development:
        db = SessionLocal()
        try:
            seed_demo_database(db, force_if_empty_only=True)
        finally:
            db.close()
    yield


def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        description=(
            "FINORA — Smart Personal Finance & Expense Management Platform API. "
            "Supports multi-user JWT auth, transactions, budgets, savings goals, "
            "analytics, financial health scoring, and CSV statement exports."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    if settings.require_https:
        application.add_middleware(HTTPSRedirectMiddleware)

    @application.middleware("http")
    async def add_security_headers(request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        if settings.is_production or settings.require_https:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

    prefix = settings.api_v1_prefix
    application.include_router(auth.router, prefix=prefix)
    application.include_router(transactions.router, prefix=prefix)
    application.include_router(budgets.router, prefix=prefix)
    application.include_router(savings.router, prefix=prefix)
    application.include_router(analytics.router, prefix=prefix)
    application.include_router(notifications.router, prefix=prefix)
    application.include_router(ai.router, prefix=prefix)

    @application.get("/", tags=["Health"])
    def root() -> dict[str, str]:
        return {
            "service": settings.app_name,
            "status": "ok",
            "docs": "/docs",
            "api_prefix": prefix,
        }

    @application.get("/health", tags=["Health"])
    def health() -> dict[str, str]:
        return {"status": "healthy"}

    return application


app = create_application()
