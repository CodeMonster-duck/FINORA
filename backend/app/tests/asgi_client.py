from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode


@dataclass
class ASGIResponse:
    status_code: int
    headers: dict[str, str]
    content: bytes

    @property
    def text(self) -> str:
        return self.content.decode("utf-8")

    def json(self) -> Any:
        return json.loads(self.text)


class SimpleASGIClient:
    """Dependency-free ASGI test client for FastAPI using Python stdlib asyncio."""

    def __init__(self, app: Any) -> None:
        self.app = app

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any | None = None,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ASGIResponse:
        return asyncio.run(
            self._async_request(
                method, path, json_body=json_body, headers=headers, params=params
            )
        )

    def get(self, path: str, **kwargs: Any) -> ASGIResponse:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> ASGIResponse:
        return self.request("POST", path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> ASGIResponse:
        return self.request("PUT", path, **kwargs)

    def patch(self, path: str, **kwargs: Any) -> ASGIResponse:
        return self.request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> ASGIResponse:
        return self.request("DELETE", path, **kwargs)

    async def _async_request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any | None = None,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ASGIResponse:
        body_bytes = b""
        raw_headers: list[tuple[bytes, bytes]] = [(b"host", b"testserver")]

        if headers:
            for k, v in headers.items():
                raw_headers.append((k.lower().encode("latin-1"), v.encode("latin-1")))

        if json_body is not None:
            body_bytes = json.dumps(json_body).encode("utf-8")
            raw_headers.append((b"content-type", b"application/json"))
            raw_headers.append((b"content-length", str(len(body_bytes)).encode("latin-1")))

        query_bytes = b""
        if params:
            cleaned = {k: v for k, v in params.items() if v is not None}
            query_bytes = urlencode(cleaned).encode("latin-1")

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method.upper(),
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("latin-1"),
            "query_string": query_bytes,
            "headers": raw_headers,
            "client": ("127.0.0.1", 50000),
            "server": ("testserver", 80),
        }

        sent = False
        status_code = 500
        resp_headers: dict[str, str] = {}
        chunks: list[bytes] = []
        disconnect_event = asyncio.Event()

        async def receive() -> dict[str, Any]:
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            await disconnect_event.wait()
            return {"type": "http.disconnect"}

        async def send(message: dict[str, Any]) -> None:
            nonlocal status_code, resp_headers
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                resp_headers = {
                    k.decode("latin-1").lower(): v.decode("latin-1")
                    for k, v in message.get("headers", [])
                }
            elif message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))
                if not message.get("more_body", False):
                    disconnect_event.set()

        await self.app(scope, receive, send)
        return ASGIResponse(
            status_code=status_code,
            headers=resp_headers,
            content=b"".join(chunks),
        )
