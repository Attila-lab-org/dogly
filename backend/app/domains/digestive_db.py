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
    FeedingPeriodUpdate,
    FoodLabelExtraction,
    FoodManualCreateRequest,
    FoodScanInitRequest,
    FoodVerifyRequest,
)
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain
from app.domains import dogs_db, weight_db
from app.domains.billing import QuotaExceeded
from app.domains.db import reserve_usage_on_conn
from app.domains.digestive_intelligence import (
    DIGESTIVE_BASELINE_VERSION,
    DigestiveContext,
    count_recent_windows,
)
from app.domains.ids import require_uuid
from app.domains.models import FecalEventRec, FeedingPeriodRec, FoodProductRec
from app.domains.repository import new_id
from app.providers.base import JobQueue, ProviderUsage, StorageProvider

DIGESTIVE_BUCKET = "digestive-raw"
FOOD_BUCKET = "food-labels"


def _digestive_period_label(month: int) -> tuple[str, str]:
    if month in {12, 1, 2}:
        return "winter", "inverno"
    if month in {3, 4, 5}:
        return "spring", "primavera"
    if month in {6, 7, 8}:
        return "summer", "estate"
    return "autumn", "autunno"


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
    # Retention intentionally clears the private storage path while preserving
    # the observation and its owner-facing result in the diary.
    data["image_path"] = data.get("image_path") or ""
    if data.get("safety_flags") is None:
        data["safety_flags"] = []
    if data.get("consistency") is not None:
        data["consistency"] = str(data["consistency"]).lower()
    data["owner_context_json"] = data.get("owner_context_json") or {}
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


def _food_storage_path(
    user_id: str,
    dog_id: str,
    product_id: str,
    content_type: str,
) -> str:
    extension = {"image/png": "png", "image/webp": "webp"}.get(
        content_type, "jpg"
    )
    return (
        f"users/{user_id}/dogs/{dog_id}/food_labels/"
        f"{product_id}/{new_id()}.{extension}"
    )


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

        reserved = await reserve_usage_on_conn(
            conn,
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
    require_uuid(event_id, not_found="Digestive event not found")
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

    job_id = _uuid_id()

    # Claim atomically before enqueue to prevent duplicate paid workflows.
    async with engine.begin() as conn:
        claimed = (
            await conn.execute(
                text(
                    """
                    update public.fecal_events
                    set upload_completed = true, status = 'QUEUED'
                    where id = :id and user_id = :user_id
                      and status in ('DRAFT', 'UPLOADING')
                    returning *
                    """
                ),
                {"id": event.id, "user_id": user_id},
            )
        ).mappings().first()
        if not claimed:
            current = (
                await conn.execute(
                    text(
                        "select * from public.fecal_events where id = :id and user_id = :user_id"
                    ),
                    {"id": event.id, "user_id": user_id},
                )
            ).mappings().one()
            return _fecal_from_row(current)
        await conn.execute(
            text(
                """
                insert into internal.analysis_jobs (
                  id, job_type, domain, event_id, status
                ) values (
                  :id, 'DIGESTIVE_ANALYSIS', 'DIGESTIVE', :event_id, 'PENDING'
                )
                on conflict (event_id) do update set
                  status = 'PENDING',
                  task_id = null,
                  last_error_code = null,
                  scheduled_at = now(),
                  started_at = null,
                  completed_at = null,
                  updated_at = now()
                """
            ),
            {"id": job_id, "event_id": event.id},
        )
    event = _fecal_from_row(claimed)

    try:
        task_id = await queue.enqueue(
            task_type="digestive_analysis",
            payload={"event_id": event.id, "user_id": user_id},
        )
    except Exception:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    update public.fecal_events
                    set upload_completed = false, status = 'UPLOADING'
                    where id = :id and status = 'QUEUED'
                    """
                ),
                {"id": event.id},
            )
            await conn.execute(
                text(
                    """
                    update internal.analysis_jobs
                    set status = 'FAILED',
                        last_error_code = 'QUEUE_DISPATCH_FAILED',
                        completed_at = now(),
                        updated_at = now()
                    where event_id = :id and status = 'PENDING'
                    """
                ),
                {"id": event.id},
            )
        raise

    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update internal.analysis_jobs
                set task_id = :task_id, updated_at = now()
                where event_id = :event_id
                """
            ),
            {"event_id": event.id, "task_id": task_id},
        )
    return event


