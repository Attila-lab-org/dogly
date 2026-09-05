"""PostgreSQL repository for dog gallery and public-profile visibility."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

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
from app.domains import dogs_db
from app.domains.models import DogPhotoRec
from app.domains.repository import new_id
from app.providers.base import StorageProvider

GALLERY_BUCKET = "dog-gallery"


def _uuid_id() -> str:
    value = new_id()
    if len(value) == 32:
        return f"{value[:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
    return value


def _record(row: Mapping[str, Any]) -> dict[str, Any]:
    data = dict(row)
    for key in ("id", "dog_id", "owner_id", "album_id", "cover_photo_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    if isinstance(data.get("whitelist_fields"), tuple):
        data["whitelist_fields"] = list(data["whitelist_fields"])
    return data


def _album_out(row: Mapping[str, Any]) -> DogAlbumOut:
    return DogAlbumOut.model_validate(_record(row))


def _photo_out(row: Mapping[str, Any]) -> DogPhotoOut:
    return DogPhotoOut.model_validate(_record(row))


def _photo_rec(row: Mapping[str, Any]) -> DogPhotoRec:
    return DogPhotoRec.model_validate(_record(row))


def _visibility_out(row: Mapping[str, Any]) -> DogProfileVisibilityOut:
    return DogProfileVisibilityOut.model_validate(_record(row))


async def list_albums(engine: AsyncEngine, *, user_id: str, dog_id: str) -> list[DogAlbumOut]:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select a.id, a.dog_id, a.title, a.cover_photo_id,
                           count(p.id)::int as photo_count,
                           a.default_visibility, a.created_at
                    from public.dog_albums a
                    left join public.dog_photos p
                      on p.album_id = a.id and p.deleted_at is null
                    where a.dog_id = :dog_id and a.owner_id = :user_id
                    group by a.id
                    order by a.created_at desc, a.id desc
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()
    return [_album_out(row) for row in rows]


async def create_album(
    engine: AsyncEngine, *, user_id: str, dog_id: str, payload: DogAlbumCreate
) -> DogAlbumOut:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.dog_albums (
                      dog_id, owner_id, title, default_visibility
                    ) values (
                      :dog_id, :owner_id, :title, :default_visibility
                    )
                    returning id, dog_id, title, cover_photo_id, 0::int as photo_count,
                              default_visibility, created_at
                    """
                ),
                {
                    "dog_id": dog_id,
                    "owner_id": user_id,
                    "title": payload.title.strip(),
                    "default_visibility": payload.default_visibility,
                },
            )
        ).mappings().one()
    return _album_out(row)


async def get_album(engine: AsyncEngine, *, user_id: str, album_id: str) -> DogAlbumOut:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select a.id, a.dog_id, a.title, a.cover_photo_id,
                           count(p.id)::int as photo_count,
                           a.default_visibility, a.created_at
                    from public.dog_albums a
                    left join public.dog_photos p
                      on p.album_id = a.id and p.deleted_at is null
                    where a.id = :album_id and a.owner_id = :user_id
                    group by a.id
                    """
                ),
                {"album_id": album_id, "user_id": user_id},
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Album not found.")
    return _album_out(row)


async def list_photos(engine: AsyncEngine, *, user_id: str, album_id: str) -> list[DogPhotoOut]:
    async with engine.connect() as conn:
        album = (
            await conn.execute(
                text("select id from public.dog_albums where id = :album_id and owner_id = :user_id"),
                {"album_id": album_id, "user_id": user_id},
            )
        ).mappings().first()
        if not album:
            raise ApiError(ErrorCode.NOT_FOUND, "Album not found.")
        rows = (
            await conn.execute(
                text(
                    """
                    select id, album_id, dog_id, storage_path, caption,
                           visibility, taken_at, created_at
                    from public.dog_photos
                    where album_id = :album_id
                      and owner_id = :user_id
                      and deleted_at is null
                    order by created_at desc, id desc
                    """
                ),
                {"album_id": album_id, "user_id": user_id},
            )
        ).mappings().all()
    return [_photo_out(row) for row in rows]


async def init_photo_upload(
    engine: AsyncEngine,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    album_id: str,
    payload: DogPhotoInitRequest,
) -> tuple[DogPhotoRec, str, object]:
    async with engine.begin() as conn:
        album = (
            await conn.execute(
                text(
                    """
                    select id, dog_id, default_visibility, cover_photo_id
                    from public.dog_albums
                    where id = :album_id and owner_id = :user_id
                    """
                ),
                {"album_id": album_id, "user_id": user_id},
            )
        ).mappings().first()
        if not album:
            raise ApiError(ErrorCode.NOT_FOUND, "Album not found.")

        photo_id = _uuid_id()
        dog_id = str(album["dog_id"])
        path = f"users/{user_id}/dogs/{dog_id}/gallery/{album_id}/{photo_id}.jpg"
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.dog_photos (
                      id, album_id, dog_id, owner_id, storage_path,
                      caption, visibility, taken_at
                    ) values (
                      :id, :album_id, :dog_id, :owner_id, :storage_path,
                      :caption, :visibility, :taken_at
                    )
                    returning id, album_id, dog_id, owner_id, storage_path,
                              caption, visibility, taken_at, created_at, deleted_at
                    """
                ),
                {
                    "id": photo_id,
                    "album_id": album_id,
                    "dog_id": dog_id,
                    "owner_id": user_id,
                    "storage_path": path,
                    "caption": payload.caption,
                    "visibility": payload.visibility or album["default_visibility"],
                    "taken_at": payload.taken_at,
                },
            )
        ).mappings().one()
        if album["cover_photo_id"] is None:
            await conn.execute(
                text("update public.dog_albums set cover_photo_id = :photo_id where id = :album_id"),
                {"photo_id": photo_id, "album_id": album_id},
            )

    photo = _photo_rec(row)
    url, expires = await storage.create_signed_upload_url(
        bucket=GALLERY_BUCKET,
        path=photo.storage_path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return photo, url, expires


async def update_photo(
    engine: AsyncEngine, *, user_id: str, photo_id: str, payload: DogPhotoUpdate
) -> DogPhotoOut:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update public.dog_photos
                    set caption = coalesce(:caption, caption),
                        visibility = coalesce(:visibility, visibility)
                    where id = :id and owner_id = :user_id and deleted_at is null
                    returning id, album_id, dog_id, storage_path, caption,
                              visibility, taken_at, created_at
                    """
                ),
                {
                    "id": photo_id,
                    "user_id": user_id,
                    "caption": payload.caption,
                    "visibility": payload.visibility,
                },
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Photo not found.")
    return _photo_out(row)


async def soft_delete_photo(engine: AsyncEngine, *, user_id: str, photo_id: str) -> None:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update public.dog_photos
                    set deleted_at = now()
                    where id = :id and owner_id = :user_id and deleted_at is null
                    returning album_id
                    """
                ),
                {"id": photo_id, "user_id": user_id},
            )
        ).mappings().first()
        if not row:
            raise ApiError(ErrorCode.NOT_FOUND, "Photo not found.")
        album_id = str(row["album_id"])
        await conn.execute(
            text(
                """
                update public.dog_albums a
                set cover_photo_id = (
                  select p.id
                  from public.dog_photos p
                  where p.album_id = a.id and p.deleted_at is null
                  order by p.created_at desc, p.id desc
                  limit 1
                )
                where a.id = :album_id and a.cover_photo_id = :photo_id
                """
            ),
            {"album_id": album_id, "photo_id": photo_id},
        )


