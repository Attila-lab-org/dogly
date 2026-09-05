"""PostgreSQL repository for digestive and nutrition flows."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import Settings
from app.contracts.api import (
    FecalInitRequest,
    FeedingPeriodCreate,
    FoodScanInitRequest,
    FoodVerifyRequest,
)
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain
from app.domains import dogs_db
from app.domains.billing import QuotaExceeded
from app.domains.db import reserve_usage_sql
from app.domains.models import FecalEventRec, FeedingPeriodRec, FoodProductRec
from app.domains.repository import new_id
from app.providers.base import JobQueue, StorageProvider

DIGESTIVE_BUCKET = "digestive-raw"
FOOD_BUCKET = "food-labels"


def _uuid_id() -> str:
    value = new_id()
    if len(value) == 32:
        return f"{value[:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
    return value


def _record(row: Mapping[str, Any]) -> dict[str, Any]:
    data = dict(row)
    for key in ("id", "dog_id", "user_id", "owner_id", "food_product_id"):
        if data.get(key) is not None:
            data[key] = str(data[key])
    return data


def _fecal_from_row(row: Mapping[str, Any]) -> FecalEventRec:
    data = _record(row)
    if data.get("safety_flags") is None:
        data["safety_flags"] = []
    if data.get("consistency") is not None:
        data["consistency"] = str(data["consistency"]).lower()
    return FecalEventRec.model_validate(data)


def _food_from_row(row: Mapping[str, Any]) -> FoodProductRec:
    data = _record(row)
    data["image_path"] = data.pop("label_image_path", None)
    data["dog_id"] = data.get("dog_id") or ""
    data["client_request_id"] = data.get("client_request_id") or ""
    data["guaranteed_analysis"] = data.get("guaranteed_analysis") or {}
    data["extraction_confidence"] = data.get("extraction_confidence") or {}
    return FoodProductRec.model_validate(data)


def _feeding_from_row(row: Mapping[str, Any]) -> FeedingPeriodRec:
    return FeedingPeriodRec.model_validate(_record(row))


def _storage_path(user_id: str, dog_id: str, event_id: str) -> str:
    return f"users/{user_id}/dogs/{dog_id}/digestive/{event_id}/{new_id()}.jpg"


def _food_storage_path(user_id: str, dog_id: str, product_id: str) -> str:
    return f"users/{user_id}/dogs/{dog_id}/food_labels/{product_id}/{new_id()}.jpg"


async def init_fecal_event(
    engine: AsyncEngine,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    payload: FecalInitRequest,
) -> tuple[FecalEventRec, str, object, bool]:
    dog = await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=payload.dog_id)

    async with engine.begin() as conn:
        existing = (
            await conn.execute(
                text(
                    """
                    select *
                    from public.fecal_events
                    where user_id = :user_id and client_request_id = :crid
                    """
                ),
                {"user_id": user_id, "crid": payload.client_request_id},
            )
        ).mappings().first()
        if existing:
            event = _fecal_from_row(existing)
            if event.status in ("DRAFT", "UPLOADING"):
                url, expires = await storage.create_signed_upload_url(
                    bucket=DIGESTIVE_BUCKET,
                    path=event.image_path,
                    content_type=event.content_type,
                    ttl_seconds=settings.storage_signed_url_ttl_seconds,
                )
                return event, url, expires, False
            raise ApiError(
                ErrorCode.IDEMPOTENCY_CONFLICT,
                "A fecal event with this client_request_id is already being processed.",
            )

        event_id = _uuid_id()
        path = _storage_path(user_id, dog.id, event_id)

        reserved = await reserve_usage_sql(
            engine,
            user_id=user_id,
            domain=AnalysisDomain.DIGESTIVE.value,
            reference_id=event_id,
        )
        if not reserved.get("granted", False) and reserved.get("reason") not in (
            "ALREADY_RESERVED",
            "RESERVED",
        ):
            raise QuotaExceeded(AnalysisDomain.DIGESTIVE)

        row = (
            await conn.execute(
                text(
                    """
                    insert into public.fecal_events (
                      id, dog_id, user_id, client_request_id, image_path,
                      bytes, content_type, status, upload_completed
                    ) values (
                      :id, :dog_id, :user_id, :client_request_id, :image_path,
                      :bytes, :content_type, 'UPLOADING', false
                    )
                    returning *
                    """
                ),
                {
                    "id": event_id,
                    "dog_id": dog.id,
                    "user_id": user_id,
                    "client_request_id": payload.client_request_id,
                    "image_path": path,
                    "bytes": payload.bytes,
                    "content_type": payload.content_type,
                },
            )
        ).mappings().one()

    event = _fecal_from_row(row)
    url, expires = await storage.create_signed_upload_url(
        bucket=DIGESTIVE_BUCKET,
        path=path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return event, url, expires, True


async def complete_fecal_event(
    engine: AsyncEngine,
    *,
    storage: StorageProvider,
    queue: JobQueue,
    user_id: str,
    event_id: str,
) -> FecalEventRec:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text("select * from public.fecal_events where id = :id and user_id = :user_id"),
                {"id": event_id, "user_id": user_id},
            )
        ).mappings().first()
        if not row:
            raise ApiError(ErrorCode.NOT_FOUND, "Digestive event not found")
        event = _fecal_from_row(row)
        if event.status not in ("DRAFT", "UPLOADING"):
            return event

    ok = await storage.object_exists(
        bucket=DIGESTIVE_BUCKET, path=event.image_path, expected_bytes=event.bytes
    )
    if not ok:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Uploaded object failed validation.", retryable=True)

    task_id = await queue.enqueue(
        task_type="digestive_analysis",
        payload={"event_id": event.id, "user_id": user_id},
    )
    job_id = _uuid_id()

    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update public.fecal_events
                    set upload_completed = true, status = 'QUEUED'
                    where id = :id and user_id = :user_id
                    returning *
                    """
                ),
                {"id": event.id, "user_id": user_id},
            )
        ).mappings().one()
        await conn.execute(
            text(
                """
                insert into internal.analysis_jobs (
                  id, job_type, domain, event_id, status, task_id
                ) values (
                  :id, 'DIGESTIVE_ANALYSIS', 'DIGESTIVE', :event_id, 'PENDING', :task_id
                )
                """
            ),
            {"id": job_id, "event_id": event.id, "task_id": task_id},
        )
    return _fecal_from_row(row)


