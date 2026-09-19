"""Digestive & nutrition domain service (Spec V1 sez. 19/20).

Shares upload/quota/job infrastructure with behavior (sez. 29.2: no parallel
second architecture). Observation is separate from the deterministic
safety/rule layer (sez. 19.3).
"""

from __future__ import annotations

from typing import Any

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
from app.domains.billing import QuotaService
from app.domains.digestive_intelligence import DigestiveContext, count_recent_windows
from app.domains.digestive_observation import prepare_digestive_observation
from app.domains.digestive_verification import safety_candidate
from app.domains.dogs import get_owned_dog
from app.domains.ids import require_uuid
from app.domains.models import (
    AnalysisJobRec,
    FecalEventRec,
    FeedingPeriodRec,
    FoodProductRec,
)
from app.domains.repository import InMemoryStore, new_id, now_utc
from app.domains.weight_events import nutrition_history_snapshot
from app.providers.base import JobQueue, StorageProvider

DIGESTIVE_BUCKET = "digestive-raw"
FOOD_BUCKET = "food-labels"


def _image_extension(content_type: str) -> str:
    return {"image/png": "png", "image/webp": "webp"}.get(content_type, "jpg")


# Deterministic safety routing (sez. 19.3): these observation candidates route
# to fixed reviewed copy; generated text can never downgrade them.
SAFETY_FLAG_RULES: dict[str, str] = {
    "fresh_blood_candidate": "BLOOD_CANDIDATE",
    "melena_candidate": "MELENA_CANDIDATE",
    "foreign_material_candidate": "FOREIGN_MATERIAL_CANDIDATE",
}


def digestive_period_label(month: int) -> tuple[str, str]:
    if month in {12, 1, 2}:
        return "winter", "inverno"
    if month in {3, 4, 5}:
        return "spring", "primavera"
    if month in {6, 7, 8}:
        return "summer", "estate"
    return "autumn", "autunno"


def deterministic_safety_flags(observation: dict) -> list[dict]:
    prepared = (
        observation
        if observation.get("safety_candidates")
        else prepare_digestive_observation(observation)
    )
    flags: list[dict] = []
    for field, code in SAFETY_FLAG_RULES.items():
        level = safety_candidate(prepared, field)
        if level == "clear_candidate":
            flags.append({"code": code, "severity": "high"})
        elif level == "possible":
            flags.append({"code": code, "severity": "medium"})
    return flags


def contextual_safety_flags(
    observation: dict, context: DigestiveContext
) -> list[dict]:
    """Add owner-confirmed escalation without allowing generated text to decide."""
    flags = deterministic_safety_flags(observation)
    consistency = str(observation.get("consistency") or "unknown").lower()
    if (
        consistency == "watery"
        and context.recent_watery_count_24h >= 1
    ):
        flags.append({"code": "REPEATED_WATERY", "severity": "medium"})
    severe_symptoms = (
        consistency == "watery"
        and context.recent_watery_count_24h >= 1
        and context.vomiting_today is True
    )
    contextual_symptoms = (
        consistency in {"soft", "unformed", "watery"}
        and (
            context.vomiting_today is True
            or context.reduced_activity_today is True
            or context.appetite_reduced is True
        )
    ) or (
        consistency in {"hard", "formed", "soft", "unformed", "watery"}
        and context.straining_or_urgency is True
    )
    if severe_symptoms:
        flags.append({"code": "DIGESTIVE_SYMPTOMS", "severity": "high"})
    elif contextual_symptoms:
        flags.append({"code": "DIGESTIVE_SYMPTOMS", "severity": "medium"})
    return flags


