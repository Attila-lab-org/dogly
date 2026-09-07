"""Dog routes: GET/POST /v1/dogs, PATCH /v1/dogs/{dog_id}, avatar upload (sez. 9)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import AppState, StateDep, UserIdDep
from app.contracts.api import (
    DogAvatarCompleteRequest,
    DogAvatarInitRequest,
    DogAvatarInitResponse,
    DogCreate,
    DogListResponse,
    DogOut,
    DogUpdate,
)
from app.domains import dogs as dogs_domain
from app.domains import dogs_db
from app.domains.dogs import AVATAR_BUCKET
from app.domains.models import DogRec

router = APIRouter()


async def to_out(dog: DogRec, state: AppState) -> DogOut:
    photo_url = None
    if dog.photo_path:
        create_read = getattr(state.storage, "create_signed_read_url", None)
        if callable(create_read):
            try:
                photo_url = await create_read(
                    bucket=AVATAR_BUCKET,
                    path=dog.photo_path,
                    ttl_seconds=max(state.settings.storage_signed_url_ttl_seconds, 3600),
                )
            except Exception:  # noqa: BLE001 -- avatar read URL is best-effort
                photo_url = None
    return DogOut(
        id=dog.id,
        name=dog.name,
        birth_date=dog.birth_date,
        age_stage=dog.age_stage,
        size=dog.size,
        breed_label=dog.breed_label,
        is_mix=dog.is_mix,
        sex=dog.sex,
        weight_kg=dog.weight_kg,
        photo_path=dog.photo_path,
        photo_url=photo_url,
        created_at=dog.created_at,
    )


@router.get("/dogs", response_model=DogListResponse)
async def list_dogs(state: StateDep, user_id: UserIdDep) -> DogListResponse:
    if state.engine is not None:
        items = await dogs_db.list_dogs(state.engine, user_id=user_id)
    else:
        items = state.store.list_dogs(user_id)
    return DogListResponse(items=[await to_out(d, state) for d in items])


@router.post("/dogs", response_model=DogOut, status_code=201)
async def create_dog(payload: DogCreate, state: StateDep, user_id: UserIdDep) -> DogOut:
    if state.engine is not None:
        dog = await dogs_db.create_dog(state.engine, user_id=user_id, payload=payload)
    else:
        dog = dogs_domain.create_dog(state.store, user_id=user_id, payload=payload)
    return await to_out(dog, state)


@router.patch("/dogs/{dog_id}", response_model=DogOut)
async def update_dog(dog_id: str, payload: DogUpdate, state: StateDep, user_id: UserIdDep) -> DogOut:
    if state.engine is not None:
        dog = await dogs_db.update_dog(state.engine, user_id=user_id, dog_id=dog_id, payload=payload)
    else:
        dog = dogs_domain.update_dog(state.store, user_id=user_id, dog_id=dog_id, payload=payload)
    return await to_out(dog, state)


@router.post("/dogs/{dog_id}/avatar/init", response_model=DogAvatarInitResponse)
async def init_avatar(
    dog_id: str,
    payload: DogAvatarInitRequest,
    state: StateDep,
    user_id: UserIdDep,
) -> DogAvatarInitResponse:
    if state.engine is not None:
        path, upload = await dogs_db.init_avatar_upload(
            state.engine,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            dog_id=dog_id,
            payload=payload,
        )
    else:
        path, upload = await dogs_domain.init_avatar_upload(
            state.store,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            dog_id=dog_id,
            payload=payload,
        )
    return DogAvatarInitResponse(storage_path=path, upload=upload)


@router.post("/dogs/{dog_id}/avatar/complete", response_model=DogOut)
async def complete_avatar(
    dog_id: str,
    payload: DogAvatarCompleteRequest,
    state: StateDep,
    user_id: UserIdDep,
) -> DogOut:
    if state.engine is not None:
        dog = await dogs_db.complete_avatar_upload(
            state.engine,
            storage=state.storage,
            user_id=user_id,
            dog_id=dog_id,
            storage_path=payload.storage_path,
            expected_bytes=payload.bytes,
        )
    else:
        dog = await dogs_domain.complete_avatar_upload(
            state.store,
            storage=state.storage,
            user_id=user_id,
            dog_id=dog_id,
            storage_path=payload.storage_path,
            expected_bytes=payload.bytes,
        )
    return await to_out(dog, state)
