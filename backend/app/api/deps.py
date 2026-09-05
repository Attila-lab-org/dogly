"""FastAPI dependency wiring: app state container + auth + idempotency."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncEngine

from app.api.auth import JwksProvider, build_jwks_provider, validate_supabase_jwt
from app.config import Settings, get_settings
from app.contracts.errors import ApiError, ErrorCode
from app.domains.billing import QuotaService
from app.domains.db import get_engine
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
from app.providers.factory import (
    build_cost_meter,
    build_digestive_vision,
    build_observer,
    build_queue,
    build_reasoner,
    build_storage,
)


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
    engine: AsyncEngine | None = None


def build_default_state(settings: Settings | None = None) -> AppState:
    """Wire adapters from Settings. Local/CI keep mocks; staging/production
    fail-fast rejects mock providers (config validator)."""
    settings = settings or get_settings()
    store = InMemoryStore()
    engine = get_engine(settings)
    return AppState(
        settings=settings,
        store=store,
        jwks_provider=build_jwks_provider(settings),
        storage=build_storage(settings),
        queue=build_queue(settings),
        observer=build_observer(settings),
        reasoner=build_reasoner(settings),
        digestive_vision=build_digestive_vision(settings),
        cost_meter=build_cost_meter(settings),
        engine=engine,
    )


def get_state(request: Request) -> AppState:
    return request.app.state.cbi  # type: ignore[no-any-return]


StateDep = Annotated[AppState, Depends(get_state)]


def get_quota(state: StateDep) -> QuotaService:
    return QuotaService(state.store, engine=state.engine)


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
    """X-Idempotency-Key handling (sez. 9.1/22)."""

    def __init__(
        self,
        store: InMemoryStore,
        scope_prefix: str,
        key: str | None,
        payload_hash: str | None,
        engine: AsyncEngine | None = None,
    ) -> None:
        self._store = store
        self._engine = engine
        self.key = key
        self._scope = f"{scope_prefix}:{key}" if key else None
        self._payload_hash = payload_hash

    def lookup(self) -> dict[str, Any] | None:
        if not self._scope:
            return None
        # Sync lookup uses memory; async DB lookup is hydrated by routes if needed.
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
    guard = IdempotencyGuard(
        state.store,
        scope_prefix=f"{user_id}:{request.url.path}",
        key=x_idempotency_key,
        payload_hash=payload_hash,
        engine=state.engine,
    )
    if state.engine is not None and guard._scope:
        from app.domains import idempotency_db

        cached = await idempotency_db.lookup(
            state.engine, scope=guard._scope, payload_hash=payload_hash
        )
        if cached is not None:
            # Seed memory so sync lookup() works for this request.
            state.store.idempotency[guard._scope] = IdempotencyRec(
                scope=guard._scope, status_code=200, response_body=cached, created_at=now_utc()
            )
    return guard


IdempotencyDep = Annotated[IdempotencyGuard, Depends(idempotency_guard)]
