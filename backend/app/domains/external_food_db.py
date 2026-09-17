"""PostgreSQL audit for Open Pet Food Facts lookups."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import (
    ExternalFoodConfirmRequest,
    ExternalFoodLookupRequest,
    FoodManualCreateRequest,
    GuaranteedAnalysis,
)
from app.contracts.errors import ApiError, ErrorCode
from app.domains import digestive_db, dogs_db
from app.domains.ids import require_uuid
from app.domains.models import FoodProductRec
from app.domains.repository import new_id
from app.providers.open_pet_food_facts import (
    ExternalFoodCandidate,
    OpenPetFoodFactsClient,
)


def _uuid_id() -> str:
    value = new_id()
    if len(value) == 32:
        return f"{value[:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:]}"
    return value


def _require_feature(enabled: bool) -> None:
    if not enabled:
        raise ApiError(
            ErrorCode.NOT_FOUND,
            "Questa funzione non è ancora disponibile.",
        )


async def lookup_external_food(
    engine: AsyncEngine,
    *,
    user_id: str,
    payload: ExternalFoodLookupRequest,
    enabled: bool,
    client: OpenPetFoodFactsClient | None = None,
) -> tuple[str, ExternalFoodCandidate]:
    _require_feature(enabled)
    require_uuid(payload.dog_id, not_found="Dog not found")
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=payload.dog_id)
    adapter = client or OpenPetFoodFactsClient()
    candidate = await adapter.lookup_barcode(payload.barcode)
    if candidate is None or not candidate.name:
        raise ApiError(
            ErrorCode.NOT_FOUND,
            "Non ho trovato un alimento confermabile per questo codice.",
        )
    lookup_id = _uuid_id()
    async with engine.begin() as conn:
        existing = (
            await conn.execute(
                text(
                    """
                    select id, status
                    from public.external_food_lookups
                    where user_id = cast(:user_id as uuid)
                      and client_request_id = :crid
                    """
                ),
                {"user_id": user_id, "crid": payload.client_request_id},
            )
        ).mappings().first()
        if existing:
            return str(existing["id"]), candidate
        await conn.execute(
            text(
                """
                insert into public.external_food_lookups (
                  id, user_id, dog_id, barcode, provider, provider_code,
                  raw_payload, status, client_request_id
                ) values (
                  cast(:id as uuid), cast(:user_id as uuid), cast(:dog_id as uuid),
                  :barcode, :provider, :provider_code, cast(:raw as jsonb),
                  'CANDIDATE', :crid
                )
                """
            ),
            {
                "id": lookup_id,
                "user_id": user_id,
                "dog_id": payload.dog_id,
                "barcode": candidate.barcode,
                "provider": candidate.provider,
                "provider_code": candidate.provider_code,
                "raw": candidate.model_dump_json(),
                "crid": payload.client_request_id,
            },
        )
    return lookup_id, candidate


async def confirm_external_food(
    engine: AsyncEngine,
    *,
    user_id: str,
    payload: ExternalFoodConfirmRequest,
    enabled: bool,
) -> FoodProductRec:
    _require_feature(enabled)
    require_uuid(payload.lookup_id, not_found="Lookup not found")
    async with engine.connect() as conn:
        lookup = (
            await conn.execute(
                text(
                    """
                    select *
                    from public.external_food_lookups
                    where id = cast(:id as uuid)
                      and user_id = cast(:user_id as uuid)
                      and dog_id = cast(:dog_id as uuid)
                    """
                ),
                {
                    "id": payload.lookup_id,
                    "user_id": user_id,
                    "dog_id": payload.dog_id,
                },
            )
        ).mappings().first()
    if lookup is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Lookup not found")
    if lookup["status"] == "CONFIRMED" and lookup.get("food_product_id"):
        return await digestive_db.get_food_product(
            engine, user_id=user_id, food_id=str(lookup["food_product_id"])
        )
    product = await digestive_db.create_manual_food_product(
        engine,
        user_id=user_id,
        payload=FoodManualCreateRequest(
            dog_id=payload.dog_id,
            client_request_id=f"opff-{payload.lookup_id}",
            brand=payload.brand,
            name=payload.name,
            ingredients_raw=payload.ingredients_raw,
            guaranteed_analysis=GuaranteedAnalysis(calories=payload.calories),
        ),
    )
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update public.food_products
                set barcode = :barcode,
                    external_source = :source,
                    external_code = :code
                where id = cast(:id as uuid)
                """
            ),
            {
                "id": product.id,
                "barcode": lookup["barcode"],
                "source": lookup["provider"],
                "code": lookup.get("provider_code"),
            },
        )
        await conn.execute(
            text(
                """
                update public.external_food_lookups
                set status = 'CONFIRMED',
                    food_product_id = cast(:food_id as uuid),
                    confirmed_at = now()
                where id = cast(:id as uuid)
                """
            ),
            {"food_id": product.id, "id": payload.lookup_id},
        )
    return product.model_copy(
        update={
            "barcode": lookup["barcode"],
            "external_source": lookup["provider"],
            "external_code": lookup.get("provider_code"),
        }
    )