def build_inmemory_digestive_context(
    store: InMemoryStore, *, event: FecalEventRec
) -> DigestiveContext:
    dog = store.dogs[event.dog_id]
    candidate_prior_events = sorted(
        (
            item
            for item in store.fecal_events.values()
            if item.dog_id == event.dog_id
            and item.id != event.id
            and item.status == "COMPLETED"
            and item.created_at < event.created_at
            and (
                not event.image_sha256
                or item.image_sha256 != event.image_sha256
            )
        ),
        key=lambda item: item.created_at,
    )[-36:]
    prior_events: list[FecalEventRec] = []
    seen_hashes: set[str] = set()
    for item in candidate_prior_events:
        fingerprint = str(item.image_sha256 or "")
        if fingerprint:
            if fingerprint in seen_hashes:
                continue
            seen_hashes.add(fingerprint)
        prior_events.append(item)
    active_periods = [
        item
        for item in store.feeding_periods.values()
        if item.dog_id == event.dog_id
        and item.start_at <= event.created_at
        and (item.end_at is None or item.end_at >= event.created_at)
    ]
    active_period = (
        max(active_periods, key=lambda item: item.start_at)
        if active_periods
        else None
    )
    period_food = (
        store.food_products.get(active_period.food_product_id)
        if active_period
        else None
    )
    verified_food = (
        period_food
        if period_food is not None and period_food.verified_at is not None
        else None
    )
    season_key, season_label = digestive_period_label(event.created_at.month)

    def food_id_at(item: FecalEventRec) -> str | None:
        matches = [
            period
            for period in store.feeding_periods.values()
            if period.dog_id == item.dog_id
            and period.start_at <= item.created_at
            and (period.end_at is None or period.end_at >= item.created_at)
        ]
        if not matches:
            return None
        food_id = max(matches, key=lambda period: period.start_at).food_product_id
        food = store.food_products.get(food_id)
        return food_id if food is not None and food.verified_at is not None else None

    scored_prior = [
        item
        for item in prior_events
        if item.fecal_score_estimate is not None
        and item.learning_eligible is True
    ]
    active_food_id = verified_food.id if verified_food else None
    nutrition = nutrition_history_snapshot(store, dog_id=event.dog_id)
    return DigestiveContext(
        dog_name=dog.name,
        age_stage=dog.age_stage,
        size=dog.size,
        breed_label=dog.breed_label,
        weight_kg=dog.weight_kg,
        active_food_name=(
            period_food.name
            if period_food is not None and period_food.name
            else None
        ),
        active_food_product_id=(
            period_food.id if period_food is not None else None
        ),
        has_active_food=active_period is not None,
        quantity_per_day=(
            active_period.quantity_per_day if active_period is not None else None
        ),
        food_started_days_ago=(
            max(0, (event.created_at - active_period.start_at).days)
            if active_period is not None
            else None
        ),
        current_food_prior_scores=[
            int(item.fecal_score_estimate)
            for item in scored_prior
            if active_food_id is not None and food_id_at(item) == active_food_id
        ],
        previous_food_scores=[
            int(item.fecal_score_estimate)
            for item in scored_prior
            if active_food_id is not None
            and food_id_at(item) is not None
            and food_id_at(item) != active_food_id
        ],
        season_label=season_label,
        same_season_prior_scores=[
            int(item.fecal_score_estimate)
            for item in scored_prior
            if digestive_period_label(item.created_at.month)[0] == season_key
        ],
        other_season_scores=[
            int(item.fecal_score_estimate)
            for item in scored_prior
            if digestive_period_label(item.created_at.month)[0] != season_key
        ],
        prior_scores=[
            item.fecal_score_estimate
            for item in scored_prior
        ],
        prior_consistencies=[
            item.consistency for item in prior_events if item.consistency
        ],
        recent_episode_count_24h=sum(
            (event.created_at - item.created_at).total_seconds() <= 86_400
            for item in prior_events
        ),
        recent_watery_count_24h=sum(
            item.consistency == "watery"
            and (event.created_at - item.created_at).total_seconds() <= 86_400
            for item in prior_events
        ),
        vomiting_today=event.owner_context_json.get("vomiting_today"),
        reduced_activity_today=event.owner_context_json.get(
            "reduced_activity_today"
        ),
        unusual_food_48h=event.owner_context_json.get("unusual_food_48h"),
        appetite_reduced=event.owner_context_json.get("appetite_reduced"),
        straining_or_urgency=event.owner_context_json.get("straining_or_urgency"),
        supplements_or_medication=event.owner_context_json.get(
            "supplements_or_medication"
        ),
        **count_recent_windows(
            event.created_at,
            prior_events,
            consistency_of=lambda item: (item.consistency or "").lower(),
            created_of=lambda item: item.created_at,
        ),
        latest_weight_kg=nutrition.get("latest_kg"),
        weight_delta_kg=nutrition.get("delta_kg"),
        activity_level=(
            (store.dog_lifestyle_profiles.get(event.dog_id) or {}).get("routine")
            or (store.dog_lifestyle_profiles.get(event.dog_id) or {}).get("routine_json")
            or {}
        ).get("activity"),
    )


