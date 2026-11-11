from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowRateLimiter:
    """Thread-safe in-memory per-IP sliding-window rate limiter for single-instance protection.

    For multi-worker production deployments, replace or front with Redis-backed slowapi
    or reverse-proxy rate limiting (Nginx / Cloudflare / API Gateway).
    """

    def __init__(self, bucket: str, max_requests: int, window_seconds: int = 60) -> None:
        self.bucket = bucket
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _client_key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
            if ip:
                return f"{self.bucket}:{ip}"
        host = request.client.host if request.client else "unknown"
        return f"{self.bucket}:{host}"

    def __call__(self, request: Request) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        key = self._client_key(request)

        with self._lock:
            queue = self._hits[key]
            while queue and queue[0] <= cutoff:
                queue.popleft()

            if len(queue) >= self.max_requests:
                retry_after = max(1, int(self.window_seconds - (now - queue[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many authentication attempts. Please retry shortly.",
                    headers={"Retry-After": str(retry_after)},
                )

            queue.append(now)


login_rate_limiter = SlidingWindowRateLimiter(
    bucket="auth_login",
    max_requests=settings.rate_limit_login_per_min,
    window_seconds=60,
)

register_rate_limiter = SlidingWindowRateLimiter(
    bucket="auth_register",
    max_requests=settings.rate_limit_register_per_min,
    window_seconds=60,
)
