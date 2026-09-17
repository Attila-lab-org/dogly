"""PostgreSQL repository for dogs (production path when DATABASE_URL is set)."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import DogCreate, DogUpdate
from app.contracts.errors import ApiError, ErrorCode
from app.domains.age_stage import normalize_age_stage
from app.domains.billing import max_active_dogs
from app.domains.ids import require_uuid
from app.domains.models import DogRec
from app.domains.sex import normalize_sex

logger = logging.getLogger(__name__)


def _row_to_dog(row: Any) -> DogRec:
    data = dict(row)
    data["id"] = str(data["id"])
    data["owner_id"] = str(data["owner_id"])
    if isinstance(data.get("birth_date"), date):
        data["birth_date"] = data["birth_date"].isoformat()
    return DogRec.model_validate(data)


def _parse_birth_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _normalize_size(value: str | None) -> str | None:
    return value.upper() if value else None


async def list_dogs(engine: AsyncEngine, *, user_id: str) -> list[DogRec]:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select id, owner_id, name, birth_date, age_stage, size, breed_label,
                           is_mix, sex, weight_kg, photo_path, created_at
                    from public.dogs
                    where owner_id = :user_id
                    order by created_at asc
                    """
                ),
                {"user_id": user_id},
            )
        ).mappings().all()
    return [_row_to_dog(r) for r in rows]


async def get_owned_dog(engine: AsyncEngine, *, user_id: str, dog_id: str) -> DogRec:
    require_uuid(dog_id, not_found="Dog not found")

    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select id, owner_id, name, birth_date, age_stage, size, breed_label,
                           is_mix, sex, weight_kg, photo_path, created_at
                    from public.dogs
                    where id = :dog_id and owner_id = :user_id
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Dog not found")
    return _row_to_dog(row)


