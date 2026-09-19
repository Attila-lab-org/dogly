"""Open Pet Food Facts adapter. Candidates only; owner confirmation required."""

from __future__ import annotations

import asyncio
import re
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
_SEARCH_URL = "https://world.openpetfoodfacts.org/cgi/search.pl"
_DEFAULT_USER_AGENT = "DOGly/1.0 (+https://dogly.app)"
_TRANSIENT_STATUS = frozenset({408, 500, 502, 503, 504})
_ITALIAN_NAME_HINTS = (
    "con ",
    " di ",
    "salmone",
    "pollo",
    "manzo",
    "agnello",
    "riso",
    "patate",
    "crocchette",
    "anatra",
    "tacchino",
)


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
_SEARCH_CACHE: dict[str, list[ExternalFoodCandidate]] = {}
_CAT_MARKERS = (
    "en:cat-food",
    "en:dry-cat-food",
    "en:wet-cat-food",
    "lechat",
    "per gatt",
    "per gatto",
    "cat food",
    "chat ",
    "kitten",
)
_DOG_MARKERS = (
    "en:dog-food",
    "en:dry-dog-food",
    "en:wet-dog-food",
    "per cani",
    "per cane",
    "dog food",
    "puppy",
    "hund",
    "special dog",
)


def clear_barcode_cache() -> None:
    _BARCODE_CACHE.clear()
    _SEARCH_CACHE.clear()


def _product_blob(product: dict[str, Any]) -> str:
    tags = product.get("categories_tags") or []
    return " ".join(
        [
            str(product.get("product_name_it") or ""),
            str(product.get("product_name") or ""),
            str(product.get("generic_name") or ""),
            str(product.get("brands") or ""),
            " ".join(str(tag) for tag in tags if tag),
        ]
    ).lower()


def _dog_preference(product: dict[str, Any]) -> int:
    blob = _product_blob(product)
    is_cat = any(marker in blob for marker in _CAT_MARKERS)
    is_dog = any(marker in blob for marker in _DOG_MARKERS)
    if is_dog and not is_cat:
        return 0
    if is_dog:
        return 1
    if is_cat:
        return 3
    return 2


def spoken_product_name(*candidates: Any) -> str | None:
    """Keep one owner-readable name, not a catalog dump of translations."""
    parts: list[str] = []
    for raw in candidates:
        if not raw:
            continue
        text = re.sub(r"[\n\r]+", " · ", str(raw))
        parts.extend(
            part.strip(" ·/\t")
            for part in re.split(r"[·|/]+", text)
            if part.strip(" ·/\t")
        )
    if not parts:
        return None
    chosen = parts[0]
    for part in parts:
        low = part.lower()
        if any(hint in low for hint in _ITALIAN_NAME_HINTS):
            chosen = part
            break
    else:
        chosen = min(parts, key=len) if len(parts) > 1 else parts[0]
    cleaned = re.sub(r"\s+", " ", chosen).strip()
    if not cleaned:
        return None
    return cleaned[0].upper() + cleaned[1:]


def _candidate_from_product(
    product: dict[str, Any], *, barcode: str | None = None
) -> ExternalFoodCandidate | None:
    code = "".join(ch for ch in str(barcode or product.get("code") or "") if ch.isdigit())
    if len(code) < 8:
        return None
    brand = product.get("brands")
    brand_label = str(brand).split(",")[0].strip() if brand else ""
    name = spoken_product_name(
        product.get("product_name_it"),
        product.get("product_name"),
        product.get("generic_name"),
        product.get("abbreviated_product_name"),
        brand_label,
    )
    if not name:
        return None
    ingredients = product.get("ingredients_text_it") or product.get("ingredients_text")
    nutriments = product.get("nutriments") or {}
    calories = None
    if isinstance(nutriments, dict):
        energy = nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal")
        if energy is not None:
            calories = f"{energy} kcal/100g"
    return ExternalFoodCandidate(
        barcode=code,
        provider_code=str(product.get("code") or code),
        brand=str(brand).split(",")[0].strip() if brand else None,
        name=name,
        ingredients_raw=str(ingredients).strip() if ingredients else None,
        calories=calories,
        image_url=product.get("image_url") or product.get("image_front_url"),
        raw={"code": product.get("code"), "product_name": name, "brands": brand},
    )


