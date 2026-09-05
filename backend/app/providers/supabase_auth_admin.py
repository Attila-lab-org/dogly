"""Supabase Auth admin adapter for account deletion."""

from __future__ import annotations

from urllib.parse import quote

import httpx

from app.config import Settings


def _service_role_headers(settings: Settings) -> dict[str, str]:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


async def delete_user(settings: Settings, user_id: str) -> None:
    """Delete a Supabase Auth user using the service role key."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for auth admin")
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{quote(user_id, safe='')}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(url, headers=_service_role_headers(settings))
    if response.status_code not in (200, 204, 404):
        response.raise_for_status()
