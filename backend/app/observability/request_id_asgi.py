"""Pure ASGI middleware for X-Request-ID propagation (FIX 1.7).

Uses a raw ASGI wrapper instead of Starlette's ``BaseHTTPMiddleware`` to avoid
the task-group semantics that can force background ``asyncio.create_task``
dispatchers (local in-process queue) to complete before the response returns,
which would break tests that assert pre-completion state.
"""

from __future__ import annotations

from app.observability.request_context import (
    REQUEST_ID_HEADER,
    new_request_id,
    reset_request_id,
    set_request_id,
)

# ASGI scope header key (lowercased bytes, as stored in the raw scope).
_HEADER_KEY = REQUEST_ID_HEADER.lower().encode("latin-1")


def _read_request_id(scope: dict) -> str:
    for name, value in scope.get("headers", []):
        if name == _HEADER_KEY:
            decoded = value.decode("latin-1").strip()
            if decoded:
                return decoded
    return new_request_id()


class RequestIdMiddleware:
    """ASGI middleware: set/propagate X-Request-ID via contextvar."""

    def __init__(self, app):  # type: ignore[no-untyped-def]
        self.app = app

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        rid = _read_request_id(scope)
        token = set_request_id(rid)

        async def send_wrapper(message):  # type: ignore[no-untyped-def]
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers") or [])
                headers.append(
                    (REQUEST_ID_HEADER.encode("latin-1"), rid.encode("latin-1"))
                )
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            reset_request_id(token)


__all__ = ["RequestIdMiddleware"]