async def get_fecal_event(engine: AsyncEngine, *, user_id: str, event_id: str) -> FecalEventRec:
    require_uuid(event_id, not_found="Digestive event not found")
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


async def update_owner_context(
    engine: AsyncEngine,
    *,
    user_id: str,
    event_id: str,
    answers: dict[str, bool],
) -> FecalEventRec:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update public.fecal_events
                    set owner_context_json = owner_context_json || cast(:answers as jsonb)
                    where id = cast(:event_id as uuid)
                      and user_id = cast(:user_id as uuid)
                      and status not in (
                        'REJECTED_QUALITY',
                        'FAILED_TERMINAL',
                        'FAILED',
                        'CANCELLED'
                      )
                    returning *
                    """
                ),
                {
                    "event_id": event_id,
                    "user_id": user_id,
                    "answers": json.dumps(answers),
                },
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Active digestive event not found")
    return _fecal_from_row(row)


async def get_fecal_context(
    engine: AsyncEngine, *, user_id: str, event_id: str
) -> tuple[str | None, str | None]:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select food.name as active_food_name,
                           case
                             when base.data_sufficiency not in ('PARTIAL', 'SUFFICIENT')
                               or event.fecal_score_estimate is null
                               or base.rolling_score is null then null
                             when event.fecal_score_estimate < base.rolling_score - 0.75
                               then 'BELOW_USUAL'
                             when event.fecal_score_estimate > base.rolling_score + 0.75
                               then 'ABOVE_USUAL'
                             else 'NEAR_USUAL'
                           end as baseline_comparison
                    from public.fecal_events event
                    left join lateral (
                      select fp.food_product_id
                      from public.feeding_periods fp
                      where fp.dog_id = event.dog_id
                        and fp.start_at <= event.created_at
                        and (fp.end_at is null or fp.end_at >= event.created_at)
                      order by fp.start_at desc, fp.id desc
                      limit 1
                    ) active_period on true
                    left join public.food_products food
                      on food.id = coalesce(
                        (select fp.food_product_id
                         from public.feeding_periods fp
                         where fp.id = event.feeding_period_id),
                        active_period.food_product_id
                      )
                    left join lateral (
                      select rolling_score, data_sufficiency
                      from public.digestive_baselines db
                      where db.dog_id = event.dog_id
                        and db.calculated_at <= event.created_at
                      order by db.calculated_at desc, db.id desc
                      limit 1
                    ) base on true
                    where event.id = cast(:event_id as uuid)
                      and event.user_id = cast(:user_id as uuid)
                    """
                ),
                {"event_id": event_id, "user_id": user_id},
            )
        ).mappings().first()
    if not row:
        return None, None
    return row["active_food_name"], row["baseline_comparison"]


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
                  intelligence_json = CAST(:intelligence_json AS jsonb),
                  owner_context_json = owner_context_json
                    || CAST(:owner_context_json AS jsonb),
                  fecal_score_estimate = :fecal_score_estimate,
                  consistency = :consistency,
                  color = :color,
                  confidence_band = :confidence_band,
                  safety_flags = CAST(:safety_flags AS jsonb),
                  summary = :summary,
                  quota_committed = :quota_committed,
                  quota_refunded = :quota_refunded,
                  attempt_count = :attempt_count,
                  last_error_code = :last_error_code,
                  image_sha256 = :image_sha256,
                  learning_eligible = :learning_eligible,
                  image_quality = :image_quality,
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
                "intelligence_json": json.dumps(event.intelligence_json)
                if event.intelligence_json
                else None,
                "owner_context_json": json.dumps(event.owner_context_json),
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
                "attempt_count": event.attempt_count,
                "last_error_code": event.last_error_code,
                "image_sha256": event.image_sha256,
                "learning_eligible": event.learning_eligible,
                "image_quality": event.image_quality,
                "expires_at": event.expires_at,
                "completed_at": event.completed_at,
            },
        )