async def get_fecal_event(engine: AsyncEngine, *, user_id: str, event_id: str) -> FecalEventRec:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text("select * from public.fecal_events where id = :id and user_id = :user_id"),
                {"id": event_id, "user_id": user_id},
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Digestive event not found")
    return _fecal_from_row(row)


async def load_fecal_event(engine: AsyncEngine, *, event_id: str) -> FecalEventRec | None:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text("select * from public.fecal_events where id = :id"),
                {"id": event_id},
            )
        ).mappings().first()
    return _fecal_from_row(row) if row else None


async def save_fecal_state(engine: AsyncEngine, event: FecalEventRec) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update public.fecal_events set
                  status = :status,
                  observation_json = CAST(:observation_json AS jsonb),
                  fecal_score_estimate = :fecal_score_estimate,
                  consistency = :consistency,
                  color = :color,
                  confidence_band = :confidence_band,
                  safety_flags = CAST(:safety_flags AS jsonb),
                  summary = :summary,
                  quota_committed = :quota_committed,
                  quota_refunded = :quota_refunded,
                  expires_at = :expires_at,
                  completed_at = :completed_at
                where id = :id and user_id = :user_id
                """
            ),
            {
                "id": event.id,
                "user_id": event.user_id,
                "status": event.status,
                "observation_json": json.dumps(event.observation_json) if event.observation_json else None,
                "fecal_score_estimate": event.fecal_score_estimate,
                "consistency": event.consistency.upper() if event.consistency else None,
                "color": event.color,
                "confidence_band": event.confidence_band.value
                if getattr(event.confidence_band, "value", None)
                else event.confidence_band,
                "safety_flags": json.dumps(event.safety_flags or []),
                "summary": event.summary,
                "quota_committed": event.quota_committed,
                "quota_refunded": event.quota_refunded,
                "expires_at": event.expires_at,
                "completed_at": event.completed_at,
            },
        )


async def init_food_scan(
    engine: AsyncEngine,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    payload: FoodScanInitRequest,
) -> tuple[FoodProductRec, str, object]:
    dog = await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=payload.dog_id)

    async with engine.begin() as conn:
        existing = (
            await conn.execute(
                text(
                    """
                    select *
                    from public.food_products
                    where owner_id = :owner_id and client_request_id = :crid
                    """
                ),
                {"owner_id": user_id, "crid": payload.client_request_id},
            )
        ).mappings().first()
        if existing:
            product = _food_from_row(existing)
            url, expires = await storage.create_signed_upload_url(
                bucket=FOOD_BUCKET,
                path=product.image_path or "",
                content_type=payload.content_type,
                ttl_seconds=settings.storage_signed_url_ttl_seconds,
            )
            return product, url, expires

        product_id = _uuid_id()
        path = _food_storage_path(user_id, dog.id, product_id)
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.food_products (
                      id, owner_id, dog_id, label_image_path, client_request_id,
                      bytes, content_type
                    ) values (
                      :id, :owner_id, :dog_id, :label_image_path, :client_request_id,
                      :bytes, :content_type
                    )
                    returning *
                    """
                ),
                {
                    "id": product_id,
                    "owner_id": user_id,
                    "dog_id": dog.id,
                    "label_image_path": path,
                    "client_request_id": payload.client_request_id,
                    "bytes": payload.bytes,
                    "content_type": payload.content_type,
                },
            )
        ).mappings().one()

    product = _food_from_row(row)
    url, expires = await storage.create_signed_upload_url(
        bucket=FOOD_BUCKET,
        path=path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return product, url, expires


async def verify_food_product(
    engine: AsyncEngine, *, user_id: str, food_id: str, payload: FoodVerifyRequest
) -> FoodProductRec:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update public.food_products
                    set brand = :brand,
                        name = :name,
                        ingredients_raw = :ingredients_raw,
                        guaranteed_analysis = CAST(:guaranteed_analysis AS jsonb),
                        calories = :calories,
                        feeding_directions = :feeding_directions,
                        verified_at = now(),
                        updated_at = now()
                    where id = :id and owner_id = :owner_id
                    returning *
                    """
                ),
                {
                    "id": food_id,
                    "owner_id": user_id,
                    "brand": payload.brand,
                    "name": payload.name,
                    "ingredients_raw": payload.ingredients_raw,
                    "guaranteed_analysis": payload.guaranteed_analysis.model_dump_json(),
                    "calories": payload.guaranteed_analysis.calories,
                    "feeding_directions": payload.feeding_directions,
                },
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Food product not found")
    return _food_from_row(row)


async def create_feeding_period(
    engine: AsyncEngine, *, user_id: str, payload: FeedingPeriodCreate
) -> FeedingPeriodRec:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=payload.dog_id)
    async with engine.begin() as conn:
        product = (
            await conn.execute(
                text(
                    """
                    select id
                    from public.food_products
                    where id = :id and owner_id = :owner_id and verified_at is not null
                    """
                ),
                {"id": payload.food_product_id, "owner_id": user_id},
            )
        ).mappings().first()
        if not product:
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "Food product must be verified before starting a feeding period.",
            )
        await conn.execute(
            text(
                """
                update public.feeding_periods
                set end_at = :start_at, updated_at = now()
                where dog_id = :dog_id and end_at is null
                """
            ),
            {"dog_id": payload.dog_id, "start_at": payload.start_at},
        )
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.feeding_periods (
                      dog_id, food_product_id, start_at, quantity_per_day,
                      treats_notes, transition_notes
                    ) values (
                      :dog_id, :food_product_id, :start_at, :quantity_per_day,
                      :treats_notes, :transition_notes
                    )
                    returning id, dog_id, food_product_id, start_at, end_at,
                              quantity_per_day, treats_notes, transition_notes
                    """
                ),
                {
                    "dog_id": payload.dog_id,
                    "food_product_id": payload.food_product_id,
                    "start_at": payload.start_at,
                    "quantity_per_day": payload.quantity_per_day,
                    "treats_notes": payload.treats_notes,
                    "transition_notes": payload.transition_notes,
                },
            )
        ).mappings().one()
    return _feeding_from_row(row)


