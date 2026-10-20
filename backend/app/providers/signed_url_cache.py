"""In-process reuse of Supabase signed READ urls.

Every mint returns a unique query string. Returning a fresh URL on every
GET /dogs or diary page forces browser/native image caches to miss and
re-download the same object (large egress). Cache by (bucket, path) until
near expiry so repeated API responses keep the same URL string.

Skew uses remaining lifetime (not the caller's requested TTL) so a short
worker mint does not prevent a later UI get(3600) from reusing the entry,
and put never replaces a longer-lived URL with a shorter remint.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

# Refresh before clients start getting 403 on expired signatures.
_SKEW_SECONDS = 120.0


@dataclass(frozen=True, slots=True)
class _Entry:
    url: str
    expires_at: float


class SignedUrlCache:
    def __init__(self, *, max_entries: int = 2048) -> None:
        self._max = max_entries
        self._entries: dict[tuple[str, str], _Entry] = {}

    def get(self, *, bucket: str, path: str, ttl_seconds: int = 0) -> str | None:
        del ttl_seconds  # Expiry is based on stored lifetime, not caller TTL.
        key = (bucket, path)
        hit = self._entries.get(key)
        if hit is None:
            return None
        if time.time() + _SKEW_SECONDS >= hit.expires_at:
            self._entries.pop(key, None)
            return None
        return hit.url

    def put(self, *, bucket: str, path: str, url: str, ttl_seconds: int) -> str:
        """Store url, or keep an existing longer-lived entry. Returns URL to use."""
        key = (bucket, path)
        new_expires = time.time() + max(1, ttl_seconds)
        existing = self._entries.get(key)
        if existing is not None and existing.expires_at >= new_expires:
            if time.time() + _SKEW_SECONDS < existing.expires_at:
                return existing.url
        if len(self._entries) >= self._max and key not in self._entries:
            # Drop oldest ~10% by expiry.
            ordered = sorted(self._entries.items(), key=lambda item: item[1].expires_at)
            for drop_key, _ in ordered[: max(1, self._max // 10)]:
                self._entries.pop(drop_key, None)
        self._entries[key] = _Entry(url=url, expires_at=new_expires)
        return url

    def invalidate(self, *, bucket: str, path: str) -> None:
        self._entries.pop((bucket, path), None)

    def clear(self) -> None:
        self._entries.clear()
