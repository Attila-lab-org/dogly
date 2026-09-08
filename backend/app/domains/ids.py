"""UUID path params must never reach Postgres as invalid scalars."""

from __future__ import annotations

from uuid import UUID

from app.contracts.errors import ApiError, ErrorCode


def require_uuid(value: str, *, not_found: str = "Resource not found") -> str:
    try:
        UUID(value)
    except (TypeError, ValueError):
        raise ApiError(ErrorCode.NOT_FOUND, not_found) from None
    return value
