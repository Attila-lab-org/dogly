"""Open Pet Food Facts adapter. Candidates only; owner confirmation required."""

from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel, Field

ATTRIBUTION = (
    "Dati alimento da Open Pet Food Facts (ODbL). "
    "https://world.openpetfoodfacts.org"
)
_DEFAULT_URL = "https://world.openpetfoodfacts.org/api/v2/product/{barcode}.json"


class ExternalFoodCandidate(BaseModel):
    barcode: str
    provider: str = "open_pet_food_facts"
    provider_code: str | None = None
    brand: str | None = None
    name: str | None = None
    ingredients_raw: str | None = None
    calories: str | None = None
    image_url: str | None = None
    attribution: str = ATTRIBUTION
    confirmation_required: bool = True
    raw: dict[str, Any] = Field(default_factory=dict)


class OpenPetFoodFactsClient:
    def __init__(
        self,
        *,
        http: httpx.AsyncClient | None = None,
        base_url: str = _DEFAULT_URL,
    ) -> None:
        self._http = http
        self._base_url = base_url

    async def lookup_barcode(self, barcode: str) -> ExternalFoodCandidate | None:
        cleaned = "".join(ch for ch in barcode if ch.isdigit())
        if len(cleaned) < 8:
            return None
        url = self._base_url.format(barcode=cleaned)
        client = self._http or httpx.AsyncClient(timeout=12.0)
        owns_client = self._http is None
        try:
            response = await client.get(url)
        except httpx.TransportError as exc:
            raise TimeoutError("Open Pet Food Facts is unreachable") from exc
        finally:
            if owns_client:
                await client.aclose()
        if response.status_code == 404:
            return None
        if response.status_code >= 500:
            raise TimeoutError(f"Open Pet Food Facts upstream {response.status_code}")
        response.raise_for_status()
        payload = response.json()
        product = payload.get("product") if isinstance(payload, dict) else None
        if not isinstance(product, dict) or payload.get("status") != 1:
            return None
        name = (
            product.get("product_name_it")
            or product.get("product_name")
            or product.get("generic_name")
        )
        brand = product.get("brands")
        ingredients = product.get("ingredients_text_it") or product.get("ingredients_text")
        nutriments = product.get("nutriments") or {}
        calories = None
        if isinstance(nutriments, dict):
            energy = nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal")
            if energy is not None:
                calories = f"{energy} kcal/100g"
        return ExternalFoodCandidate(
            barcode=cleaned,
            provider_code=str(product.get("code") or cleaned),
            brand=str(brand).split(",")[0].strip() if brand else None,
            name=str(name).strip() if name else None,
            ingredients_raw=str(ingredients).strip() if ingredients else None,
            calories=calories,
            image_url=product.get("image_url") or product.get("image_front_url"),
            raw={
                "code": product.get("code"),
                "product_name": name,
                "brands": brand,
            },
        )
