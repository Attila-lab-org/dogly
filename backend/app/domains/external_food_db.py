"""PostgreSQL audit for Open Pet Food Facts lookups."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import (
    ExternalFoodConfirmRequest,
    ExternalFoodLookupRequest,
    ExternalFoodSearchRequest,
    FoodManualCreateRequest,
    FoodVerifyRequest,
    GuaranteedAnalysis,
)
from app.contracts.errors import ApiError, ErrorCode
from app.domains import digestive_db, dogs_db
from app.domains.external_food import (
    confirmation_values,
    default_opff_client,
    fetch_candidate,
)
from app.domains.ids import require_uuid
from app.domains.models import FoodProductRec
from app.domains.repository import new_id
from app.providers.base import ProviderRateLimitError
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
    async with engine.connect() as conn:
        existing = (
            await conn.execute(
                text(
                    """
                    select id, status, raw_payload
                    from public.external_food_lookups
                    where user_id = cast(:user_id as uuid)
                      and client_request_id = :crid
                    """
                ),
                {"user_id": user_id, "crid": payload.client_request_id},
            )
        ).mappings().first()
    if existing:
        return (
            str(existing["id"]),
            ExternalFoodCandidate.model_validate(existing["raw_payload"]),
        )
    candidate = await fetch_candidate(client or default_opff_client(), payload.barcode)
    lookup_id = _uuid_id()
    async with engine.begin() as conn:
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


async def search_external_foods(
    engine: AsyncEngine,
    *,
    user_id: str,
    payload: ExternalFoodSearchRequest,
    enabled: bool,
    client: OpenPetFoodFactsClient | None = None,
) -> list[tuple[str, ExternalFoodCandidate]]:
    _require_feature(enabled)
    require_uuid(payload.dog_id, not_found="Dog not found")
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=payload.dog_id)
    adapter = client or default_opff_client()
    try:
        hits = await adapter.search_products(payload.query)
    except ProviderRateLimitError as exc:
        raise ApiError(
            ErrorCode.RATE_LIMITED,
            "Troppe richieste in questo momento.",
        ) from exc
    except TimeoutError as exc:
        raise ApiError(
            ErrorCode.PROVIDER_TIMEOUT,
            "Il catalogo alimenti non è raggiungibile.",
        ) from exc
    results: list[tuple[str, ExternalFoodCandidate]] = []
    async with engine.begin() as conn:
        for index, candidate in enumerate(hits):
            lookup_id = _uuid_id()
            crid = f"{payload.client_request_id}-{candidate.barcode or index}"
            existing = (
                await conn.execute(
                    text(
                        """
                        select id
                        from public.external_food_lookups
                        where user_id = cast(:user_id as uuid)
                          and client_request_id = :crid
                        """
                    ),
                    {"user_id": user_id, "crid": crid},
                )
            ).mappings().first()
            if existing:
                results.append((str(existing["id"]), candidate))
                continue
            await conn.execute(
                text(
                    """
                    insert into public.external_food_lookups (
                      id, user_id, dog_id, barcode, provider, provider_code,
                      raw_payload, status, client_request_id
                    ) values (
                      cast(:id as uuid), cast(:user_id as uuid),
                      cast(:dog_id as uuid), :barcode, :provider,
                      :provider_code, cast(:raw as jsonb), 'CANDIDATE', :crid
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
                    "crid": crid,
                },
            )
            results.append((lookup_id, candidate))
    return results


