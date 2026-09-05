"""Dog domain service: ownership, plan-limited creation, profile versions
(internal audit, sez. 10.1)."""

from __future__ import annotations

from app.config import Settings
from app.contracts.api import DogAvatarInitRequest, DogCreate, DogUpdate, SignedUpload
from app.contracts.errors import ApiError, ErrorCode
from app.domains.billing import max_active_dogs
from app.domains.models import DogRec
from app.domains.repository import InMemoryStore, new_id, now_utc
from app.providers.base import StorageProvider

AVATAR_BUCKET = "dog-avatars"
_AVATAR_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def avatar_storage_prefix(user_id: str, dog_id: str) -> str:
    return f"users/{user_id}/dogs/{dog_id}/avatar/"


def create_dog(store: InMemoryStore, *, user_id: str, payload: DogCreate) -> DogRec:
    sub = store.ensure_subscription(user_id)
    existing = store.list_dogs(user_id)
    if len(existing) >= max_active_dogs(sub.plan):
        raise ApiError(
            ErrorCode.QUOTA_EXHAUSTED,
            "Your plan allows a limited number of active dogs.",
        )
    rec = DogRec(
        id=new_id(),
        owner_id=user_id,
        name=payload.name,
        birth_date=payload.birth_date,
        age_stage=payload.age_stage,
        size=payload.size,
        breed_label=payload.breed_label,
        is_mix=payload.is_mix,
        sex=payload.sex,
        weight_kg=payload.weight_kg,
        created_at=now_utc(),
    )
    store.create_dog(rec)
    store.save_profile_version(rec.id, rec.model_dump(mode="json"), ["created"])
    return rec


def get_owned_dog(store: InMemoryStore, *, user_id: str, dog_id: str) -> DogRec:
    """Ownership check: 404 (not 403) to avoid leaking existence (sez. 24.1)."""
    dog = store.get_dog(dog_id)
    if dog is None or dog.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Dog not found")
    return dog


def update_dog(store: InMemoryStore, *, user_id: str, dog_id: str, payload: DogUpdate) -> DogRec:
    dog = get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    changed = payload.model_dump(exclude_none=True)
    if changed:
        updated = dog.model_copy(update=changed)
        store.dogs[dog.id] = updated
        # Profile version audit: changes that can influence interpretation (sez. 10.1).
        store.save_profile_version(dog_id, updated.model_dump(mode="json"), sorted(changed.keys()))
        return updated
    return dog


def set_photo_path(
    store: InMemoryStore, *, user_id: str, dog_id: str, photo_path: str
) -> DogRec:
    dog = get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    updated = dog.model_copy(update={"photo_path": photo_path})
    store.dogs[dog.id] = updated
    store.save_profile_version(dog_id, updated.model_dump(mode="json"), ["photo_path"])
    return updated


async def init_avatar_upload(
    store: InMemoryStore,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    dog_id: str,
    payload: DogAvatarInitRequest,
) -> tuple[str, SignedUpload]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    ext = _AVATAR_EXT[payload.content_type]
    path = f"{avatar_storage_prefix(user_id, dog_id)}{new_id()}.{ext}"
    url, expires = await storage.create_signed_upload_url(
        bucket=AVATAR_BUCKET,
        path=path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return path, SignedUpload(url=url, storage_path=path, expires_at=expires)


async def complete_avatar_upload(
    store: InMemoryStore,
    *,
    storage: StorageProvider,
    user_id: str,
    dog_id: str,
    storage_path: str,
    expected_bytes: int | None = None,
) -> DogRec:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    prefix = avatar_storage_prefix(user_id, dog_id)
    if not storage_path.startswith(prefix):
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Avatar path is not valid for this dog.")
    exists = await storage.object_exists(
        bucket=AVATAR_BUCKET, path=storage_path, expected_bytes=expected_bytes
    )
    if not exists:
        raise ApiError(ErrorCode.NOT_FOUND, "Avatar upload was not found.")
    return set_photo_path(store, user_id=user_id, dog_id=dog_id, photo_path=storage_path)
