"""Compatibility entrypoint so `uvicorn main:app` and `uvicorn app.main:app` both work."""

from app.main import app, create_application

__all__ = ["app", "create_application"]