async def save_digestive_observation_audit(
    engine: AsyncEngine,
    *,
    fecal_event_id: str,
    observation_json: dict[str, Any],
    usage: ProviderUsage,
) -> None:
    """Persist the normalized visual observation outside the serving row."""
    meta = observation_json.get("meta") or {}
    token_usage = {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "media_bytes": usage.media_bytes,
        "cost_usd": usage.cost_usd,
        "request_id": usage.request_id,
    }
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                insert into internal.digestive_observations (
                  fecal_event_id, provider, model, version, schema_version,
                  observation_json, token_usage, latency_ms
                ) values (
                  cast(:event_id as uuid), :provider, :model, :version, :schema_version,
                  cast(:observation_json as jsonb), cast(:token_usage as jsonb), :latency_ms
                )
                on conflict (fecal_event_id) do update set
                  provider = excluded.provider,
                  model = excluded.model,
                  version = excluded.version,
                  schema_version = excluded.schema_version,
                  observation_json = excluded.observation_json,
                  token_usage = excluded.token_usage,
                  latency_ms = excluded.latency_ms
                """
            ),
            {
                "event_id": fecal_event_id,
                "provider": str(meta.get("provider") or usage.provider),
                "model": str(meta.get("model") or usage.model),
                "version": observation_json.get("normalizer_version"),
                "schema_version": str(
                    observation_json.get("schema_version") or "stool_observation.v0"
                ),
                "observation_json": json.dumps(observation_json),
                "token_usage": json.dumps(token_usage),
                "latency_ms": usage.latency_ms,
            },
        )


async def save_digestive_insight(
    engine: AsyncEngine,
    *,
    event: FecalEventRec,
) -> None:
    """Keep one final consumer decision per completed digestive event."""
    if not event.intelligence_json or not event.summary:
        return
    baseline = event.intelligence_json.get("baseline_comparison")
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                delete from public.digestive_insights
                where fecal_event_id = cast(:event_id as uuid)
                """
            ),
            {"event_id": event.id},
        )
        await conn.execute(
            text(
                """
                insert into public.digestive_insights (
                  dog_id, fecal_event_id, summary, trend_code,
                  safety_flags, policy_version
                ) values (
                  cast(:dog_id as uuid), cast(:event_id as uuid), :summary, :trend_code,
                  cast(:safety_flags as jsonb), :policy_version
                )
                """
            ),
            {
                "dog_id": event.dog_id,
                "event_id": event.id,
                "summary": event.summary,
                "trend_code": str(baseline) if baseline else None,
                "safety_flags": json.dumps(event.safety_flags or []),
                "policy_version": event.intelligence_json.get("reasoning_version"),
            },
        )


