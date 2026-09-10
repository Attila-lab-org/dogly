from __future__ import annotations

import json

import httpx
import pytest

from app.config import Settings
from app.contracts.errors import ApiError, ErrorCode
from app.providers.supabase_storage import SupabaseStorageProvider


@pytest.mark.asyncio
async def test_signed_upload_accepts_supabase_url_field() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert json.loads(request.content) == {}
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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("info", "expected"),
    [
        ({"size": 1234}, True),
        ({"size": 999}, False),
        ({"metadata": {}}, False),
    ],
)
async def test_object_exists_validates_expected_size(
    info: dict[str, object], expected: bool
) -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=info)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = SupabaseStorageProvider(
        Settings(
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="sb_secret_test",
        ),
        client=client,
    )

    exists = await provider.object_exists(
        bucket="dog-avatars",
        path="users/u/dogs/d/avatar/a.jpg",
        expected_bytes=1234,
    )

    assert exists is expected
    await client.aclose()


@pytest.mark.asyncio
async def test_signed_upload_maps_storage_http_error() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            text='{"statusCode":"400","error":"Invalid","message":"mime type not supported"}',
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = SupabaseStorageProvider(
        Settings(
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="sb_secret_test",
        ),
        client=client,
    )

    with pytest.raises(ApiError) as excinfo:
        await provider.create_signed_upload_url(
            bucket="behavior-raw",
            path="users/u/dogs/d/behavior/e/clip.webm",
            content_type="video/webm",
            ttl_seconds=600,
        )

    assert excinfo.value.code == ErrorCode.PROCESSING_FAILED
    assert excinfo.value.retryable is True
    await client.aclose()