async def init_fecal_event(
    store: InMemoryStore,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    payload: FecalInitRequest,
) -> tuple[FecalEventRec, str, object, bool]:
    dog = get_owned_dog(store, user_id=user_id, dog_id=payload.dog_id)

    existing_id = store.fecal_by_client_request.get((user_id, payload.client_request_id))
    if existing_id:
        event = store.fecal_events[existing_id]
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

    quota = QuotaService(store)
    await quota.reserve(user_id, AnalysisDomain.DIGESTIVE)

    event_id = new_id()
    path = f"users/{user_id}/dogs/{dog.id}/digestive/{event_id}/{new_id()}.jpg"
    event = FecalEventRec(
        id=event_id,
        dog_id=dog.id,
        user_id=user_id,
        client_request_id=payload.client_request_id,
        image_path=path,
        bytes=payload.bytes,
        content_type=payload.content_type,
        status="UPLOADING",
        created_at=now_utc(),
    )
    store.fecal_events[event.id] = event
    store.fecal_by_client_request[(user_id, payload.client_request_id)] = event.id
    url, expires = await storage.create_signed_upload_url(
        bucket=DIGESTIVE_BUCKET,
        path=path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return event, url, expires, True


async def complete_fecal_event(
    store: InMemoryStore,
    *,
    storage: StorageProvider,
    queue: JobQueue,
    user_id: str,
    event_id: str,
) -> FecalEventRec:
    event = store.fecal_events.get(event_id)
    if event is None or event.user_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Digestive event not found")
    if event.status not in ("DRAFT", "UPLOADING"):
        return event  # idempotent
    ok = await storage.object_exists(
        bucket=DIGESTIVE_BUCKET, path=event.image_path, expected_bytes=event.bytes
    )
    if not ok:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Uploaded object failed validation.", retryable=True)
    event.upload_completed = True
    event.status = "QUEUED"
    job = AnalysisJobRec(
        id=new_id(),
        job_type="digestive_analysis",
        event_id=event.id,
        user_id=user_id,
        task_id=None,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    store.analysis_jobs[job.id] = job
    try:
        job.task_id = await queue.enqueue(
            task_type="digestive_analysis",
            payload={"event_id": event.id, "user_id": user_id},
        )
        job.updated_at = now_utc()
    except Exception:
        job.status = "failed"
        job.last_error_code = "QUEUE_DISPATCH_FAILED"
        job.updated_at = now_utc()
        event.upload_completed = False
        event.status = "UPLOADING"
        raise
    return event


def get_fecal_event(store: InMemoryStore, *, user_id: str, event_id: str) -> FecalEventRec:
    event = store.fecal_events.get(event_id)
    if event is None or event.user_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Digestive event not found")
    return event


async def init_food_scan(
    store: InMemoryStore,
    *,
    settings: Settings,
    storage: StorageProvider,
    user_id: str,
    payload: FoodScanInitRequest,
) -> tuple[FoodProductRec, str, object]:
    dog = get_owned_dog(store, user_id=user_id, dog_id=payload.dog_id)
    existing_id = store.food_by_client_request.get((user_id, payload.client_request_id))
    if existing_id:
        product = store.food_products[existing_id]
        url, expires = await storage.create_signed_upload_url(
            bucket=FOOD_BUCKET,
            path=product.image_path or "",
            content_type=payload.content_type,
            ttl_seconds=settings.storage_signed_url_ttl_seconds,
        )
        return product, url, expires

    product_id = new_id()
    extension = _image_extension(payload.content_type)
    path = (
        f"users/{user_id}/dogs/{dog.id}/food_labels/"
        f"{product_id}/{new_id()}.{extension}"
    )
    product = FoodProductRec(
        id=product_id,
        owner_id=user_id,
        dog_id=dog.id,
        image_path=path,
        client_request_id=payload.client_request_id,
        created_at=now_utc(),
    )
    store.food_products[product.id] = product
    store.food_by_client_request[(user_id, payload.client_request_id)] = product.id
    url, expires = await storage.create_signed_upload_url(
        bucket=FOOD_BUCKET,
        path=path,
        content_type=payload.content_type,
        ttl_seconds=settings.storage_signed_url_ttl_seconds,
    )
    return product, url, expires


def verify_food_product(
    store: InMemoryStore, *, user_id: str, food_id: str, payload: FoodVerifyRequest
) -> FoodProductRec:
    """Only user-verified fields become durable nutrition data (sez. 20.1)."""
    product = store.food_products.get(food_id)
    if product is None or product.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Food product not found")
    updated = product.model_copy(
        update={
            "brand": payload.brand,
            "name": payload.name,
            "ingredients_raw": payload.ingredients_raw,
            "guaranteed_analysis": payload.guaranteed_analysis.model_dump(),
            "feeding_directions": payload.feeding_directions,
            "verified_at": now_utc(),
        }
    )
    store.food_products[food_id] = updated
    return updated


def apply_food_label_extraction(
    store: InMemoryStore,
    *,
    user_id: str,
    food_id: str,
    extraction: FoodLabelExtraction,
) -> FoodProductRec:
    """Store provider-read fields as an unverified draft for owner review."""
    product = store.food_products.get(food_id)
    if product is None or product.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Food product not found")
    if product.verified_at is not None:
        return product
    updated = product.model_copy(
        update={
            "brand": extraction.brand,
            "name": extraction.name,
            "ingredients_raw": extraction.ingredients_raw,
            "guaranteed_analysis": extraction.guaranteed_analysis.model_dump(),
            "feeding_directions": extraction.feeding_directions,
            "extraction_confidence": extraction.extraction_confidence,
        }
    )
    store.food_products[food_id] = updated
    return updated


def create_manual_food_product(
    store: InMemoryStore,
    *,
    user_id: str,
    payload: FoodManualCreateRequest,
) -> FoodProductRec:
    """Persist only the food details the owner explicitly entered."""
    dog = get_owned_dog(store, user_id=user_id, dog_id=payload.dog_id)
    existing_id = store.food_by_client_request.get(
        (user_id, payload.client_request_id)
    )
    if existing_id:
        return store.food_products[existing_id]
    product = FoodProductRec(
        id=new_id(),
        owner_id=user_id,
        dog_id=dog.id,
        client_request_id=payload.client_request_id,
        brand=payload.brand,
        name=payload.name,
        ingredients_raw=payload.ingredients_raw,
        guaranteed_analysis=payload.guaranteed_analysis.model_dump(),
        feeding_directions=payload.feeding_directions,
        verified_at=now_utc(),
        created_at=now_utc(),
    )
    store.food_products[product.id] = product
    store.food_by_client_request[(user_id, payload.client_request_id)] = product.id
    return product


def _apply_open_period_fields(
    period: FeedingPeriodRec,
    updates: dict[str, Any],
    *,
    ignore_none: bool,
) -> FeedingPeriodRec:
    for field in ("quantity_per_day", "treats_notes", "transition_notes"):
        if field not in updates:
            continue
        value = updates[field]
        if ignore_none and value is None:
            continue
        setattr(period, field, value)
    return period


def create_feeding_period(
    store: InMemoryStore, *, user_id: str, payload: FeedingPeriodCreate
) -> FeedingPeriodRec:
    """Starting a new food closes the active period and opens a new one; it
    never rewrites history (sez. 20.1). Updating quantity on the same open
    food keeps that period."""
    get_owned_dog(store, user_id=user_id, dog_id=payload.dog_id)
    product = store.food_products.get(payload.food_product_id)
    if product is None or product.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Food product not found")
    if product.verified_at is None:
        raise ApiError(
            ErrorCode.VALIDATION_FAILED,
            "Food product must be verified before starting a feeding period.",
        )
    open_period = next(
        (
            period
            for period in store.feeding_periods.values()
            if period.dog_id == payload.dog_id and period.end_at is None
        ),
        None,
    )
    if open_period is not None and open_period.food_product_id == payload.food_product_id:
        return _apply_open_period_fields(
            open_period,
            payload.model_dump(),
            ignore_none=True,
        )
    for period in store.feeding_periods.values():
        if period.dog_id == payload.dog_id and period.end_at is None:
            period.end_at = payload.start_at
    rec = FeedingPeriodRec(
        id=new_id(),
        dog_id=payload.dog_id,
        food_product_id=payload.food_product_id,
        start_at=payload.start_at,
        quantity_per_day=payload.quantity_per_day,
        treats_notes=payload.treats_notes,
        transition_notes=payload.transition_notes,
    )
    store.feeding_periods[rec.id] = rec
    return rec


def update_feeding_period(
    store: InMemoryStore, *, user_id: str, period_id: str, payload: FeedingPeriodUpdate
) -> FeedingPeriodRec:
    require_uuid(period_id, not_found="Feeding period not found")
    period = store.feeding_periods.get(period_id)
    if period is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Feeding period not found")
    get_owned_dog(store, user_id=user_id, dog_id=period.dog_id)
    if period.end_at is not None:
        raise ApiError(
            ErrorCode.VALIDATION_FAILED,
            "Only the active feeding period can be updated.",
        )
    return _apply_open_period_fields(
        period,
        payload.model_dump(exclude_unset=True),
        ignore_none=False,
    )


def digestive_summary(store: InMemoryStore, *, user_id: str, dog_id: str) -> dict:
    """Baseline + recent trend: compare Rocky to Rocky (sez. 19.2)."""
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    events = sorted(
        (
            e
            for e in store.fecal_events.values()
            if e.dog_id == dog_id and e.status == "COMPLETED"
        ),
        key=lambda e: e.created_at,
    )
    flags: list[dict] = []
    for event in events[-3:]:
        flags.extend(event.safety_flags)
    scores = [
        int(event.fecal_score_estimate)
        for event in events
        if event.fecal_score_estimate is not None
        and event.learning_eligible is True
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


def list_food_products(
    store: InMemoryStore, *, user_id: str, dog_id: str
) -> list[FoodProductRec]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    return [
        product
        for product in store.food_products.values()
        if product.owner_id == user_id and product.dog_id == dog_id
    ]


def get_food_product(
    store: InMemoryStore, *, user_id: str, food_id: str
) -> FoodProductRec:
    product = store.food_products.get(food_id)
    if product is None or product.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Food product not found")
    return product


def list_feeding_periods(
    store: InMemoryStore, *, user_id: str, dog_id: str
) -> list[FeedingPeriodRec]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    return [
        period
        for period in store.feeding_periods.values()
        if period.dog_id == dog_id
    ]
