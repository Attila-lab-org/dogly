"""Digestive & nutrition domain service (Spec V1 sez. 19/20).

Shares upload/quota/job infrastructure with behavior (sez. 29.2: no parallel
second architecture). Observation is separate from the deterministic
safety/rule layer (sez. 19.3).
"""

from __future__ import annotations

from app.config import Settings
from app.contracts.api import (
    FecalInitRequest,
    FeedingPeriodCreate,
    FoodScanInitRequest,
    FoodVerifyRequest,
)
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain
from app.domains.billing import QuotaService
from app.domains.digestive_intelligence import DigestiveContext
from app.domains.dogs import get_owned_dog
from app.domains.models import (
    AnalysisJobRec,
    FecalEventRec,
    FeedingPeriodRec,
    FoodProductRec,
)
from app.domains.repository import InMemoryStore, new_id, now_utc
from app.providers.base import JobQueue, StorageProvider

DIGESTIVE_BUCKET = "digestive-raw"
FOOD_BUCKET = "food-labels"

# Deterministic safety routing (sez. 19.3): these observation candidates route
# to fixed reviewed copy; generated text can never downgrade them.
SAFETY_FLAG_RULES: dict[str, str] = {
    "fresh_blood_candidate": "BLOOD_CANDIDATE",
    "melena_candidate": "MELENA_CANDIDATE",
    "foreign_material_candidate": "FOREIGN_MATERIAL_CANDIDATE",
}


def deterministic_safety_flags(observation: dict) -> list[dict]:
    flags: list[dict] = []
    for field, code in SAFETY_FLAG_RULES.items():
        if observation.get(field) == "clear_candidate":
            flags.append({"code": code, "severity": "high"})
        elif observation.get(field) == "possible":
            flags.append({"code": code, "severity": "medium"})
    if observation.get("consistency") == "watery":
        flags.append({"code": "REPEATED_WATERY", "severity": "medium"})
    return flags


def contextual_safety_flags(
    observation: dict, context: DigestiveContext
) -> list[dict]:
    """Add owner-confirmed escalation without allowing generated text to decide."""
    flags = deterministic_safety_flags(observation)
    if (
        observation.get("consistency") == "watery"
        and context.recent_episode_count_24h >= 2
        and context.vomiting_today is True
    ):
        flags.append({"code": "DIGESTIVE_SYMPTOMS", "severity": "high"})
    return flags


def build_inmemory_digestive_context(
    store: InMemoryStore, *, event: FecalEventRec
) -> DigestiveContext:
    dog = store.dogs[event.dog_id]
    prior_events = sorted(
        (
            item
            for item in store.fecal_events.values()
            if item.dog_id == event.dog_id
            and item.id != event.id
            and item.status == "COMPLETED"
            and item.created_at < event.created_at
        ),
        key=lambda item: item.created_at,
    )[-12:]
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
    active_food = (
        store.food_products.get(active_period.food_product_id)
        if active_period
        else None
    )
    return DigestiveContext(
        dog_name=dog.name,
        age_stage=dog.age_stage,
        size=dog.size,
        weight_kg=dog.weight_kg,
        active_food_name=active_food.name if active_food else None,
        food_started_days_ago=(
            max(0, (event.created_at - active_period.start_at).days)
            if active_period
            else None
        ),
        prior_scores=[
            item.fecal_score_estimate
            for item in prior_events
            if item.fecal_score_estimate is not None
        ],
        prior_consistencies=[
            item.consistency for item in prior_events if item.consistency
        ],
        recent_episode_count_24h=sum(
            (event.created_at - item.created_at).total_seconds() <= 86_400
            for item in prior_events
        ),
        vomiting_today=event.owner_context_json.get("vomiting_today"),
        reduced_activity_today=event.owner_context_json.get(
            "reduced_activity_today"
        ),
        unusual_food_48h=event.owner_context_json.get("unusual_food_48h"),
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
    task_id = await queue.enqueue(
        task_type="digestive_analysis",
        payload={"event_id": event.id, "user_id": user_id},
    )
    job = AnalysisJobRec(
        id=new_id(),
        job_type="digestive_analysis",
        event_id=event.id,
        user_id=user_id,
        task_id=task_id,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    store.analysis_jobs[job.id] = job
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
    path = f"users/{user_id}/dogs/{dog.id}/food_labels/{product_id}/{new_id()}.jpg"
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


def create_feeding_period(
    store: InMemoryStore, *, user_id: str, payload: FeedingPeriodCreate
) -> FeedingPeriodRec:
    """Starting a new food closes the active period and opens a new one; it
    never rewrites history (sez. 20.1)."""
    get_owned_dog(store, user_id=user_id, dog_id=payload.dog_id)
    product = store.food_products.get(payload.food_product_id)
    if product is None or product.owner_id != user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Food product not found")
    if product.verified_at is None:
        raise ApiError(
            ErrorCode.VALIDATION_FAILED,
            "Food product must be verified before starting a feeding period.",
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


def digestive_summary(store: InMemoryStore, *, user_id: str, dog_id: str) -> dict:
    """Baseline + recent trend: compare Rocky to Rocky (sez. 19.2)."""
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    events = sorted(
        (
            e
            for e in store.fecal_events.values()
            if e.dog_id == dog_id and e.status == "COMPLETED" and e.fecal_score_estimate is not None
        ),
        key=lambda e: e.created_at,
    )
    if not events:
        return {
            "dog_id": dog_id,
            "rolling_score": None,
            "variability": None,
            "data_sufficiency": "insufficient",
            "recent_trend": None,
            "safety_flags": [],
        }
    scores = [e.fecal_score_estimate for e in events if e.fecal_score_estimate is not None]
    rolling = sum(scores) / len(scores)
    variability = max(scores) - min(scores) if len(scores) > 1 else 0.0
    sufficiency = "sufficient" if len(scores) >= 3 else "low"
    trend = None
    if len(scores) >= 2:
        delta = scores[-1] - scores[0]
        trend = "improving" if delta < 0 else ("worsening" if delta > 0 else "stable")
    flags: list[dict] = []
    for e in events[-3:]:
        flags.extend(e.safety_flags)
    return {
        "dog_id": dog_id,
        "rolling_score": round(rolling, 2),
        "variability": float(variability),
        "data_sufficiency": sufficiency,
        "recent_trend": trend,
        "safety_flags": flags,
    }