async def load_digestive_context(
    engine: AsyncEngine, *, event: FecalEventRec
) -> DigestiveContext:
    """Load only persisted facts available at the event timestamp."""
    async with engine.connect() as conn:
        profile = (
            await conn.execute(
                text(
                    """
                    select d.name, d.age_stage, d.size, d.breed_label, d.weight_kg,
                           food.id as active_food_product_id,
                           food.name as active_food_name,
                           period.food_product_id is not null as has_active_food,
                           period.quantity_per_day,
                           case
                             when period.start_at is null then null
                             else greatest(
                               0,
                               floor(extract(epoch from (event.created_at - period.start_at)) / 86400)
                             )::integer
                           end as food_started_days_ago
                    from public.fecal_events event
                    join public.dogs d on d.id = event.dog_id
                    left join lateral (
                      select fp.food_product_id, fp.start_at, fp.transition_notes,
                             fp.quantity_per_day
                      from public.feeding_periods fp
                      where fp.dog_id = event.dog_id
                        and fp.start_at <= event.created_at
                        and (fp.end_at is null or fp.end_at >= event.created_at)
                      order by fp.start_at desc, fp.id desc
                      limit 1
                    ) period on true
                    left join public.food_products food
                      on food.id = period.food_product_id
                    where event.id = cast(:event_id as uuid)
                    """
                ),
                {"event_id": event.id},
            )
        ).mappings().one()
        prior = (
            await conn.execute(
                text(
                    """
                    select prior.fecal_score_estimate,
                           prior.consistency,
                           prior.created_at,
                           prior.learning_eligible,
                           prior.image_sha256,
                           (
                             select fp.food_product_id
                             from public.feeding_periods fp
                             join public.food_products food
                               on food.id = fp.food_product_id
                              and food.verified_at is not null
                             where fp.dog_id = prior.dog_id
                               and fp.start_at <= prior.created_at
                               and (fp.end_at is null or fp.end_at >= prior.created_at)
                             order by fp.start_at desc, fp.id desc
                             limit 1
                           ) as food_product_id
                    from public.fecal_events prior
                    where prior.dog_id = cast(:dog_id as uuid)
                      and prior.status = 'COMPLETED'
                      and prior.id <> cast(:event_id as uuid)
                      and prior.created_at < :created_at
                      and (
                        cast(:image_sha256 as text) is null
                        or prior.image_sha256 is distinct from cast(:image_sha256 as text)
                      )
                    order by prior.created_at desc, prior.id desc
                    limit 36
                    """
                ),
                {
                    "dog_id": event.dog_id,
                    "event_id": event.id,
                    "created_at": event.created_at,
                    "image_sha256": event.image_sha256,
                },
            )
        ).mappings().all()
    ordered: list[Any] = []
    seen_hashes: set[str] = set()
    for row in reversed(prior):
        fingerprint = str(row.get("image_sha256") or "")
        if fingerprint:
            if fingerprint in seen_hashes:
                continue
            seen_hashes.add(fingerprint)
        ordered.append(row)
    answers = event.owner_context_json
    active_food_id = profile["active_food_product_id"]
    season_key, season_label = _digestive_period_label(event.created_at.month)
    scored = [
        row
        for row in ordered
        if row["fecal_score_estimate"] is not None
        and row.get("learning_eligible") is True
    ]
    nutrition = await weight_db.nutrition_history_snapshot(
        engine, dog_id=event.dog_id
    )
    return DigestiveContext(
        dog_name=profile["name"],
        age_stage=profile["age_stage"],
        size=profile["size"],
        breed_label=profile.get("breed_label"),
        weight_kg=profile["weight_kg"],
        active_food_name=profile["active_food_name"],
        active_food_product_id=(
            str(profile["active_food_product_id"])
            if profile.get("active_food_product_id") is not None
            else None
        ),
        has_active_food=bool(profile.get("has_active_food")),
        quantity_per_day=profile.get("quantity_per_day"),
        food_started_days_ago=profile["food_started_days_ago"],
        current_food_prior_scores=[
            int(row["fecal_score_estimate"])
            for row in scored
            if active_food_id is not None
            and row["food_product_id"] == active_food_id
        ],
        previous_food_scores=[
            int(row["fecal_score_estimate"])
            for row in scored
            if active_food_id is not None
            and row["food_product_id"] is not None
            and row["food_product_id"] != active_food_id
        ],
        season_label=season_label,
        same_season_prior_scores=[
            int(row["fecal_score_estimate"])
            for row in scored
            if _digestive_period_label(row["created_at"].month)[0] == season_key
        ],
        other_season_scores=[
            int(row["fecal_score_estimate"])
            for row in scored
            if _digestive_period_label(row["created_at"].month)[0] != season_key
        ],
        prior_scores=[
            int(row["fecal_score_estimate"])
            for row in scored
        ],
        prior_consistencies=[
            str(row["consistency"]).lower()
            for row in ordered
            if row["consistency"] is not None
        ],
        recent_episode_count_24h=sum(
            (event.created_at - row["created_at"]).total_seconds() <= 86_400
            for row in ordered
        ),
        recent_watery_count_24h=sum(
            str(row["consistency"]).lower() == "watery"
            and (event.created_at - row["created_at"]).total_seconds() <= 86_400
            for row in ordered
        ),
        vomiting_today=answers.get("vomiting_today"),
        reduced_activity_today=answers.get("reduced_activity_today"),
        unusual_food_48h=answers.get("unusual_food_48h"),
        appetite_reduced=answers.get("appetite_reduced"),
        straining_or_urgency=answers.get("straining_or_urgency"),
        supplements_or_medication=answers.get("supplements_or_medication"),
        **count_recent_windows(
            event.created_at,
            ordered,
            consistency_of=lambda row: str(row["consistency"] or "").lower(),
            created_of=lambda row: row["created_at"],
        ),
        latest_weight_kg=nutrition.get("latest_kg"),
        weight_delta_kg=nutrition.get("delta_kg"),
    )


