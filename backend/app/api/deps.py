"""FastAPI dependency wiring: app state container + auth + idempotency."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, Request

from app.api.auth import JwksProvider, build_jwks_provider, validate_supabase_jwt
from app.config import Settings, get_settings
from app.contracts.errors import ApiError, ErrorCode
from app.domains.billing import QuotaService
from app.domains.models import IdempotencyRec
from app.domains.repository import InMemoryStore, now_utc
from app.providers.base import (
    CostMeter,
    DigestiveVision,
    JobQueue,
    Reasoner,
    StorageProvider,
    VideoObserver,
)
from app.providers.mock import (
    InMemoryCostMeter,
    MockDigestiveVision,
    MockReasoner,
    MockStorageProvider,
    MockVideoObserver,
)
from app.providers.vercel_workflows import build_job_queue


@dataclass
class AppState:
    """Runtime container shared by the public API and the private worker."""

    settings: Settings
    store: InMemoryStore
    jwks_provider: JwksProvider | None
    storage: StorageProvider
    queue: JobQueue
    observer: VideoObserver
    reasoner: Reasoner
    digestive_vision: DigestiveVision
    cost_meter: CostMeter


def build_default_state(settings: Settings | None = None) -> AppState:
    """Production-shaped wiring with MOCK providers by default (sez. 4: local
    uses AI fixtures). Real adapters plug in behind the same protocols.
    Queue backend from settings (SPEC_AMENDMENT_V1.1): fake locally, Vercel
    Workflows in staging/production."""
    settings = settings or get_settings()
    store = InMemoryStore()
    return AppState(
        settings=settings,
        store=store,
        jwks_provider=build_jwks_provider(settings),
        storage=MockStorageProvider(),
        queue=build_job_queue(settings),
        observer=MockVideoObserver(settings),
        reasoner=MockReasoner(settings),
        digestive_vision=MockDigestiveVision(settings),
        cost_meter=InMemoryCostMeter(),
    )


def get_state(request: Request) -> AppState:
    return request.app.state.cbi  # type: ignore[no-any-return]


StateDep = Annotated[AppState, Depends(get_state)]


def get_quota(state: StateDep) -> QuotaService:
    return QuotaService(state.store)


QuotaDep = Annotated[QuotaService, Depends(get_quota)]


async def current_user_id(
    state: StateDep,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Bearer JWT → user_id from `sub` (sez. 24.2). Never from client input."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(ErrorCode.AUTH_REQUIRED, "Authentication is required.")
    token = authorization.split(" ", 1)[1].strip()
    return await validate_supabase_jwt(
        token, settings=state.settings, jwks_provider=state.jwks_provider
    )


UserIdDep = Annotated[str, Depends(current_user_id)]


class IdempotencyGuard:
    """X-Idempotency-Key handling (sez. 9.1/22).

    Scope = user + endpoint + key. A replayed request returns the recorded
    response; a key reused with a different payload is a conflict. Endpoints
    with a unique client_request_id in the body are idempotent at the domain
    level; the header adds a transport-level guard."""

    def __init__(self, store: InMemoryStore, scope_prefix: str, key: str | None, payload_hash: str | None) -> None:
        self._store = store
        self.key = key
        self._scope = f"{scope_prefix}:{key}" if key else None
        self._payload_hash = payload_hash

    def lookup(self) -> dict[str, Any] | None:
        if not self._scope:
            return None
        rec = self._store.idempotency.get(self._scope)
        if rec is None:
            return None
        if self._payload_hash and rec.response_body.get("__payload_hash__") not in (None, self._payload_hash):
            raise ApiError(
                ErrorCode.IDEMPOTENCY_CONFLICT,
                "Idempotency key was reused with a different payload.",
            )
        return {k: v for k, v in rec.response_body.items() if k != "__payload_hash__"}

    def record(self, body: dict[str, Any]) -> None:
        if not self._scope:
            return
        stored = dict(body)
        if self._payload_hash:
            stored["__payload_hash__"] = self._payload_hash
        self._store.idempotency[self._scope] = IdempotencyRec(
            scope=self._scope, status_code=200, response_body=stored, created_at=now_utc()
        )


async def idempotency_guard(
    request: Request,
    state: StateDep,
    user_id: UserIdDep,
    x_idempotency_key: Annotated[str | None, Header()] = None,
) -> IdempotencyGuard:
    import hashlib

    payload_hash: str | None = None
    if request.method in ("POST", "PATCH"):
        body = await request.body()
        if body:
            payload_hash = hashlib.sha256(body).hexdigest()
    return IdempotencyGuard(
        state.store,
        scope_prefix=f"{user_id}:{request.url.path}",
        key=x_idempotency_key,
        payload_hash=payload_hash,
    )


IdempotencyDep = Annotated[IdempotencyGuard, Depends(idempotency_guard)]
