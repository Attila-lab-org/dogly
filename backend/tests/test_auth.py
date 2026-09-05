"""Auth tests (spec 24.2 / 8.1): Supabase JWT validation, user_id from sub only."""

import httpx
import jwt as pyjwt

from app.api.auth import validate_supabase_jwt
from app.api.deps import AppState
from app.contracts.errors import ApiError
from tests.conftest import ISSUER, make_token


async def test_valid_jwt_returns_sub(state: AppState, rsa_keys, user_token, user_id):
    got = await validate_supabase_jwt(
        user_token, settings=state.settings, jwks_provider=state.jwks_provider
    )
    assert got == user_id


async def test_expired_jwt_rejected(state: AppState, rsa_keys):
    token = make_token(rsa_keys[0], expires_in_s=-10)
    try:
        await validate_supabase_jwt(token, settings=state.settings, jwks_provider=state.jwks_provider)
        raise AssertionError("expected ApiError")
    except ApiError as exc:
        assert exc.code.value == "AUTH_REQUIRED"


async def test_wrong_issuer_rejected(state: AppState, rsa_keys):
    token = make_token(rsa_keys[0], issuer="https://evil.example.com/auth/v1")
    try:
        await validate_supabase_jwt(token, settings=state.settings, jwks_provider=state.jwks_provider)
        raise AssertionError("expected ApiError")
    except ApiError as exc:
        assert exc.code.value == "AUTH_REQUIRED"


async def test_hs256_rejected_when_secret_disabled(state: AppState):
    token = pyjwt.encode(
        {"sub": "u", "iss": ISSUER, "aud": "authenticated", "iat": 1, "exp": 9999999999},
        "some-secret",
        algorithm="HS256",
    )
    try:
        await validate_supabase_jwt(token, settings=state.settings, jwks_provider=state.jwks_provider)
        raise AssertionError("expected ApiError")
    except ApiError as exc:
        assert exc.code.value == "AUTH_REQUIRED"


async def test_protected_route_requires_bearer(client: httpx.AsyncClient):
    resp = await client.get("/v1/me")
    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == "AUTH_REQUIRED"
    assert body["retryable"] is False
    assert "correlation_id" in body


async def test_me_with_valid_token(client: httpx.AsyncClient, auth_headers, user_id):
    resp = await client.get("/v1/me", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["profile"]["user_id"] == user_id
    assert "plan" in body and "usage" in body


async def test_consents_default_off_and_append_changes(client: httpx.AsyncClient, auth_headers):
    initial = await client.get("/v1/me/consents", headers=auth_headers)
    assert initial.status_code == 200
    assert initial.json() == {
        "service_terms": False,
        "research_training": False,
        "notifications": False,
        "media_retention": False,
        "policy_versions": {},
    }

    updated = await client.patch(
        "/v1/me/consents",
        headers=auth_headers,
        json={
            "policy_version": "privacy-v1",
            "service_terms": True,
            "research_training": True,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["service_terms"] is True
    assert updated.json()["research_training"] is True
    assert updated.json()["notifications"] is False

    revoked = await client.patch(
        "/v1/me/consents",
        headers=auth_headers,
        json={"policy_version": "privacy-v1", "research_training": False},
    )
    assert revoked.status_code == 200
    assert revoked.json()["research_training"] is False


async def test_cross_user_dog_access_denied(client: httpx.AsyncClient, auth_headers, rsa_keys):
    dog_id = await _create_dog(client, auth_headers)
    other = make_token(rsa_keys[0])  # different sub
    resp = await client.get(
        f"/v1/dogs/{dog_id}/patterns", headers={"Authorization": f"Bearer {other}"}
    )
    assert resp.status_code in (403, 404)


async def _create_dog(client, headers) -> str:
    resp = await client.post("/v1/dogs", json={"name": "Rocky"}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]
