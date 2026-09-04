"""Devices route (sez. 9): register/update Expo push token (no raw hardware
fingerprinting, sez. 10.1)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import PushTokenRequest, PushTokenResponse
from app.domains.models import DeviceInstallationRec
from app.domains.repository import new_id, now_utc

router = APIRouter()


@router.post("/devices/push-token", response_model=PushTokenResponse)
async def register_push_token(
    payload: PushTokenRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> PushTokenResponse:
    if cached := guard.lookup():
        return PushTokenResponse.model_validate(cached)
    store = state.store
    # Upsert per (user, token).
    for device in store.devices.values():
        if device.user_id == user_id and device.push_token == payload.push_token:
            device.platform = payload.platform
            device.app_version = payload.app_version
            device.last_seen = now_utc()
            resp = PushTokenResponse()
            guard.record(resp.model_dump(mode="json"))
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
    guard.record(resp.model_dump(mode="json"))
    return resp