async def browse_food_catalog(
    engine: AsyncEngine,
    *,
    user_id: str,
    dog_id: str,
    query: str = "",
    brand: str = "",
    food_form: str | None = None,
    page: int = 1,
    page_size: int = 20,
    enabled: bool,
    client: OpenPetFoodFactsClient | None = None,
) -> tuple[list[ExternalFoodCandidate], int | None, bool]:
    _require_feature(enabled)
    require_uuid(dog_id, not_found="Dog not found")
    await dogs_db.get_owned_dog(engine, user_id=user_id, dog_id=dog_id)
    normalized = {
        "query": " ".join(query.split()).casefold(),
        "brand": " ".join(brand.split()).casefold(),
        "food_form": (food_form or "").casefold(),
        "page": page,
        "page_size": page_size,
    }
    cache_key = hashlib.sha256(
        json.dumps(normalized, sort_keys=True).encode("utf-8")
    ).hexdigest()
    async with engine.connect() as conn:
        cached = (
            await conn.execute(
                text(
                    """
                    select barcodes, next_page, fetched_at
                    from public.food_catalog_pages
                    where cache_key = :cache_key
                    """
                ),
                {"cache_key": cache_key},
            )
        ).mappings().first()
        if cached and datetime.now(UTC) - cached["fetched_at"] < timedelta(hours=24):
            barcodes = [str(value) for value in (cached["barcodes"] or [])]
            rows = (
                await conn.execute(
                    text(
                        """
                        select barcode, payload
                        from public.food_catalog_products
                        where barcode = any(cast(:barcodes as text[]))
                        """
                    ),
                    {"barcodes": barcodes},
                )
            ).mappings().all()
            by_barcode = {str(row["barcode"]): row["payload"] for row in rows}
            if len(by_barcode) == len(barcodes):
                return (
                    [ExternalFoodCandidate.model_validate(by_barcode[barcode]) for barcode in barcodes],
                    cached["next_page"],
                    False,
                )
    try:
        items, next_page = await (
            client or default_opff_client()
        ).browse_products(
            query=query, brand=brand, food_form=food_form,
            page=page, page_size=page_size,
        )
    except (ProviderRateLimitError, TimeoutError):
        if cached:
            barcodes = [str(value) for value in (cached["barcodes"] or [])]
            if barcodes:
                async with engine.connect() as conn:
                    rows = (
                        await conn.execute(
                            text(
                                """
                                select barcode, payload
                                from public.food_catalog_products
                                where barcode = any(cast(:barcodes as text[]))
                                """
                            ),
                            {"barcodes": barcodes},
                        )
                    ).mappings().all()
                by_barcode = {str(row["barcode"]): row["payload"] for row in rows}
                if by_barcode:
                    return (
                        [ExternalFoodCandidate.model_validate(by_barcode[barcode]) for barcode in barcodes if barcode in by_barcode],
                        cached["next_page"],
                        True,
                    )
        raise
    async with engine.begin() as conn:
        for item in items:
            await conn.execute(
                text(
                    """
                    insert into public.food_catalog_products (barcode, payload)
                    values (:barcode, cast(:payload as jsonb))
                    on conflict (barcode) do update
                    set payload = excluded.payload, fetched_at = now()
                    """
                ),
                {"barcode": item.barcode, "payload": item.model_dump_json()},
            )
        await conn.execute(
            text(
                """
                insert into public.food_catalog_pages (cache_key, barcodes, next_page)
                values (:cache_key, cast(:barcodes as jsonb), :next_page)
                on conflict (cache_key) do update
                set barcodes = excluded.barcodes, next_page = excluded.next_page,
                    fetched_at = now()
                """
            ),
            {
                "cache_key": cache_key,
                "barcodes": json.dumps([item.barcode for item in items]),
                "next_page": next_page,
            },
        )
    return items, next_page, False


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
    brand, name, ingredients, _calories, analysis_values = confirmation_values(
        payload,
        lookup.get("raw_payload"),
    )
    if payload.draft_food_id:
        draft = await digestive_db.get_food_product(
            engine,
            user_id=user_id,
            food_id=payload.draft_food_id,
        )
        if draft.dog_id != payload.dog_id:
            raise ApiError(ErrorCode.NOT_FOUND, "Food draft not found")
        analysis = GuaranteedAnalysis.model_validate({**(draft.guaranteed_analysis or {}), **analysis_values})
        product = await digestive_db.verify_food_product(
            engine,
            user_id=user_id,
            food_id=draft.id,
            payload=FoodVerifyRequest(
                brand=brand or draft.brand,
                name=name,
                ingredients_raw=ingredients or draft.ingredients_raw,
                guaranteed_analysis=analysis,
                feeding_directions=draft.feeding_directions,
            ),
        )
    else:
        product = await digestive_db.create_manual_food_product(
            engine,
            user_id=user_id,
            payload=FoodManualCreateRequest(
                dog_id=payload.dog_id,
                client_request_id=f"opff-{payload.lookup_id}",
                brand=brand,
                name=name,
                ingredients_raw=ingredients,
                guaranteed_analysis=GuaranteedAnalysis.model_validate(analysis_values),
            ),
        )
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update public.food_products
                set barcode = :barcode,
                    external_source = :source,
                    external_code = :code,
                    catalog_image_url = :catalog_image_url,
                    updated_at = now()
                where id = cast(:id as uuid)
                """
            ),
            {
                "id": product.id,
                "barcode": lookup["barcode"],
                "source": lookup["provider"],
                "code": lookup.get("provider_code"),
                "catalog_image_url": (lookup.get("raw_payload") or {}).get("image_url"),
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
            "catalog_image_url": (lookup.get("raw_payload") or {}).get("image_url"),
        }
    )
