"""Dog domain service: ownership, plan-limited creation, profile versions
(internal audit, sez. 10.1)."""

from __future__ import annotations

from app.contracts.api import DogCreate, DogUpdate
from app.contracts.errors import ApiError, ErrorCode
from app.domains.billing import max_active_dogs
from app.domains.models import DogRec
from app.domains.repository import InMemoryStore, new_id, now_utc


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