async def refresh_digestive_baseline(
    engine: AsyncEngine, *, dog_id: str
) -> None:
    """Persist an immutable baseline snapshot after a completed observation."""
    async with engine.begin() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    with ranked as (
                      select fecal_score_estimate,
                             created_at,
                             id,
                             row_number() over (
                               partition by coalesce(image_sha256, id::text)
                               order by created_at desc, id desc
                             ) as fingerprint_rank
                      from public.fecal_events
                      where dog_id = cast(:dog_id as uuid)
                        and status = 'COMPLETED'
                        and fecal_score_estimate is not null
                        and learning_eligible is true
                    )
                    select fecal_score_estimate
                    from ranked
                    where fingerprint_rank = 1
                    order by created_at desc, id desc
                    limit 12
                    """
                ),
                {"dog_id": dog_id},
            )
        ).scalars().all()
        if not rows:
            return
        scores = [int(value) for value in rows]
        rolling = sum(scores) / len(scores)
        variability = max(scores) - min(scores) if len(scores) > 1 else 0
        sufficiency = (
            "SUFFICIENT" if len(scores) >= 5 else "PARTIAL" if len(scores) >= 3 else "INSUFFICIENT"
        )
        await conn.execute(
            text(
                """
                insert into public.digestive_baselines (
                  dog_id, rolling_score, frequency_stats, variability,
                  data_sufficiency, version
                ) values (
                  cast(:dog_id as uuid), :rolling_score,
                  cast(:frequency_stats as jsonb), :variability,
                  :data_sufficiency, :version
                )
                """
            ),
            {
                "dog_id": dog_id,
                "rolling_score": round(rolling, 2),
                "frequency_stats": json.dumps({"sample_count": len(scores)}),
                "variability": variability,
                "data_sufficiency": sufficiency,
                "version": DIGESTIVE_BASELINE_VERSION,
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
        path = _food_storage_path(
            user_id,
            dog.id,
            product_id,
            payload.content_type,
        )
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
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                select internal.arm_media_expiry(
                  'food_products', cast(:food_id as uuid), 'FOOD_LABEL'
                )
                """
            ),
            {"food_id": food_id},
        )
    return _food_from_row(row)


