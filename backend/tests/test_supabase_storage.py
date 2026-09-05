from __future__ import annotations

import httpx
import pytest

from app.config import Settings
from app.providers.supabase_storage import SupabaseStorageProvider


@pytest.mark.asyncio
async def test_signed_upload_accepts_supabase_url_field() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert "/storage/v1/object/upload/sign/dog-avatars/users/u/dogs/d/avatar/a.jpg" in str(
            request.url
        )
        return httpx.Response(
            200,
            json={
                "url": (
                    "/object/upload/sign/dog-avatars/users/u/dogs/d/avatar/a.jpg"
                    "?token=signed-token"
                )
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = SupabaseStorageProvider(
        Settings(
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="sb_secret_test",
        ),
        client=client,
    )

    url, _ = await provider.create_signed_upload_url(
        bucket="dog-avatars",
        path="users/u/dogs/d/avatar/a.jpg",
        content_type="image/jpeg",
        ttl_seconds=600,
    )

    assert url == (
        "https://project.supabase.co/storage/v1/object/upload/sign/"
        "dog-avatars/users/u/dogs/d/avatar/a.jpg?token=signed-token"
    )
    await client.aclose()
