"""Request-id / correlation-id propagation (FIX 1.7).

A contextvar holds the request id for the in-flight request so route
handlers, error handlers and structured logs can read it without threading
it through every call. The middleware accepts an inbound ``X-Request-ID`` or
generates one, and echoes it back on the response.
"""

from __future__ import annotations

import contextvars
import uuid

REQUEST_ID_HEADER = "X-Request-ID"

_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)


def get_request_id() -> str | None:
    """Return the request id for the current request, or None."""
    return _request_id.get()


def set_request_id(value: str | None) -> contextvars.Token[str | None]:
    return _request_id.set(value)


def reset_request_id(token: contextvars.Token[str | None]) -> None:
    _request_id.reset(token)


def new_request_id() -> str:
    return uuid.uuid4().hex
