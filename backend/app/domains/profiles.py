"""In-memory account profile updates used by local development and tests."""

from __future__ import annotations

from app.contracts.api import ProfilePatch
from app.domains.models import ProfileRec
from app.domains.repository import InMemoryStore


def update_profile(
    store: InMemoryStore, user_id: str, payload: ProfilePatch
) -> ProfileRec:
    profile = store.ensure_profile(user_id)
    requested = payload.model_dump(exclude_unset=True)
    if not requested:
        return profile
    updated = profile.model_copy(update=requested)
    store.profiles[user_id] = updated
    return updated
