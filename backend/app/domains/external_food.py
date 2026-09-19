"""Owner-confirmed external food lookup. Never persist candidates as food."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.contracts.api import (
    ExternalFoodConfirmRequest,
    ExternalFoodLookupRequest,
    ExternalFoodSearchRequest,
    FoodManualCreateRequest,
    GuaranteedAnalysis,
)
from app.contracts.errors import ApiError, ErrorCode
from app.domains.digestive import create_manual_food_product
from app.domains.dogs import get_owned_dog
from app.domains.models import FoodProductRec
from app.domains.repository import InMemoryStore, new_id, now_utc
from app.providers.base import ProviderRateLimitError
from app.providers.open_pet_food_facts import (
    ExternalFoodCandidate,
    OpenPetFoodFactsClient,
)


def default_opff_client() -> OpenPetFoodFactsClient:
    from app.config import get_settings

    return OpenPetFoodFactsClient(
        user_agent=get_settings().open_pet_food_facts_user_agent
    )


async def fetch_candidate(
    adapter: OpenPetFoodFactsClient, barcode: str
) -> ExternalFoodCandidate:
    try:
        candidate = await adapter.lookup_barcode(barcode)
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
    if candidate is None or not candidate.name:
        raise ApiError(
            ErrorCode.NOT_FOUND,
            "Non ho trovato un alimento confermabile per questo codice.",
        )
    return candidate


def _require_feature(enabled: bool) -> None:
    if not enabled:
        raise ApiError(
            ErrorCode.NOT_FOUND,
            "Questa funzione non è ancora disponibile.",
        )


async def lookup_external_food(
    store: InMemoryStore,
    *,
    user_id: str,
    payload: ExternalFoodLookupRequest,
    enabled: bool,
    client: OpenPetFoodFactsClient | None = None,
) -> tuple[str, ExternalFoodCandidate]:
    _require_feature(enabled)
    get_owned_dog(store, user_id=user_id, dog_id=payload.dog_id)
    candidate = await fetch_candidate(client or default_opff_client(), payload.barcode)
    lookup_id = new_id()
    store.external_food_lookups[lookup_id] = {
        "id": lookup_id,
        "user_id": user_id,
        "dog_id": payload.dog_id,
        "barcode": candidate.barcode,
        "provider": candidate.provider,
        "provider_code": candidate.provider_code,
        "status": "CANDIDATE",
        "candidate": candidate.model_dump(mode="json"),
        "created_at": now_utc(),
        "client_request_id": payload.client_request_id,
    }
    return lookup_id, candidate


async def search_external_foods(
    store: InMemoryStore,
    *,
    user_id: str,
    payload: ExternalFoodSearchRequest,
    enabled: bool,
    client: OpenPetFoodFactsClient | None = None,
) -> list[tuple[str, ExternalFoodCandidate]]:
    _require_feature(enabled)
    get_owned_dog(store, user_id=user_id, dog_id=payload.dog_id)
    try:
        hits = await (client or default_opff_client()).search_products(payload.query)
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
    for index, candidate in enumerate(hits):
        lookup_id = new_id()
        store.external_food_lookups[lookup_id] = {
            "id": lookup_id,
            "user_id": user_id,
            "dog_id": payload.dog_id,
            "barcode": candidate.barcode,
            "provider": candidate.provider,
            "provider_code": candidate.provider_code,
            "status": "CANDIDATE",
            "candidate": candidate.model_dump(mode="json"),
            "created_at": now_utc(),
            "client_request_id": f"{payload.client_request_id}-{candidate.barcode or index}",
        }
        results.append((lookup_id, candidate))
    return results


def confirm_external_food(
    store: InMemoryStore,
    *,
    user_id: str,
    payload: ExternalFoodConfirmRequest,
    enabled: bool,
) -> FoodProductRec:
    _require_feature(enabled)
    lookup = store.external_food_lookups.get(payload.lookup_id)
    if (
        lookup is None
        or lookup["user_id"] != user_id
        or lookup["dog_id"] != payload.dog_id
    ):
        raise ApiError(ErrorCode.NOT_FOUND, "Lookup not found")
    if lookup["status"] == "CONFIRMED" and lookup.get("food_product_id"):
        return store.food_products[lookup["food_product_id"]]
    product = create_manual_food_product(
        store,
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
    updated = product.model_copy(
        update={
            "barcode": lookup["barcode"],
            "external_source": lookup["provider"],
            "external_code": lookup.get("provider_code"),
        }
    )
    store.food_products[updated.id] = updated
    lookup["status"] = "CONFIRMED"
    lookup["food_product_id"] = updated.id
    lookup["confirmed_at"] = now_utc()
    return updated


def lookup_audit_row(lookup: dict[str, Any]) -> dict[str, Any]:
    created = lookup.get("created_at")
    return {
        "id": lookup["id"],
        "status": lookup["status"],
        "barcode": lookup["barcode"],
        "created_at": created.isoformat() if isinstance(created, datetime) else created,
    }
