"""Dog gallery + public profile visibility (Dogly UX V1).

Albums/photos are owner-only and private by default. They are separate from
AI raw media buckets and never receive behavior/digestive analysis assets.
"""

from __future__ import annotations

from app.config import Settings
from app.contracts.api import (
    DogAlbumCreate,
    DogAlbumOut,
    DogPhotoInitRequest,
    DogPhotoOut,
    DogPhotoUpdate,
    DogProfileVisibilityOut,
    DogProfileVisibilityUpdate,
)
from app.contracts.errors import ApiError, ErrorCode
from app.domains.dogs import get_owned_dog
from app.domains.models import DogAlbumRec, DogPhotoRec, DogProfileVisibilityRec
from app.domains.repository import InMemoryStore, new_id, now_utc
from app.providers.base import StorageProvider

GALLERY_BUCKET = "dog-gallery"


def _album_out(album: DogAlbumRec, store: InMemoryStore) -> DogAlbumOut:
    count = sum(
        1
        for p in store.dog_photos.values()
        if p.album_id == album.id and p.deleted_at is None
    )
    return DogAlbumOut(
        id=album.id,
        dog_id=album.dog_id,
        title=album.title,
        cover_photo_id=album.cover_photo_id,
        photo_count=count,
        default_visibility=album.default_visibility,
        created_at=album.created_at,
    )


def _photo_out(photo: DogPhotoRec) -> DogPhotoOut:
    return DogPhotoOut(
        id=photo.id,
        album_id=photo.album_id,
        dog_id=photo.dog_id,
        storage_path=photo.storage_path,
        caption=photo.caption,
        visibility=photo.visibility,
        taken_at=photo.taken_at,
        created_at=photo.created_at,
    )


def list_albums(store: InMemoryStore, *, user_id: str, dog_id: str) -> list[DogAlbumOut]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    albums = [
        a for a in store.dog_albums.values() if a.dog_id == dog_id and a.owner_id == user_id
    ]
    albums.sort(key=lambda a: a.created_at, reverse=True)
    return [_album_out(a, store) for a in albums]


def create_album(
    store: InMemoryStore, *, user_id: str, dog_id: str, payload: DogAlbumCreate
) -> DogAlbumOut:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    album = DogAlbumRec(
        id=new_id(),
        dog_id=dog_id,
        owner_id=user_id,
        title=payload.title.strip(),
        default_visibility=payload.default_visibility,
        created_at=now_utc(),
    )
    store.dog_albums[album.id] = album
    return _album_out(album, store)


def get_album(store: InMemoryStore, *, user_id: str, album_id: str) -> DogAlbumOut:
    album = store.dog_albums.get(album_id)
    if album is None or album.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Album not found.")
    return _album_out(album, store)


def list_photos(store: InMemoryStore, *, user_id: str, album_id: str) -> list[DogPhotoOut]:
    album = store.dog_albums.get(album_id)
    if album is None or album.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Album not found.")
    photos = [
        p
        for p in store.dog_photos.values()
        if p.album_id == album_id and p.owner_id == user_id and p.deleted_at is None
    ]
    photos.sort(key=lambda p: p.created_at, reverse=True)
    return [_photo_out(p) for p in photos]


async def init_photo_upload(
    store: InMemoryStore,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    album_id: str,
    payload: DogPhotoInitRequest,
) -> tuple[DogPhotoRec, str, object]:
    album = store.dog_albums.get(album_id)
    if album is None or album.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Album not found.")
    photo_id = new_id()
    path = (
        f"users/{user_id}/dogs/{album.dog_id}/gallery/{album.id}/{photo_id}.jpg"
    )
    photo = DogPhotoRec(
        id=photo_id,
        album_id=album.id,
        dog_id=album.dog_id,
        owner_id=user_id,
        storage_path=path,
        caption=payload.caption,
        visibility=payload.visibility or album.default_visibility,
        taken_at=payload.taken_at,
        created_at=now_utc(),
    )
    store.dog_photos[photo.id] = photo
    if album.cover_photo_id is None:
        album.cover_photo_id = photo.id
    url, expires = await storage.create_signed_upload_url(
        bucket=GALLERY_BUCKET,
        path=path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return photo, url, expires


def update_photo(
    store: InMemoryStore, *, user_id: str, photo_id: str, payload: DogPhotoUpdate
) -> DogPhotoOut:
    photo = store.dog_photos.get(photo_id)
    if photo is None or photo.owner_id != user_id or photo.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, "Photo not found.")
    if payload.caption is not None:
        photo.caption = payload.caption
    if payload.visibility is not None:
        photo.visibility = payload.visibility
    return _photo_out(photo)


def soft_delete_photo(store: InMemoryStore, *, user_id: str, photo_id: str) -> None:
    photo = store.dog_photos.get(photo_id)
    if photo is None or photo.owner_id != user_id or photo.deleted_at is not None:
        raise ApiError(ErrorCode.NOT_FOUND, "Photo not found.")
    photo.deleted_at = now_utc()
    album = store.dog_albums.get(photo.album_id)
    if album and album.cover_photo_id == photo.id:
        next_cover = next(
            (
                p.id
                for p in store.dog_photos.values()
                if p.album_id == album.id and p.deleted_at is None and p.id != photo.id
            ),
            None,
        )
        album.cover_photo_id = next_cover


def get_visibility(
    store: InMemoryStore, *, user_id: str, dog_id: str
) -> DogProfileVisibilityOut:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    rec = store.dog_profile_visibility.get(dog_id)
    if rec is None:
        rec = DogProfileVisibilityRec(dog_id=dog_id, updated_at=now_utc())
        store.dog_profile_visibility[dog_id] = rec
    return DogProfileVisibilityOut(
        dog_id=rec.dog_id,
        visibility=rec.visibility,
        consent_version=rec.consent_version,
        consented_at=rec.consented_at,
        revoked_at=rec.revoked_at,
        public_slug=rec.public_slug,
        whitelist_fields=list(rec.whitelist_fields),
    )


def update_visibility(
    store: InMemoryStore, *, user_id: str, dog_id: str, payload: DogProfileVisibilityUpdate
) -> DogProfileVisibilityOut:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    rec = store.dog_profile_visibility.get(dog_id)
    if rec is None:
        rec = DogProfileVisibilityRec(dog_id=dog_id, updated_at=now_utc())
        store.dog_profile_visibility[dog_id] = rec

    if payload.visibility == "PUBLIC":
        if not payload.consent_version:
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "Public profile requires an explicit consent_version.",
            )
        rec.visibility = "PUBLIC"
        rec.consent_version = payload.consent_version
        rec.consented_at = now_utc()
        rec.revoked_at = None
        if payload.public_slug is not None:
            rec.public_slug = payload.public_slug
        if payload.whitelist_fields is not None:
            rec.whitelist_fields = payload.whitelist_fields
    else:
        rec.visibility = "PRIVATE"
        rec.revoked_at = now_utc()
        # Keep consent history fields; revoke is immediate for public surface.

    rec.updated_at = now_utc()
    return get_visibility(store, user_id=user_id, dog_id=dog_id)
