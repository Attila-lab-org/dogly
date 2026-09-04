"""Shared test fixtures: RSA-signed Supabase JWTs via a static JWKS provider,
app state with mock providers, ASGI test client."""

from __future__ import annotations

import time
import uuid

import httpx
import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.api.app import create_app
from app.api.auth import StaticJwksProvider
from app.api.deps import AppState, build_default_state
from app.config import Settings
from app.worker.main import create_worker_app

ISSUER = "https://test-project.supabase.co/auth/v1"
AUDIENCE = "authenticated"


@pytest.fixture(scope="session")
def rsa_keys() -> tuple[str, dict]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    jwk = pyjwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    jwk["kid"] = "test-kid"
    jwk["alg"] = "RS256"
    jwk["use"] = "sig"
    return private_pem, {"keys": [jwk]}


@pytest.fixture()
def settings() -> Settings:
    return Settings(
        app_env="local",
        supabase_jwt_issuer=ISSUER,
        supabase_jwt_audience=AUDIENCE,
        supabase_jwt_secret="",
        job_queue_backend="fake",
        worker_internal_token="test-internal-token",
    )


@pytest.fixture()
def state(settings: Settings, rsa_keys: tuple[str, dict]) -> AppState:
    st = build_default_state(settings)
    st.jwks_provider = StaticJwksProvider(rsa_keys[1])
    return st


def make_token(
    private_pem: str,
    *,
    sub: str | None = None,
    issuer: str = ISSUER,
    audience: str = AUDIENCE,
    expires_in_s: int = 3600,
) -> str:
    now = int(time.time())
    claims = {
        "sub": sub or str(uuid.uuid4()),
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + expires_in_s,
        "role": "authenticated",
    }
    return pyjwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": "test-kid"})


@pytest.fixture()
def user_token(rsa_keys: tuple[str, dict]) -> str:
    return make_token(rsa_keys[0])


@pytest.fixture()
def auth_headers(user_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture()
def user_id(user_token: str) -> str:
    return pyjwt.decode(user_token, options={"verify_signature": False})["sub"]


@pytest.fixture()
async def client(state: AppState):
    app = create_app(state)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture()
async def worker_client(state: AppState):
    app = create_worker_app(state)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://worker") as c:
        yield c


async def create_dog(client: httpx.AsyncClient, headers: dict[str, str], name: str = "Rocky") -> str:
    resp = await client.post("/v1/dogs", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]