async def create_dog(engine: AsyncEngine, *, user_id: str, payload: DogCreate) -> DogRec:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                insert into public.profiles (user_id)
                values (cast(:user_id as uuid))
                on conflict (user_id) do nothing
                """
            ),
            {"user_id": user_id},
        )
        await conn.execute(
            text(
                """
                select user_id
                from public.profiles
                where user_id = cast(:user_id as uuid)
                for update
                """
            ),
            {"user_id": user_id},
        )
        plan_row = (
            await conn.execute(
                text(
                    """
                    select coalesce(
                      (select plan from public.subscriptions where user_id = :user_id),
                      'FREE'
                    ) as plan
                    """
                ),
                {"user_id": user_id},
            )
        ).mappings().first()
        plan = str(plan_row["plan"]) if plan_row else "FREE"
        count = (
            await conn.execute(
                text(
                    "select count(*)::int as n from public.dogs "
                    "where owner_id = :user_id"
                ),
                {"user_id": user_id},
            )
        ).mappings().first()
        if int(count["n"]) >= max_active_dogs(plan):
            raise ApiError(ErrorCode.QUOTA_EXHAUSTED, "Your plan allows a limited number of active dogs.")

        row = (
            await conn.execute(
                text(
                    """
                    insert into public.dogs (
                      owner_id, name, birth_date, age_stage, size, breed_label,
                      is_mix, sex, weight_kg
                    ) values (
                      :owner_id, :name, :birth_date, :age_stage, :size, :breed_label,
                      :is_mix, :sex, :weight_kg
                    )
                    returning id, owner_id, name, birth_date, age_stage, size, breed_label,
                              is_mix, sex, weight_kg, photo_path, created_at
                    """
                ),
                {
                    "owner_id": user_id,
                    "name": payload.name,
                    "birth_date": _parse_birth_date(payload.birth_date),
                    "age_stage": normalize_age_stage(payload.age_stage),
                    "size": _normalize_size(payload.size),
                    "breed_label": payload.breed_label,
                    "is_mix": payload.is_mix,
                    "sex": normalize_sex(payload.sex),
                    "weight_kg": payload.weight_kg,
                },
            )
        ).mappings().first()
        dog = _row_to_dog(row)
        await conn.execute(
            text(
                """
                insert into internal.dog_profile_versions (dog_id, snapshot, changed_fields)
                values (:dog_id, CAST(:snapshot AS jsonb), CAST(:fields AS text[]))
                """
            ),
            {
                "dog_id": dog.id,
                "snapshot": dog.model_dump_json(),
                "fields": ["created"],
            },
        )
        if dog.weight_kg is not None:
            from app.domains.weight_db import insert_weight_event_on_conn

            await insert_weight_event_on_conn(
                conn,
                user_id=user_id,
                dog_id=dog.id,
                weight_kg=dog.weight_kg,
            )
    return dog


async def update_dog(
    engine: AsyncEngine, *, user_id: str, dog_id: str, payload: DogUpdate
) -> DogRec:
    require_uuid(dog_id, not_found="Dog not found")
    requested = payload.model_dump(exclude_unset=True)
    if not requested:
        return await get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    if "birth_date" in requested:
        requested["birth_date"] = _parse_birth_date(requested["birth_date"])
    if "size" in requested:
        requested["size"] = _normalize_size(requested["size"])
    if "age_stage" in requested:
        requested["age_stage"] = normalize_age_stage(requested["age_stage"])
    if "sex" in requested:
        requested["sex"] = normalize_sex(requested["sex"])

    async with engine.begin() as conn:
        current_row = (
            await conn.execute(
                text(
                    """
                    select id, owner_id, name, birth_date, age_stage, size, breed_label,
                           is_mix, sex, weight_kg, photo_path, created_at
                    from public.dogs
                    where id = :dog_id and owner_id = :user_id
                    for update
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().first()
        if not current_row:
            raise ApiError(ErrorCode.NOT_FOUND, "Dog not found")

        changed = {
            key: value
            for key, value in requested.items()
            if (
                float(current_row[key])
                if key == "weight_kg" and current_row[key] is not None
                else current_row[key]
            )
            != value
        }
        if not changed:
            return _row_to_dog(current_row)

        previous_weight = (
            float(current_row["weight_kg"])
            if current_row["weight_kg"] is not None
            else None
        )
        sets = ", ".join(f"{key} = :{key}" for key in changed)
        row = (
            await conn.execute(
                text(
                    f"""
                    update public.dogs
                    set {sets}
                    where id = :dog_id and owner_id = :user_id
                    returning id, owner_id, name, birth_date, age_stage, size, breed_label,
                              is_mix, sex, weight_kg, photo_path, created_at
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id, **changed},
            )
        ).mappings().one()
        dog = _row_to_dog(row)
        await conn.execute(
            text(
                """
                insert into internal.dog_profile_versions (dog_id, snapshot, changed_fields)
                values (:dog_id, CAST(:snapshot AS jsonb), CAST(:fields AS text[]))
                """
            ),
            {
                "dog_id": dog.id,
                "snapshot": dog.model_dump_json(),
                "fields": sorted(changed.keys()),
            },
        )
        if "weight_kg" in changed and dog.weight_kg is not None:
            from app.domains.weight_db import insert_weight_event_on_conn

            if dog.weight_kg != previous_weight:
                await insert_weight_event_on_conn(
                    conn,
                    user_id=user_id,
                    dog_id=dog.id,
                    weight_kg=dog.weight_kg,
                )
    return dog


async def set_photo_path(
    engine: AsyncEngine, *, user_id: str, dog_id: str, photo_path: str
) -> DogRec:
    require_uuid(dog_id, not_found="Dog not found")
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update public.dogs
                    set photo_path = :photo_path
                    where id = :dog_id and owner_id = :user_id
                      and photo_path is distinct from :photo_path
                    returning id, owner_id, name, birth_date, age_stage, size, breed_label,
                              is_mix, sex, weight_kg, photo_path, created_at
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id, "photo_path": photo_path},
            )
        ).mappings().first()
        if not row:
            current = (
                await conn.execute(
                    text(
                        """
                        select id, owner_id, name, birth_date, age_stage, size, breed_label,
                               is_mix, sex, weight_kg, photo_path, created_at
                        from public.dogs
                        where id = :dog_id and owner_id = :user_id
                        """
                    ),
                    {"dog_id": dog_id, "user_id": user_id},
                )
            ).mappings().first()
            if not current:
                raise ApiError(ErrorCode.NOT_FOUND, "Dog not found")
            return _row_to_dog(current)
        dog = _row_to_dog(row)
        await conn.execute(
            text(
                """
                insert into internal.dog_profile_versions (dog_id, snapshot, changed_fields)
                values (:dog_id, CAST(:snapshot AS jsonb), CAST(:fields AS text[]))
                """
            ),
            {
                "dog_id": dog.id,
                "snapshot": dog.model_dump_json(),
                "fields": ["photo_path"],
            },
        )
    return dog


async def init_avatar_upload(
    engine: AsyncEngine,
    *,
    settings,
    storage,
    user_id: str,
    dog_id: str,
    payload,
):
    from app.contracts.api import SignedUpload
    from app.domains.dogs import _AVATAR_EXT, AVATAR_BUCKET, avatar_storage_prefix
    from app.domains.repository import new_id

    await get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
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
    engine: AsyncEngine,
    *,
    storage,
    user_id: str,
    dog_id: str,
    storage_path: str,
    expected_bytes: int | None = None,
) -> DogRec:
    from app.domains.dogs import AVATAR_BUCKET, avatar_storage_prefix

    current = await get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    prefix = avatar_storage_prefix(user_id, dog_id)
    if not storage_path.startswith(prefix):
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Avatar path is not valid for this dog.")
    exists = await storage.object_exists(
        bucket=AVATAR_BUCKET, path=storage_path, expected_bytes=expected_bytes
    )
    if not exists:
        raise ApiError(ErrorCode.NOT_FOUND, "Avatar upload was not found.")
    previous_path = current.photo_path
    updated = await set_photo_path(
        engine,
        user_id=user_id,
        dog_id=dog_id,
        photo_path=storage_path,
    )
    if previous_path and previous_path != storage_path:
        try:
            await storage.delete_object(
                bucket=AVATAR_BUCKET,
                path=previous_path,
            )
        except Exception:
            logger.exception(
                "Could not delete replaced avatar path for dog_id=%s",
                dog_id,
            )
    return updated