async def digestive_summary(engine: AsyncEngine, *, user_id: str, dog_id: str) -> dict:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select fecal_score_estimate, safety_flags
                    from public.fecal_events
                    where dog_id = :dog_id
                      and user_id = :user_id
                      and status = 'COMPLETED'
                      and fecal_score_estimate is not null
                    order by created_at asc, id asc
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()
    if not rows:
        return {
            "dog_id": dog_id,
            "rolling_score": None,
            "variability": None,
            "data_sufficiency": "insufficient",
            "recent_trend": None,
            "safety_flags": [],
        }

    scores = [int(row["fecal_score_estimate"]) for row in rows]
    rolling = sum(scores) / len(scores)
    variability = max(scores) - min(scores) if len(scores) > 1 else 0.0
    sufficiency = "sufficient" if len(scores) >= 3 else "low"
    trend = None
    if len(scores) >= 2:
        delta = scores[-1] - scores[0]
        trend = "improving" if delta < 0 else ("worsening" if delta > 0 else "stable")
    flags: list[dict] = []
    for row in rows[-3:]:
        flags.extend(row["safety_flags"] or [])
    return {
        "dog_id": dog_id,
        "rolling_score": round(rolling, 2),
        "variability": float(variability),
        "data_sufficiency": sufficiency,
        "recent_trend": trend,
        "safety_flags": flags,
    }
