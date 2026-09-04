"""Supabase JWT validation (Spec V1 sez. 24.2 / 8.1).

FastAPI validates signature (JWKS or legacy HS256 secret), issuer, expiry and
required claims; user_id is derived EXCLUSIVELY from the token subject (sub).
No endpoint accepts user_id from the client as authority (sez. 9.1).
"""

from __future__ import annotations

import time
from typing import Any, Protocol

import httpx
import jwt

from app.config import Settings
from app.contracts.errors import ApiError, ErrorCode


class JwksProvider(Protocol):
    """Replaceable JWKS source (static in tests, HTTP+cache in production)."""

    async def get_signing_key(self, kid: str | None) -> Any: ...


class StaticJwksProvider:
    def __init__(self, jwks: dict[str, Any]) -> None:
        self._jwks = jwt.PyJWKSet.from_dict(jwks)

    async def get_signing_key(self, kid: str | None) -> Any:
        for key in self._jwks.keys:
            if kid is None or key.key_id == kid:
                return key.key
        raise ApiError(ErrorCode.AUTH_REQUIRED, "Unknown signing key.")


class HttpJwksProvider:
    """Fetches Supabase JWKS with short caching (sez. 24.2)."""

    def __init__(self, jwks_url: str, *, ttl_seconds: int = 300) -> None:
        self._url = jwks_url
        self._ttl = ttl_seconds
        self._cached: jwt.PyJWKSet | None = None
        self._fetched_at = 0.0

    async def _fetch(self) -> jwt.PyJWKSet:
        now = time.monotonic()
        if self._cached is not None and now - self._fetched_at < self._ttl:
            return self._cached
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(self._url)
            resp.raise_for_status()
        self._cached = jwt.PyJWKSet.from_dict(resp.json())
        self._fetched_at = now
        return self._cached

    async def get_signing_key(self, kid: str | None) -> Any:
        keys = await self._fetch()
        for key in keys.keys:
            if kid is None or key.key_id == kid:
                return key.key
        # Kid rotation: refresh once before failing.
        self._fetched_at = 0.0
        keys = await self._fetch()
        for key in keys.keys:
            if kid is None or key.key_id == kid:
                return key.key
        raise ApiError(ErrorCode.AUTH_REQUIRED, "Unknown signing key.")


def build_jwks_provider(settings: Settings) -> JwksProvider | None:
    if settings.supabase_jwks_url:
        return HttpJwksProvider(settings.supabase_jwks_url)
    return None


async def validate_supabase_jwt(
    token: str, *, settings: Settings, jwks_provider: JwksProvider | None
) -> str:
    """Validate a Supabase access token and return user_id from `sub`."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.DecodeError as exc:
        raise ApiError(ErrorCode.AUTH_REQUIRED, "Malformed bearer token.") from exc

    alg = header.get("alg", "")
    try:
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise ApiError(ErrorCode.AUTH_REQUIRED, "HS256 tokens are not accepted by this deployment.")
            key: Any = settings.supabase_jwt_secret
        else:
            if jwks_provider is None:
                raise ApiError(ErrorCode.AUTH_REQUIRED, "Asymmetric JWT verification is not configured.")
            key = await jwks_provider.get_signing_key(header.get("kid"))
        claims = jwt.decode(
            token,
            key=key,
            algorithms=[alg],
            issuer=settings.supabase_jwt_issuer,
            audience=settings.supabase_jwt_audience or None,
            options={"require": ["sub", "exp", "iat", "iss"]},
        )
    except ApiError:
        raise
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(ErrorCode.AUTH_REQUIRED, "Session expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise ApiError(ErrorCode.AUTH_REQUIRED, "Invalid authentication token.") from exc

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise ApiError(ErrorCode.AUTH_REQUIRED, "Token is missing the subject claim.")
    return sub
