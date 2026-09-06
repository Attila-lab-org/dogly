"""Gallery + profile visibility routes (Dogly UX V1)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import AppState, StateDep, UserIdDep
from app.contracts.api import (
    DogAlbumCreate,
    DogAlbumListResponse,
    DogAlbumOut,
    DogPhotoInitRequest,
    DogPhotoListResponse,
    DogPhotoOut,
    DogPhotoUpdate,
    DogPhotoUploadResponse,
    DogProfileVisibilityOut,
    DogProfileVisibilityUpdate,
)
from app.domains import gallery as gallery_domain
from app.domains import gallery_db
from app.domains.gallery_db import GALLERY_BUCKET

router = APIRouter()


async def photo_with_url(photo: DogPhotoOut, state: AppState) -> DogPhotoOut:
    try:
        url = await state.storage.create_signed_read_url(
            bucket=GALLERY_BUCKET,
            path=photo.storage_path,
            ttl_seconds=min(state.settings.storage_signed_url_ttl_seconds, 3600),
        )
    except Exception:  # noqa: BLE001 -- gallery read URL is best-effort
        url = None
    return photo.model_copy(update={"photo_url": url})


async def album_with_cover(
    album: DogAlbumOut, state: AppState, user_id: str
) -> DogAlbumOut:
    if not album.cover_photo_id:
        return album
    if state.engine is not None:
        path = await gallery_db.get_album_cover_path(
            state.engine, user_id=user_id, album_id=album.id
        )
    else:
        photo = state.store.dog_photos.get(album.cover_photo_id)
        path = photo.storage_path if photo is not None and photo.owner_id == user_id else None
    if not path:
        return album
    try:
        url = await state.storage.create_signed_read_url(
            bucket=GALLERY_BUCKET,
            path=path,
            ttl_seconds=min(state.settings.storage_signed_url_ttl_seconds, 3600),
        )
    except Exception:  # noqa: BLE001 -- gallery cover URL is best-effort
        url = None
    return album.model_copy(update={"cover_url": url})


@router.get("/dogs/{dog_id}/albums", response_model=DogAlbumListResponse)
async def list_albums(dog_id: str, state: StateDep, user_id: UserIdDep) -> DogAlbumListResponse:
    if state.engine is not None:
        items = await gallery_db.list_albums(state.engine, user_id=user_id, dog_id=dog_id)
    else:
        items = gallery_domain.list_albums(state.store, user_id=user_id, dog_id=dog_id)
    return DogAlbumListResponse(
        items=[await album_with_cover(item, state, user_id) for item in items]
    )


@router.post("/dogs/{dog_id}/albums", response_model=DogAlbumOut, status_code=201)
async def create_album(
    dog_id: str, payload: DogAlbumCreate, state: StateDep, user_id: UserIdDep
) -> DogAlbumOut:
    if state.engine is not None:
        return await gallery_db.create_album(
            state.engine, user_id=user_id, dog_id=dog_id, payload=payload
        )
    return gallery_domain.create_album(
        state.store, user_id=user_id, dog_id=dog_id, payload=payload
    )


@router.get("/albums/{album_id}", response_model=DogAlbumOut)
async def get_album(album_id: str, state: StateDep, user_id: UserIdDep) -> DogAlbumOut:
    if state.engine is not None:
        album = await gallery_db.get_album(state.engine, user_id=user_id, album_id=album_id)
    else:
        album = gallery_domain.get_album(state.store, user_id=user_id, album_id=album_id)
    return await album_with_cover(album, state, user_id)


@router.get("/albums/{album_id}/photos", response_model=DogPhotoListResponse)
async def list_photos(album_id: str, state: StateDep, user_id: UserIdDep) -> DogPhotoListResponse:
    if state.engine is not None:
        items = await gallery_db.list_photos(state.engine, user_id=user_id, album_id=album_id)
    else:
        items = gallery_domain.list_photos(state.store, user_id=user_id, album_id=album_id)
    return DogPhotoListResponse(items=[await photo_with_url(photo, state) for photo in items])


@router.post(
    "/albums/{album_id}/photos/init",
    response_model=DogPhotoUploadResponse,
    status_code=201,
)
async def init_photo(
    album_id: str,
    payload: DogPhotoInitRequest,
    state: StateDep,
    user_id: UserIdDep,
) -> DogPhotoUploadResponse:
    if state.engine is not None:
        photo, url, expires = await gallery_db.init_photo_upload(
            state.engine,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            album_id=album_id,
            payload=payload,
        )
    else:
        photo, url, expires = await gallery_domain.init_photo_upload(
            state.store,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            album_id=album_id,
            payload=payload,
        )
    return DogPhotoUploadResponse(
        photo=DogPhotoOut(
            id=photo.id,
            album_id=photo.album_id,
            dog_id=photo.dog_id,
            storage_path=photo.storage_path,
            caption=photo.caption,
            visibility=photo.visibility,  # type: ignore[arg-type]
            taken_at=photo.taken_at,
            created_at=photo.created_at,
        ),
        upload={"url": url, "storage_path": photo.storage_path, "expires_at": expires},
    )


@router.patch("/photos/{photo_id}", response_model=DogPhotoOut)
async def update_photo(
    photo_id: str, payload: DogPhotoUpdate, state: StateDep, user_id: UserIdDep
) -> DogPhotoOut:
    if state.engine is not None:
        photo = await gallery_db.update_photo(
            state.engine, user_id=user_id, photo_id=photo_id, payload=payload
        )
    else:
        photo = gallery_domain.update_photo(
            state.store, user_id=user_id, photo_id=photo_id, payload=payload
        )
    return await photo_with_url(photo, state)


@router.delete("/photos/{photo_id}", status_code=204)
async def delete_photo(photo_id: str, state: StateDep, user_id: UserIdDep) -> None:
    if state.engine is not None:
        await gallery_db.soft_delete_photo(state.engine, user_id=user_id, photo_id=photo_id)
        return
    gallery_domain.soft_delete_photo(state.store, user_id=user_id, photo_id=photo_id)


@router.get("/dogs/{dog_id}/visibility", response_model=DogProfileVisibilityOut)
async def get_visibility(
    dog_id: str, state: StateDep, user_id: UserIdDep
) -> DogProfileVisibilityOut:
    if state.engine is not None:
        return await gallery_db.get_visibility(state.engine, user_id=user_id, dog_id=dog_id)
    return gallery_domain.get_visibility(state.store, user_id=user_id, dog_id=dog_id)


@router.put("/dogs/{dog_id}/visibility", response_model=DogProfileVisibilityOut)
async def put_visibility(
    dog_id: str,
    payload: DogProfileVisibilityUpdate,
    state: StateDep,
    user_id: UserIdDep,
) -> DogProfileVisibilityOut:
    if state.engine is not None:
        return await gallery_db.update_visibility(
            state.engine, user_id=user_id, dog_id=dog_id, payload=payload
        )
    return gallery_domain.update_visibility(
        state.store, user_id=user_id, dog_id=dog_id, payload=payload
    )