async def apply_food_label_extraction(
    engine: AsyncEngine,
    *,
    user_id: str,
    food_id: str,
    extraction: FoodLabelExtraction,
) -> FoodProductRec:
    """Persist extracted fields without marking them as owner-verified."""
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update public.food_products
                    set brand = :brand,
                        name = :name,
                        ingredients_raw = :ingredients_raw,
                        guaranteed_analysis = cast(:guaranteed_analysis as jsonb),
                        calories = :calories,
                        feeding_directions = :feeding_directions,
                        extraction_confidence = cast(:extraction_confidence as jsonb),
                        updated_at = now()
                    where id = :id
                      and owner_id = :owner_id
                      and verified_at is null
                    returning *
                    """
                ),
                {
                    "id": food_id,
                    "owner_id": user_id,
                    "brand": extraction.brand,
                    "name": extraction.name,
                    "ingredients_raw": extraction.ingredients_raw,
                    "guaranteed_analysis": extraction.guaranteed_analysis.model_dump_json(),
                    "calories": extraction.guaranteed_analysis.calories,
                    "feeding_directions": extraction.feeding_directions,
                    "extraction_confidence": json.dumps(
                        extraction.extraction_confidence
                    ),
                },
            )
        ).mappings().first()
    if row:
        return _food_from_row(row)
    return await get_food_product(engine, user_id=user_id, food_id=food_id)


async def create_manual_food_product(
    engine: AsyncEngine,
    *,
    user_id: str,
    payload: FoodManualCreateRequest,
) -> FoodProductRec:
    """Create a verified food from owner-entered details, without media."""
    dog = await dogs_db.get_owned_dog(
        engine, user_id=user_id, dog_id=payload.dog_id
    )
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    insert into public.food_products (
                      owner_id, dog_id, client_request_id, brand, name,
                      ingredients_raw, guaranteed_analysis, calories,
                      feeding_directions, verified_at
                    ) values (
                      :owner_id, :dog_id, :client_request_id, :brand, :name,
                      :ingredients_raw, cast(:guaranteed_analysis as jsonb),
                      :calories, :feeding_directions, now()
                    )
                    on conflict (owner_id, client_request_id) do update
                    set updated_at = public.food_products.updated_at
                    returning *
                    """
                ),
                {
                    "owner_id": user_id,
                    "dog_id": dog.id,
                    "client_request_id": payload.client_request_id,
                    "brand": payload.brand,
                    "name": payload.name,
                    "ingredients_raw": payload.ingredients_raw,
                    "guaranteed_analysis": payload.guaranteed_analysis.model_dump_json(),
                    "calories": payload.guaranteed_analysis.calories,
                    "feeding_directions": payload.feeding_directions,
                },
            )
        ).mappings().one()
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
        open_row = (
            await conn.execute(
                text(
                    """
                    select id, dog_id, food_product_id, start_at, end_at,
                           quantity_per_day, treats_notes, transition_notes
                    from public.feeding_periods
                    where dog_id = :dog_id and end_at is null
                    order by start_at desc, id desc
                    limit 1
                    """
                ),
                {"dog_id": payload.dog_id},
            )
        ).mappings().first()
        if (
            open_row is not None
            and str(open_row["food_product_id"]) == str(payload.food_product_id)
        ):
            updated = (
                await conn.execute(
                    text(
                        """
                        update public.feeding_periods
                        set quantity_per_day = coalesce(:quantity_per_day, quantity_per_day),
                            treats_notes = coalesce(:treats_notes, treats_notes),
                            transition_notes = coalesce(:transition_notes, transition_notes),
                            updated_at = now()
                        where id = :id
                        returning id, dog_id, food_product_id, start_at, end_at,
                                  quantity_per_day, treats_notes, transition_notes
                        """
                    ),
                    {
                        "id": open_row["id"],
                        "quantity_per_day": payload.quantity_per_day,
                        "treats_notes": payload.treats_notes,
                        "transition_notes": payload.transition_notes,
                    },
                )
            ).mappings().one()
            return _feeding_from_row(updated)
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


