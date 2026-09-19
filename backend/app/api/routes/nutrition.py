"""Nutrition routes (sez. 9): food label scan init, verify, feeding periods."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AppState, IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    ExternalFoodCandidateOut,
    ExternalFoodConfirmRequest,
    ExternalFoodLookupRequest,
    ExternalFoodSearchOut,
    ExternalFoodSearchRequest,
    FeedingPeriodCreate,
    FeedingPeriodOut,
    FeedingPeriodUpdate,
    FoodManualCreateRequest,
    FoodProductOut,
    FoodScanInitRequest,
    FoodScanInitResponse,
    FoodVerifyRequest,
)
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import AnalysisDomain
from app.domains import digestive as digestive_domain
from app.domains import digestive_db, external_food, external_food_db, idempotency_db
from app.domains.models import FeedingPeriodRec, FoodProductRec
from app.providers.openai_food_label import extract_food_label

router = APIRouter()


def _food_out(product: FoodProductRec) -> FoodProductOut:
    return FoodProductOut(
        id=product.id,
        dog_id=product.dog_id or None,
        brand=product.brand,
        name=product.name,
        ingredients_raw=product.ingredients_raw,
        guaranteed_analysis=product.guaranteed_analysis or {},
        feeding_directions=product.feeding_directions,
        extraction_confidence=product.extraction_confidence or {},
        verified_at=product.verified_at,
        barcode=product.barcode,
        external_source=product.external_source,
    )


async def _food_out_with_label(
    product: FoodProductRec,
    state: AppState,
) -> FoodProductOut:
    output = _food_out(product)
    if not product.image_path:
        return output
    create_read = getattr(state.storage, "create_signed_read_url", None)
    if not callable(create_read):
        return output
    try:
        url = await create_read(
            bucket=digestive_domain.FOOD_BUCKET,
            path=product.image_path,
            ttl_seconds=max(state.settings.storage_signed_url_ttl_seconds, 1800),
        )
    except Exception:  # noqa: BLE001 -- reference image is best-effort
        return output
    return output.model_copy(update={"label_image_url": url})


def _period_out(rec: FeedingPeriodRec) -> FeedingPeriodOut:
    return FeedingPeriodOut(
        id=rec.id,
        dog_id=rec.dog_id,
        food_product_id=rec.food_product_id,
        start_at=rec.start_at,
        end_at=rec.end_at,
        quantity_per_day=rec.quantity_per_day,
    )


async def _record_guard(state: StateDep, guard: IdempotencyDep, body: dict) -> None:
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )


@router.get("/nutrition/foods", response_model=list[FoodProductOut])
async def list_foods(
    state: StateDep,
    user_id: UserIdDep,
    dog_id: Annotated[str, Query()],
) -> list[FoodProductOut]:
    if state.engine is not None:
        products = await digestive_db.list_food_products(
            state.engine, user_id=user_id, dog_id=dog_id
        )
    else:
        products = digestive_domain.list_food_products(
            state.store, user_id=user_id, dog_id=dog_id
        )
    return [_food_out(product) for product in products]


@router.get("/nutrition/foods/{food_id}", response_model=FoodProductOut)
async def get_food(
    food_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> FoodProductOut:
    if state.engine is not None:
        product = await digestive_db.get_food_product(
            state.engine, user_id=user_id, food_id=food_id
        )
    else:
        product = digestive_domain.get_food_product(
            state.store, user_id=user_id, food_id=food_id
        )
    return await _food_out_with_label(product, state)


@router.get("/nutrition/feeding-periods", response_model=list[FeedingPeriodOut])
async def list_feeding_periods(
    state: StateDep,
    user_id: UserIdDep,
    dog_id: Annotated[str, Query()],
) -> list[FeedingPeriodOut]:
    if state.engine is not None:
        periods = await digestive_db.list_feeding_periods(
            state.engine, user_id=user_id, dog_id=dog_id
        )
    else:
        periods = digestive_domain.list_feeding_periods(
            state.store, user_id=user_id, dog_id=dog_id
        )
    return [_period_out(period) for period in periods]


@router.post("/nutrition/foods/scan/init", response_model=FoodScanInitResponse)
async def init_food_scan(
    payload: FoodScanInitRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FoodScanInitResponse:
    if cached := guard.lookup():
        return FoodScanInitResponse.model_validate(cached)
    if state.engine is not None:
        product, url, expires = await digestive_db.init_food_scan(
            state.engine,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            payload=payload,
        )
    else:
        product, url, expires = await digestive_domain.init_food_scan(
            state.store,
            settings=state.settings,
            storage=state.storage,
            user_id=user_id,
            payload=payload,
        )
    resp = FoodScanInitResponse(
        food_product_id=product.id,
        upload={"url": url, "storage_path": product.image_path or "", "expires_at": expires},
        ocr_status="pending",
    )
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp


@router.post(
    "/nutrition/foods/{food_id}/extract",
    response_model=FoodProductOut,
)
async def extract_food(
    food_id: str,
    state: StateDep,
    user_id: UserIdDep,
) -> FoodProductOut:
    if state.engine is not None:
        product = await digestive_db.get_food_product(
            state.engine,
            user_id=user_id,
            food_id=food_id,
        )
    else:
        product = digestive_domain.get_food_product(
            state.store,
            user_id=user_id,
            food_id=food_id,
        )
    if product.verified_at is not None or product.extraction_confidence:
        return _food_out(product)
    if not product.image_path:
        raise ApiError(
            ErrorCode.INVALID_STATE,
            "Questa etichetta non ha una foto da leggere.",
        )
    try:
        image_exists = await state.storage.object_exists(
            bucket=digestive_domain.FOOD_BUCKET,
            path=product.image_path,
        )
    except TimeoutError as exc:
        raise ApiError(
            ErrorCode.PROVIDER_TIMEOUT,
            "La foto dell’etichetta non è raggiungibile in questo momento.",
        ) from exc
    if not image_exists:
        raise ApiError(
            ErrorCode.INVALID_STATE,
            "La foto dell’etichetta non è ancora disponibile.",
            retryable=True,
        )
    create_read = getattr(state.storage, "create_signed_read_url", None)
    if not callable(create_read):
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "La lettura dell’etichetta non è disponibile.",
        )
    try:
        image_ref = await create_read(
            bucket=digestive_domain.FOOD_BUCKET,
            path=product.image_path,
            ttl_seconds=min(state.settings.storage_signed_url_ttl_seconds, 600),
        )
    except TimeoutError as exc:
        raise ApiError(
            ErrorCode.PROVIDER_TIMEOUT,
            "La foto dell’etichetta non è raggiungibile in questo momento.",
        ) from exc
    try:
        extraction, usage = await extract_food_label(
            state.settings,
            image_ref=image_ref,
        )
    except TimeoutError as exc:
        raise ApiError(
            ErrorCode.PROVIDER_TIMEOUT,
            "Non riesco a leggere l’etichetta in questo momento.",
        ) from exc
    except ValueError as exc:
        raise ApiError(
            ErrorCode.PROVIDER_SCHEMA_INVALID,
            "La foto non ha prodotto dati affidabili.",
        ) from exc
    except RuntimeError as exc:
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "La lettura dell’etichetta non è disponibile.",
        ) from exc
    if state.engine is not None:
        product = await digestive_db.apply_food_label_extraction(
            state.engine,
            user_id=user_id,
            food_id=food_id,
            extraction=extraction,
        )
    else:
        product = digestive_domain.apply_food_label_extraction(
            state.store,
            user_id=user_id,
            food_id=food_id,
            extraction=extraction,
        )
    await state.cost_meter.record(
        usage=usage,
        operation="nutrition.extract_food_label",
        domain=AnalysisDomain.DIGESTIVE,
        event_id=food_id,
        user_id=user_id,
    )
    return _food_out(product)


@router.post(
    "/nutrition/foods/manual",
    response_model=FoodProductOut,
    status_code=201,
)
async def create_manual_food(
    payload: FoodManualCreateRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FoodProductOut:
    if cached := guard.lookup():
        return FoodProductOut.model_validate(cached)
    if state.engine is not None:
        product = await digestive_db.create_manual_food_product(
            state.engine, user_id=user_id, payload=payload
        )
    else:
        product = digestive_domain.create_manual_food_product(
            state.store, user_id=user_id, payload=payload
        )
    response = _food_out(product)
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response


@router.patch("/nutrition/foods/{food_id}/verify", response_model=FoodProductOut)
async def verify_food(
    food_id: str,
    payload: FoodVerifyRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FoodProductOut:
    if cached := guard.lookup():
        return FoodProductOut.model_validate(cached)
    if state.engine is not None:
        product = await digestive_db.verify_food_product(
            state.engine, user_id=user_id, food_id=food_id, payload=payload
        )
    else:
        product = digestive_domain.verify_food_product(
            state.store, user_id=user_id, food_id=food_id, payload=payload
        )
    response = _food_out(product)
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response


@router.post("/nutrition/feeding-periods", response_model=FeedingPeriodOut, status_code=201)
async def create_feeding_period(
    payload: FeedingPeriodCreate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FeedingPeriodOut:
    if cached := guard.lookup():
        return FeedingPeriodOut.model_validate(cached)
    if state.engine is not None:
        rec = await digestive_db.create_feeding_period(state.engine, user_id=user_id, payload=payload)
    else:
        rec = digestive_domain.create_feeding_period(state.store, user_id=user_id, payload=payload)
    resp = _period_out(rec)
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp


@router.patch(
    "/nutrition/feeding-periods/{period_id}",
    response_model=FeedingPeriodOut,
)
async def update_feeding_period(
    period_id: str,
    payload: FeedingPeriodUpdate,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FeedingPeriodOut:
    if cached := guard.lookup():
        return FeedingPeriodOut.model_validate(cached)
    if state.engine is not None:
        rec = await digestive_db.update_feeding_period(
            state.engine, user_id=user_id, period_id=period_id, payload=payload
        )
    else:
        rec = digestive_domain.update_feeding_period(
            state.store, user_id=user_id, period_id=period_id, payload=payload
        )
    resp = _period_out(rec)
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp


@router.post(
    "/nutrition/foods/external/lookup",
    response_model=ExternalFoodCandidateOut,
)
async def lookup_external_food(
    payload: ExternalFoodLookupRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> ExternalFoodCandidateOut:
    if cached := guard.lookup():
        return ExternalFoodCandidateOut.model_validate(cached)
    enabled = state.settings.open_pet_food_facts_v1
    if state.engine is not None:
        lookup_id, candidate = await external_food_db.lookup_external_food(
            state.engine,
            user_id=user_id,
            payload=payload,
            enabled=enabled,
        )
    else:
        lookup_id, candidate = await external_food.lookup_external_food(
            state.store,
            user_id=user_id,
            payload=payload,
            enabled=enabled,
        )
    response = ExternalFoodCandidateOut(
        lookup_id=lookup_id,
        barcode=candidate.barcode,
        brand=candidate.brand,
        name=candidate.name,
        ingredients_raw=candidate.ingredients_raw,
        calories=candidate.calories,
        image_url=candidate.image_url,
        attribution=candidate.attribution,
    )
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response


def _candidate_out(
    lookup_id: str, candidate: object
) -> ExternalFoodCandidateOut:
    return ExternalFoodCandidateOut(
        lookup_id=lookup_id,
        barcode=candidate.barcode,
        brand=candidate.brand,
        name=candidate.name,
        ingredients_raw=candidate.ingredients_raw,
        calories=candidate.calories,
        image_url=candidate.image_url,
        attribution=candidate.attribution,
    )


@router.post(
    "/nutrition/foods/external/search",
    response_model=ExternalFoodSearchOut,
)
async def search_external_foods(
    payload: ExternalFoodSearchRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> ExternalFoodSearchOut:
    if cached := guard.lookup():
        return ExternalFoodSearchOut.model_validate(cached)
    enabled = state.settings.open_pet_food_facts_v1
    if state.engine is not None:
        hits = await external_food_db.search_external_foods(
            state.engine,
            user_id=user_id,
            payload=payload,
            enabled=enabled,
        )
    else:
        hits = await external_food.search_external_foods(
            state.store,
            user_id=user_id,
            payload=payload,
            enabled=enabled,
        )
    response = ExternalFoodSearchOut(
        items=[_candidate_out(lookup_id, candidate) for lookup_id, candidate in hits],
        attribution=(
            hits[0][1].attribution
            if hits
            else "Dati alimento da Open Pet Food Facts (ODbL). "
            "https://world.openpetfoodfacts.org"
        ),
    )
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response


@router.post(
    "/nutrition/foods/external/confirm",
    response_model=FoodProductOut,
    status_code=201,
)
async def confirm_external_food(
    payload: ExternalFoodConfirmRequest,
    state: StateDep,
    user_id: UserIdDep,
    guard: IdempotencyDep,
) -> FoodProductOut:
    if cached := guard.lookup():
        return FoodProductOut.model_validate(cached)
    enabled = state.settings.open_pet_food_facts_v1
    if state.engine is not None:
        product = await external_food_db.confirm_external_food(
            state.engine,
            user_id=user_id,
            payload=payload,
            enabled=enabled,
        )
    else:
        product = external_food.confirm_external_food(
            state.store,
            user_id=user_id,
            payload=payload,
            enabled=enabled,
        )
    if payload.activate:
        from datetime import UTC, datetime

        from app.contracts.api import FeedingPeriodCreate

        period_payload = FeedingPeriodCreate(
            dog_id=payload.dog_id,
            food_product_id=product.id,
            start_at=datetime.now(UTC),
        )
        if state.engine is not None:
            await digestive_db.create_feeding_period(
                state.engine, user_id=user_id, payload=period_payload
            )
        else:
            digestive_domain.create_feeding_period(
                state.store, user_id=user_id, payload=period_payload
            )
    response = _food_out(product)
    await _record_guard(state, guard, response.model_dump(mode="json"))
    return response
