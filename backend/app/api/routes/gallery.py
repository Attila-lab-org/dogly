"""Gallery + profile visibility routes (Dogly UX V1)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import StateDep, UserIdDep
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

router = APIRouter()


@router.get("/dogs/{dog_id}/albums", response_model=DogAlbumListResponse)
async def list_albums(dog_id: str, state: StateDep, user_id: UserIdDep) -> DogAlbumListResponse:
    return DogAlbumListResponse(
        items=gallery_domain.list_albums(state.store, user_id=user_id, dog_id=dog_id)
    )


@router.post("/dogs/{dog_id}/albums", response_model=DogAlbumOut, status_code=201)
async def create_album(
    dog_id: str, payload: DogAlbumCreate, state: StateDep, user_id: UserIdDep
) -> DogAlbumOut:
    return gallery_domain.create_album(
        state.store, user_id=user_id, dog_id=dog_id, payload=payload
    )


@router.get("/albums/{album_id}", response_model=DogAlbumOut)
async def get_album(album_id: str, state: StateDep, user_id: UserIdDep) -> DogAlbumOut:
    return gallery_domain.get_album(state.store, user_id=user_id, album_id=album_id)


@router.get("/albums/{album_id}/photos", response_model=DogPhotoListResponse)
async def list_photos(album_id: str, state: StateDep, user_id: UserIdDep) -> DogPhotoListResponse:
    return DogPhotoListResponse(
        items=gallery_domain.list_photos(state.store, user_id=user_id, album_id=album_id)
    )


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
    return gallery_domain.update_photo(
        state.store, user_id=user_id, photo_id=photo_id, payload=payload
    )


@router.delete("/photos/{photo_id}", status_code=204)
async def delete_photo(photo_id: str, state: StateDep, user_id: UserIdDep) -> None:
    gallery_domain.soft_delete_photo(state.store, user_id=user_id, photo_id=photo_id)


@router.get("/dogs/{dog_id}/visibility", response_model=DogProfileVisibilityOut)
async def get_visibility(
    dog_id: str, state: StateDep, user_id: UserIdDep
) -> DogProfileVisibilityOut:
    return gallery_domain.get_visibility(state.store, user_id=user_id, dog_id=dog_id)


@router.put("/dogs/{dog_id}/visibility", response_model=DogProfileVisibilityOut)
async def put_visibility(
    dog_id: str,
    payload: DogProfileVisibilityUpdate,
    state: StateDep,
    user_id: UserIdDep,
) -> DogProfileVisibilityOut:
    return gallery_domain.update_visibility(
        state.store, user_id=user_id, dog_id=dog_id, payload=payload
    )