async def update_feeding_period(
    engine: AsyncEngine,
    *,
    user_id: str,
    period_id: str,
    payload: FeedingPeriodUpdate,
) -> FeedingPeriodRec:
    require_uuid(period_id, not_found="Feeding period not found")
    updates = payload.model_dump(exclude_unset=True)
    async with engine.begin() as conn:
        existing = (
            await conn.execute(
                text(
                    """
                    select fp.id, fp.dog_id, fp.food_product_id, fp.start_at, fp.end_at,
                           fp.quantity_per_day, fp.treats_notes, fp.transition_notes
                    from public.feeding_periods fp
                    join public.dogs d on d.id = fp.dog_id
                    where fp.id = :id and d.owner_id = :user_id
                    """
                ),
                {"id": period_id, "user_id": user_id},
            )
        ).mappings().first()
        if existing is None:
            raise ApiError(ErrorCode.NOT_FOUND, "Feeding period not found")
        if existing["end_at"] is not None:
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "Only the active feeding period can be updated.",
            )
        if not updates:
            return _feeding_from_row(existing)
        assignments = ["updated_at = now()"]
        params: dict[str, Any] = {"id": period_id}
        for field in ("quantity_per_day", "treats_notes", "transition_notes"):
            if field in updates:
                assignments.append(f"{field} = :{field}")
                params[field] = updates[field]
        row = (
            await conn.execute(
                text(
                    f"""
                    update public.feeding_periods
                    set {", ".join(assignments)}
                    where id = :id
                    returning id, dog_id, food_product_id, start_at, end_at,
                              quantity_per_day, treats_notes, transition_notes
                    """
                ),
                params,
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
                    select fecal_score_estimate, safety_flags, learning_eligible
                    from public.fecal_events
                    where dog_id = :dog_id
                      and user_id = :user_id
                      and status = 'COMPLETED'
                    order by created_at asc, id asc
                    """
                ),
                {"dog_id": dog_id, "user_id": user_id},
            )
        ).mappings().all()
    flags: list[dict] = []
    for row in rows[-3:]:
        flags.extend(row["safety_flags"] or [])
    scores = [
        int(row["fecal_score_estimate"])
        for row in rows
        if row["fecal_score_estimate"] is not None
        and row.get("learning_eligible") is True
    ][-12:]
    if not scores:
        return {
            "dog_id": dog_id,
            "rolling_score": None,
            "variability": None,
            "data_sufficiency": "insufficient",
            "recent_trend": None,
            "safety_flags": flags,
        }

    rolling = sum(scores) / len(scores)
    variability = max(scores) - min(scores) if len(scores) > 1 else 0.0
    sufficiency = "sufficient" if len(scores) >= 3 else "low"
    trend = None
    if len(scores) >= 2:
        delta = scores[-1] - scores[0]
        trend = "firmer" if delta < 0 else ("softer" if delta > 0 else "stable")
    return {
        "dog_id": dog_id,
        "rolling_score": round(rolling, 2),
        "variability": float(variability),
        "data_sufficiency": sufficiency,
        "recent_trend": trend,
        "safety_flags": flags,
    }


async def list_food_products(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> list[FoodProductRec]:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select *
                    from public.food_products
                    where owner_id = :owner_id
                      and dog_id = cast(:dog_id as uuid)
                    order by created_at desc, id desc
                    """
                ),
                {"owner_id": user_id, "dog_id": dog_id},
            )
        ).mappings().all()
    return [_food_from_row(row) for row in rows]


async def get_food_product(
    engine: AsyncEngine, *, user_id: str, food_id: str
) -> FoodProductRec:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select *
                    from public.food_products
                    where id = :id and owner_id = :owner_id
                    """
                ),
                {"id": food_id, "owner_id": user_id},
            )
        ).mappings().first()
    if not row:
        raise ApiError(ErrorCode.NOT_FOUND, "Food product not found")
    return _food_from_row(row)


async def list_feeding_periods(
    engine: AsyncEngine, *, user_id: str, dog_id: str
) -> list[FeedingPeriodRec]:
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select id, dog_id, food_product_id, start_at, end_at,
                           quantity_per_day, treats_notes, transition_notes
                    from public.feeding_periods
                    where dog_id = cast(:dog_id as uuid)
                    order by start_at desc, id desc
                    """
                ),
                {"dog_id": dog_id},
            )
        ).mappings().all()
    return [_feeding_from_row(row) for row in rows]
