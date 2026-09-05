"""Cursor pagination (Spec V1 sez. 9.1: no offset pagination).

Cursor = base64url("<iso8601 created_at>|<id>"); stable under concurrent
writes. Items must be pre-sorted by (created_at, id) ascending.
"""

from __future__ import annotations

import base64
from datetime import datetime
from typing import Protocol

from app.contracts.errors import ApiError, ErrorCode


class CursorItem(Protocol):
    created_at: datetime
    id: str


def encode_cursor(item: CursorItem) -> str:
    raw = f"{item.created_at.isoformat()}|{item.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        ts, item_id = raw.rsplit("|", 1)
        return datetime.fromisoformat(ts), item_id
    except Exception as exc:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Invalid cursor") from exc


def paginate[T: CursorItem](items: list[T], *, cursor: str | None, limit: int) -> tuple[list[T], str | None]:
    ordered = sorted(items, key=lambda i: (i.created_at, i.id))
    if cursor:
        ts, last_id = decode_cursor(cursor)
        ordered = [i for i in ordered if (i.created_at, i.id) > (ts, last_id)]
    page = ordered[:limit]
    next_cursor = encode_cursor(page[-1]) if len(ordered) > limit and page else None
    return page, next_cursor


def paginate_desc[T: CursorItem](
    items: list[T], *, cursor: str | None, limit: int
) -> tuple[list[T], str | None]:
    """Newest-first cursor page; a cursor continues toward older items."""

    ordered = sorted(items, key=lambda i: (i.created_at, i.id), reverse=True)
    if cursor:
        ts, last_id = decode_cursor(cursor)
        ordered = [i for i in ordered if (i.created_at, i.id) < (ts, last_id)]
    page = ordered[:limit]
    next_cursor = encode_cursor(page[-1]) if len(ordered) > limit and page else None
    return page, next_cursor
