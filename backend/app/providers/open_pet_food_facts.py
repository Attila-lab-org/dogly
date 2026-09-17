"""Open Pet Food Facts adapter. Candidates only; owner confirmation required."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from pydantic import BaseModel, Field

from app.providers.base import ProviderRateLimitError

ATTRIBUTION = (
    "Dati alimento da Open Pet Food Facts (ODbL). "
    "https://world.openpetfoodfacts.org"
)
_DEFAULT_URL = "https://world.openpetfoodfacts.org/api/v2/product/{barcode}.json"
_DEFAULT_USER_AGENT = "DOGly/1.0 (+https://dogly.app)"
_TRANSIENT_STATUS = frozenset({408, 500, 502, 503, 504})


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


_BARCODE_CACHE: dict[str, ExternalFoodCandidate | None] = {}


def clear_barcode_cache() -> None:
    _BARCODE_CACHE.clear()


def _parse_product(cleaned: str, payload: dict[str, Any]) -> ExternalFoodCandidate | None:
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


class OpenPetFoodFactsClient:
    def __init__(
        self,
        *,
        http: httpx.AsyncClient | None = None,
        base_url: str = _DEFAULT_URL,
        user_agent: str = _DEFAULT_USER_AGENT,
        cache: dict[str, ExternalFoodCandidate | None] | None = None,
        max_retries: int = 2,
        sleeper: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._http = http
        self._base_url = base_url
        self._user_agent = user_agent or _DEFAULT_USER_AGENT
        self._cache = cache if cache is not None else _BARCODE_CACHE
        self._max_retries = max_retries
        self._sleeper = sleeper or asyncio.sleep

    async def lookup_barcode(self, barcode: str) -> ExternalFoodCandidate | None:
        cleaned = "".join(ch for ch in barcode if ch.isdigit())
        if len(cleaned) < 8:
            return None
        if cleaned in self._cache:
            cached = self._cache[cleaned]
            return cached.model_copy(deep=True) if cached is not None else None
        candidate = await self._fetch(cleaned)
        self._cache[cleaned] = (
            candidate.model_copy(deep=True) if candidate is not None else None
        )
        return candidate

    async def _fetch(self, cleaned: str) -> ExternalFoodCandidate | None:
        url = self._base_url.format(barcode=cleaned)
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        attempts = self._max_retries + 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            client = self._http or httpx.AsyncClient(timeout=12.0)
            owns_client = self._http is None
            try:
                response = await client.get(url, headers=headers)
            except httpx.TransportError as exc:
                last_error = TimeoutError("Open Pet Food Facts is unreachable")
                last_error.__cause__ = exc
            else:
                if response.status_code == 429:
                    raise ProviderRateLimitError("Open Pet Food Facts rate limit")
                if response.status_code == 404:
                    return None
                if response.status_code in _TRANSIENT_STATUS:
                    last_error = TimeoutError(
                        f"Open Pet Food Facts upstream {response.status_code}"
                    )
                elif response.status_code >= 400:
                    response.raise_for_status()
                else:
                    return _parse_product(cleaned, response.json())
            finally:
                if owns_client:
                    await client.aclose()
            if attempt < attempts - 1:
                await self._sleeper(0.2 * (2**attempt))
        if last_error is not None:
            raise last_error
        return None