def _parse_product(cleaned: str, payload: dict[str, Any]) -> ExternalFoodCandidate | None:
    product = payload.get("product") if isinstance(payload, dict) else None
    if not isinstance(product, dict) or payload.get("status") != 1:
        return None
    return _candidate_from_product(product, barcode=cleaned)


class OpenPetFoodFactsClient:
    def __init__(
        self,
        *,
        http: httpx.AsyncClient | None = None,
        base_url: str = _DEFAULT_URL,
        user_agent: str = _DEFAULT_USER_AGENT,
        cache: dict[str, ExternalFoodCandidate | None] | None = None,
        search_cache: dict[str, list[ExternalFoodCandidate]] | None = None,
        max_retries: int = 2,
        sleeper: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._http = http
        self._base_url = base_url
        self._user_agent = user_agent or _DEFAULT_USER_AGENT
        self._cache = cache if cache is not None else _BARCODE_CACHE
        self._search_cache = search_cache if search_cache is not None else _SEARCH_CACHE
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

    async def search_products(
        self, query: str, *, limit: int = 12
    ) -> list[ExternalFoodCandidate]:
        cleaned = " ".join(query.split())
        if len(cleaned) < 2:
            return []
        cache_key = cleaned.casefold()
        if cache_key in self._search_cache:
            return [
                item.model_copy(deep=True) for item in self._search_cache[cache_key]
            ]
        page_size = max(limit, min(limit * 2, 20))
        payload = await self._request_json(
            _SEARCH_URL,
            params={
                "search_terms": cleaned,
                "search_simple": "1",
                "action": "process",
                "json": "1",
                "page": "1",
                "page_size": str(page_size),
            },
        )
        products = payload.get("products") if isinstance(payload, dict) else None
        if not isinstance(products, list):
            self._search_cache[cache_key] = []
            return []
        ranked = sorted(
            (item for item in products if isinstance(item, dict)),
            key=_dog_preference,
        )
        preferred = [item for item in ranked if _dog_preference(item) < 3]
        pool = preferred or ranked
        found: list[ExternalFoodCandidate] = []
        seen: set[str] = set()
        for item in pool:
            candidate = _candidate_from_product(item)
            if candidate is None or candidate.barcode in seen:
                continue
            seen.add(candidate.barcode)
            found.append(candidate)
            if len(found) >= limit:
                break
        self._search_cache[cache_key] = [
            item.model_copy(deep=True) for item in found
        ]
        return found

    async def _request_json(
        self,
        url: str,
        *,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        attempts = self._max_retries + 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            client = self._http or httpx.AsyncClient(timeout=12.0)
            owns_client = self._http is None
            try:
                response = await client.get(url, headers=headers, params=params)
            except httpx.TransportError as exc:
                last_error = TimeoutError("Open Pet Food Facts is unreachable")
                last_error.__cause__ = exc
            else:
                if response.status_code == 429:
                    raise ProviderRateLimitError("Open Pet Food Facts rate limit")
                if response.status_code == 404:
                    return {}
                if response.status_code in _TRANSIENT_STATUS:
                    last_error = TimeoutError(
                        f"Open Pet Food Facts upstream {response.status_code}"
                    )
                elif response.status_code >= 400:
                    response.raise_for_status()
                else:
                    data = response.json()
                    return data if isinstance(data, dict) else {}
            finally:
                if owns_client:
                    await client.aclose()
            if attempt < attempts - 1:
                await self._sleeper(0.2 * (2**attempt))
        if last_error is not None:
            raise last_error
        return {}

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