async def get_visibility(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> DogProfileVisibilityOut:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.dog_profile_visibility (dog_id)
                    values (:dog_id)
                    on conflict (dog_id) do update set dog_id = excluded.dog_id
                    returning dog_id, visibility, consent_version, consented_at,
                              revoked_at, public_slug, whitelist_fields, updated_at
                    """
                ),
                {"dog_id": dog_id},
            )
        ).mappings().one()
    return _visibility_out(row)


async def update_visibility(
    engine: AsyncEngine, *, user_id: str, dog_id: str, payload: DogProfileVisibilityUpdate
) -> DogProfileVisibilityOut:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    if payload.visibility == "PUBLIC" and not payload.consent_version:
        raise ApiError(
            ErrorCode.VALIDATION_FAILED,
            "Public profile requires an explicit consent_version.",
        )

    async with engine.begin() as conn:
        if payload.visibility == "PUBLIC":
            row = (
                await conn.execute(
                    text(
                        """
                        insert into public.dog_profile_visibility (
                          dog_id, visibility, consent_version, consented_at,
                          revoked_at, public_slug, whitelist_fields, updated_at
                        ) values (
                          :dog_id, 'PUBLIC', :consent_version, now(), null,
                          :public_slug, coalesce(cast(:whitelist_fields as text[]), '{name,breed_label,age_stage,size}'::text[]), now()
                        )
                        on conflict (dog_id) do update set
                          visibility = 'PUBLIC',
                          consent_version = excluded.consent_version,
                          consented_at = now(),
                          revoked_at = null,
                          public_slug = coalesce(excluded.public_slug, public.dog_profile_visibility.public_slug),
                          whitelist_fields = coalesce(excluded.whitelist_fields, public.dog_profile_visibility.whitelist_fields),
                          updated_at = now()
                        returning dog_id, visibility, consent_version, consented_at,
                                  revoked_at, public_slug, whitelist_fields, updated_at
                        """
                    ),
                    {
                        "dog_id": dog_id,
                        "consent_version": payload.consent_version,
                        "public_slug": payload.public_slug,
                        "whitelist_fields": payload.whitelist_fields,
                    },
                )
            ).mappings().one()
        else:
            row = (
                await conn.execute(
                    text(
                        """
                        insert into public.dog_profile_visibility (
                          dog_id, visibility, revoked_at, updated_at
                        ) values (
                          :dog_id, 'PRIVATE', now(), now()
                        )
                        on conflict (dog_id) do update set
                          visibility = 'PRIVATE',
                          revoked_at = now(),
                          updated_at = now()
                        returning dog_id, visibility, consent_version, consented_at,
                                  revoked_at, public_slug, whitelist_fields, updated_at
                        """
                    ),
                    {"dog_id": dog_id},
                )
            ).mappings().one()
    return _visibility_out(row)
