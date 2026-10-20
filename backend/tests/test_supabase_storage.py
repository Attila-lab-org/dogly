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


@pytest.mark.asyncio
async def test_delete_object_uses_idempotent_remove_endpoint() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "DELETE"
        assert request.url.path == "/storage/v1/object/behavior-raw"
        assert json.loads(request.content) == {
            "prefixes": ["users/u/dogs/d/behavior/e/clip.webm"]
        }
        assert request.headers["content-type"] == "application/json"
        return httpx.Response(200, json=[])

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = SupabaseStorageProvider(
        Settings(
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="sb_secret_test",
        ),
        client=client,
    )

    await provider.delete_object(
        bucket="behavior-raw",
        path="users/u/dogs/d/behavior/e/clip.webm",
    )
    await client.aclose()


@pytest.mark.asyncio
async def test_delete_missing_object_is_successful() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = SupabaseStorageProvider(
        Settings(
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="sb_secret_test",
        ),
        client=client,
    )

    await provider.delete_object(bucket="digestive-raw", path="missing/photo.jpg")
    await client.aclose()


@pytest.mark.asyncio
async def test_delete_object_does_not_hide_missing_bucket() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="bucket not found")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = SupabaseStorageProvider(
        Settings(
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="sb_secret_test",
        ),
        client=client,
    )

    with pytest.raises(httpx.HTTPStatusError):
        await provider.delete_object(
            bucket="missing-bucket",
            path="users/u/photo.jpg",
        )
    await client.aclose()


@pytest.mark.asyncio
async def test_signed_read_maps_transient_storage_error_to_timeout() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="temporarily unavailable")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = SupabaseStorageProvider(
        Settings(
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="sb_secret_test",
        ),
        client=client,
    )

    with pytest.raises(TimeoutError):
        await provider.create_signed_read_url(
            bucket="digestive-raw",
            path="users/u/photo.jpg",
            ttl_seconds=60,
        )
    await client.aclose()


@pytest.mark.asyncio
async def test_signed_read_reuses_cached_url_for_same_object() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.method == "POST"
        return httpx.Response(
            200,
            json={
                "signedURL": (
                    "/object/sign/dog-avatars/users/u/dogs/d/avatar/a.jpg"
                    f"?token=stable-{calls}"
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
    first = await provider.create_signed_read_url(
        bucket="dog-avatars",
        path="users/u/dogs/d/avatar/a.jpg",
        ttl_seconds=3600,
    )
    second = await provider.create_signed_read_url(
        bucket="dog-avatars",
        path="users/u/dogs/d/avatar/a.jpg",
        ttl_seconds=3600,
    )
    assert first == second
    assert calls == 1
    assert "token=stable-1" in first
    await client.aclose()


@pytest.mark.asyncio
async def test_signed_read_reuses_short_mint_for_longer_caller_ttl() -> None:
    """Worker mint(600) must not thrash when diary later asks for 3600."""
    calls = 0

    async def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            json={
                "signedURL": (
                    "/object/sign/behavior-raw/users/u/v.mp4"
                    f"?token=short-{calls}"
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
    first = await provider.create_signed_read_url(
        bucket="behavior-raw",
        path="users/u/v.mp4",
        ttl_seconds=600,
    )
    second = await provider.create_signed_read_url(
        bucket="behavior-raw",
        path="users/u/v.mp4",
        ttl_seconds=3600,
    )
    assert first == second
    assert calls == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_signed_read_keeps_longer_url_when_shorter_remint_arrives() -> None:
    calls = 0

    async def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            json={
                "signedURL": (
                    "/object/sign/dog-avatars/users/u/a.jpg"
                    f"?token=wave-{calls}"
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
    long_url = await provider.create_signed_read_url(
        bucket="dog-avatars",
        path="users/u/a.jpg",
        ttl_seconds=3600,
    )
    # Bypass get() by clearing lifetime artificially: mint short via put path
    # after forcing a remint (invalidate then short TTL).
    provider._read_cache.invalidate(bucket="dog-avatars", path="users/u/a.jpg")
    short_url = await provider.create_signed_read_url(
        bucket="dog-avatars",
        path="users/u/a.jpg",
        ttl_seconds=600,
    )
    assert short_url != long_url
    # Re-seed long entry then ensure a short remint does not replace it.
    provider._read_cache.put(
        bucket="dog-avatars",
        path="users/u/a.jpg",
        url=long_url,
        ttl_seconds=3600,
    )
    kept = provider._read_cache.put(
        bucket="dog-avatars",
        path="users/u/a.jpg",
        url=short_url,
        ttl_seconds=600,
    )
    assert kept == long_url
    await client.aclose()
