"""Nutrition routes (sez. 9): food label scan init, verify, feeding periods."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import IdempotencyDep, StateDep, UserIdDep
from app.contracts.api import (
    FeedingPeriodCreate,
    FeedingPeriodOut,
    FoodProductOut,
    FoodScanInitRequest,
    FoodScanInitResponse,
    FoodVerifyRequest,
)
from app.domains import digestive as digestive_domain
from app.domains import digestive_db, idempotency_db

router = APIRouter()


async def _record_guard(state: StateDep, guard: IdempotencyDep, body: dict) -> None:
    guard.record(body)
    if state.engine is not None and guard._scope:
        await idempotency_db.record(
            state.engine,
            scope=guard._scope,
            body=body,
            payload_hash=guard._payload_hash,
        )


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
    response = FoodProductOut(
        id=product.id,
        brand=product.brand,
        name=product.name,
        verified_at=product.verified_at,
    )
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
    resp = FeedingPeriodOut(
        id=rec.id,
        dog_id=rec.dog_id,
        food_product_id=rec.food_product_id,
        start_at=rec.start_at,
        end_at=rec.end_at,
    )
    await _record_guard(state, guard, resp.model_dump(mode="json"))
    return resp
