"""Owner/dog-scoped reuse of identical digestive images.

A cache hit is allowed only when the same owner, dog, file digest, observer
identity, prompt, schema, and normalizer versions match. There is no global
deduplication across users.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.taxonomy import STOOL_OBSERVATION_SCHEMA_VERSION
from app.domains.digestive_observation import (
    DIGESTIVE_NORMALIZER_VERSION,
    DIGESTIVE_OBSERVER_PROMPT_VERSION,
)
from app.domains.repository import InMemoryStore, new_id, now_utc


def _uuid_id() -> str:
    value = new_id()
    if len(value) == 32:
        return f"{value[:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
    return value


def image_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def engine_identity(
    *,
    provider: str,
    model: str,
    prompt_version: str = DIGESTIVE_OBSERVER_PROMPT_VERSION,
    schema_version: str = STOOL_OBSERVATION_SCHEMA_VERSION,
    normalizer_version: str = DIGESTIVE_NORMALIZER_VERSION,
) -> dict[str, str]:
    return {
        "observer_provider": provider,
        "observer_model": model,
        "observer_prompt_version": prompt_version,
        "schema_version": schema_version,
        "normalizer_version": normalizer_version,
    }


def _key(
    *,
    user_id: str,
    dog_id: str,
    image_sha256_hex: str,
    identity: dict[str, str],
) -> tuple[str, ...]:
    return (
        user_id,
        dog_id,
        image_sha256_hex,
        identity["observer_provider"],
        identity["observer_model"],
        identity["observer_prompt_version"],
        identity["schema_version"],
        identity["normalizer_version"],
    )


def lookup_cached_observation(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    image_sha256_hex: str,
    identity: dict[str, str],
) -> dict[str, Any] | None:
    row = store.digestive_observation_cache.get(
        _key(
            user_id=user_id,
            dog_id=dog_id,
            image_sha256_hex=image_sha256_hex,
            identity=identity,
        )
    )
    if row is None:
        return None
    return dict(row["observation_json"])


def store_cached_observation(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    image_sha256_hex: str,
    identity: dict[str, str],
    observation: dict[str, Any],
    source_event_id: str,
) -> None:
    store.digestive_observation_cache[
        _key(
            user_id=user_id,
            dog_id=dog_id,
            image_sha256_hex=image_sha256_hex,
            identity=identity,
        )
    ] = {
        "observation_json": dict(observation),
        "source_event_id": source_event_id,
        "created_at": now_utc(),
    }


async def lookup_cached_observation_db(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    image_sha256_hex: str,
    identity: dict[str, str],
) -> dict[str, Any] | None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select observation_json
                    from internal.digestive_observation_cache
                    where user_id = cast(:user_id as uuid)
                      and dog_id = cast(:dog_id as uuid)
                      and image_sha256 = :image_sha256
                      and observer_provider = :observer_provider
                      and observer_model = :observer_model
                      and observer_prompt_version = :observer_prompt_version
                      and schema_version = :schema_version
                      and normalizer_version = :normalizer_version
                    """
                ),
                {
                    "user_id": user_id,
                    "dog_id": dog_id,
                    "image_sha256": image_sha256_hex,
                    **identity,
                },
            )
        ).mappings().first()
    if row is None:
        return None
    payload = row["observation_json"]
    return dict(payload) if isinstance(payload, dict) else None


async def store_cached_observation_db(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    image_sha256_hex: str,
    identity: dict[str, str],
    observation: dict[str, Any],
    source_event_id: str,
) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                insert into internal.digestive_observation_cache (
                  id, user_id, dog_id, image_sha256,
                  observer_provider, observer_model, observer_prompt_version,
                  schema_version, normalizer_version, observation_json,
                  source_event_id, created_at
                ) values (
                  cast(:id as uuid), cast(:user_id as uuid), cast(:dog_id as uuid),
                  :image_sha256, :observer_provider, :observer_model,
                  :observer_prompt_version, :schema_version, :normalizer_version,
                  cast(:observation_json as jsonb), cast(:source_event_id as uuid),
                  now()
                )
                on conflict (
                  user_id, dog_id, image_sha256, observer_provider, observer_model,
                  observer_prompt_version, schema_version, normalizer_version
                ) do nothing
                """
            ),
            {
                "id": _uuid_id(),
                "user_id": user_id,
                "dog_id": dog_id,
                "image_sha256": image_sha256_hex,
                "observation_json": json.dumps(observation),
                "source_event_id": source_event_id,
                **identity,
            },
        )
