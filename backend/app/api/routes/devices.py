"""Devices route (sez. 9): register/update Expo push token (no raw hardware
fingerprinting, sez. 10.1)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import PushTokenRequest, PushTokenResponse
from app.domains import devices_db, idempotency_db
from app.domains.models import DeviceInstallationRec
from app.domains.repository import new_id, now_utc

router = APIRouter()


async def _record_guard(state: StateDep, guard: IdempotencyDep, body: dict) -> None:
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )


@router.post("/devices/push-token", response_model=PushTokenResponse)
async def register_push_token(
    payload: PushTokenRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> PushTokenResponse:
    if cached := guard.lookup():
        return PushTokenResponse.model_validate(cached)
    if state.engine is not None:
        await devices_db.upsert_push_token(
            state.engine,
            user_id,
            payload.platform,
            payload.push_token,
            payload.app_version,
        )
        resp = PushTokenResponse()
        await _record_guard(state, guard, resp.model_dump(mode="json"))
        return resp

    store = state.store
    # Upsert per (user, token).
    for device in store.devices.values():
        if device.user_id == user_id and device.push_token == payload.push_token:
            device.platform = payload.platform
            device.app_version = payload.app_version
            device.last_seen = now_utc()
            resp = PushTokenResponse()
            await _record_guard(state, guard, resp.model_dump(mode="json"))
            return resp
    store.devices[new_id()] = DeviceInstallationRec(
        id=new_id(),
        user_id=user_id,
        platform=payload.platform,
        push_token=payload.push_token,
        app_version=payload.app_version,
        last_seen=now_utc(),
    )
    resp = PushTokenResponse()
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp
