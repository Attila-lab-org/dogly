"""Open Pet Food Facts adapter. Candidates only; owner confirmation required."""

from __future__ import annotations

import asyncio
import re
import unicodedata
from collections import Counter
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
    variant: str | None = None
    package_size: str | None = None
    food_form: str | None = None
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
    "babycat",
    "feline",
    "persian",
    "british shorthair",
    "per gatti",
    "for cats",
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


def _fold(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(ch for ch in text if not unicodedata.combining(ch)).casefold()


def _dog_preference(product: dict[str, Any]) -> int:
    blob = _fold(_product_blob(product))
    is_cat = any(marker in blob for marker in _CAT_MARKERS)
    is_dog = any(marker in blob for marker in _DOG_MARKERS)
    if is_dog and not is_cat:
        return 0
    if is_dog:
        return 1
    if is_cat:
        return 3
    return 2


_NOISE_IN_NAME = re.compile(r"#\S+|\bkm\b", re.I)
_QUANTITY_RE = re.compile(r"([\d]+(?:[.,]\d+)?)\s*(kg|g)\b", re.I)
_DRY_MARKERS = (
    "en:dry-dog-food",
    "en:dry-pet-food",
    "crocchett",
    "kibble",
    "croquette",
)
_WET_MARKERS = (
    "en:wet-dog-food",
    "en:wet-pet-food",
    "paté",
    "pate",
    "umido",
    "pouch",
    "gravy",
)


def _title_case_name(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(" -·,")
    if not cleaned:
        return ""
    return cleaned[0].upper() + cleaned[1:]


def _clean_catalog_name(value: str) -> str:
    cleaned = _NOISE_IN_NAME.sub(" ", value)
    return _title_case_name(cleaned)


def spoken_product_name(*candidates: Any) -> str | None:
    """Keep one owner-readable name, not a catalog dump of translations."""
    parts: list[str] = []
    for raw in candidates:
        if not raw:
            continue
        text = re.sub(r"[\n\r]+", " · ", str(raw))
        parts.extend(
            part.strip(" ·/\t")
            for part in re.split(r"[·|]+", text)
            if part.strip(" ·/\t")
        )
    if not parts:
        return None
    cleaned_parts = [part for part in (_clean_catalog_name(part) for part in parts) if part]
    if not cleaned_parts:
        return None
    chosen = cleaned_parts[0]
    italian = [
        part
        for part in cleaned_parts
        if any(hint in part.lower() for hint in _ITALIAN_NAME_HINTS)
    ]
    if italian:
        chosen = max(italian, key=len)
    else:
        chosen = max(cleaned_parts, key=len)
    return chosen or None


def _spoken_quantity(raw: Any) -> str | None:
    if not raw:
        return None
    text = str(raw).strip()
    match = _QUANTITY_RE.search(text)
    if not match:
        compact = re.match(r"([\d]+(?:[.,]\d+)?)k\b", text, re.I)
        if compact:
            return f"{compact.group(1)} kg"
        return text if 0 < len(text) <= 16 else None
    number, unit = match.group(1), match.group(2).lower()
    return f"{number.replace('.', ',')} {unit}"


def _food_form(product: dict[str, Any]) -> str | None:
    blob = _product_blob(product)
    if any(marker in blob for marker in _DRY_MARKERS):
        return "crocchette"
    if any(marker in blob for marker in _WET_MARKERS):
        return "umido"
    return None


def _variant_label(product: dict[str, Any], name: str) -> str | None:
    bits: list[str] = []
    quantity = _spoken_quantity(product.get("quantity"))
    if quantity and quantity.casefold() not in name.casefold():
        bits.append(quantity)
    form = _food_form(product)
    if form and form not in name.casefold():
        bits.append(form)
    return " · ".join(bits) or None


def _query_tokens(query: str) -> list[str]:
    return [token for token in _fold(query).split() if token]


def _token_matches(product: dict[str, Any], tokens: list[str]) -> int:
    blob = _fold(_product_blob(product))
    return sum(1 for token in tokens if token in blob)


def _rank_product(product: dict[str, Any], tokens: list[str]) -> tuple[int, int, int, int]:
    name = str(product.get("product_name_it") or product.get("product_name") or "")
    brand = str(product.get("brands") or "").split(",")[0].strip()
    specific = 0 if name and brand and name.casefold() == brand.casefold() else 1
    has_quantity = 1 if product.get("quantity") else 0
    return (
        _dog_preference(product),
        -_token_matches(product, tokens),
        -specific,
        -has_quantity,
    )


def _brand_from_tags(product: dict[str, Any]) -> str | None:
    tags = product.get("brands_tags")
    if not isinstance(tags, list):
        return None
    for tag in tags:
        cleaned = str(tag or "").strip()
        if not cleaned:
            continue
        return " ".join(part.capitalize() for part in cleaned.replace("_", "-").split("-"))
    return None


def _raw_brand(product: dict[str, Any]) -> str | None:
    brands = str(product.get("brands") or "").split(",")[0].strip()
    return brands or _brand_from_tags(product)


def _canonical_brand_label(value: str) -> str:
    words = value.split()
    return " ".join(
        word.upper() if len(word) <= 3 and word.isalpha() else word[:1].upper() + word[1:]
        for word in words
    )


def _enrich_missing_brands(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Use catalog siblings to recover a brand omitted on one product row."""
    counts: Counter[str] = Counter()
    labels: dict[str, str] = {}
    for product in products:
        raw = _raw_brand(product)
        if not raw:
            continue
        key = _fold(raw)
        counts[key] += 1
        labels.setdefault(key, _canonical_brand_label(raw))
    known = sorted(counts, key=lambda key: (-len(key), -counts[key]))
    enriched: list[dict[str, Any]] = []
    for product in products:
        copy = dict(product)
        if not _raw_brand(copy):
            blob = _fold(
                " ".join(
                    str(copy.get(key) or "")
                    for key in (
                        "product_name_it",
                        "product_name",
                        "generic_name",
                        "abbreviated_product_name",
                    )
                )
            )
            for key in known:
                if re.search(rf"(?<!\w){re.escape(key)}(?!\w)", blob):
                    copy["brands"] = labels[key]
                    break
        enriched.append(copy)
    return enriched


def _candidate_signature(candidate: ExternalFoodCandidate) -> tuple[str, ...]:
    return (
        _fold(candidate.brand),
        _fold(candidate.name),
        _fold(candidate.package_size),
        _fold(candidate.food_form),
    )


def _candidate_from_product(
    product: dict[str, Any], *, barcode: str | None = None
) -> ExternalFoodCandidate | None:
    code = "".join(ch for ch in str(barcode or product.get("code") or "") if ch.isdigit())
    if len(code) < 8:
        return None
    brand = product.get("brands")
    brand_label = _raw_brand(product) or ""
    if brand_label:
        brand_label = _canonical_brand_label(brand_label)
    name = spoken_product_name(
        product.get("product_name_it"),
        product.get("product_name"),
        product.get("generic_name"),
        product.get("abbreviated_product_name"),
    ) or (brand_label or None)
    if not name:
        return None
    quantity = _spoken_quantity(product.get("quantity"))
    if brand_label and name.casefold() == brand_label.casefold() and not quantity:
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
        brand=brand_label or None,
        name=name,
        variant=_variant_label(product, name),
        package_size=quantity,
        food_form=_food_form(product),
        ingredients_raw=str(ingredients).strip() if ingredients else None,
        calories=calories,
        image_url=(
            product.get("image_front_small_url")
            or product.get("image_url")
            or product.get("image_front_url")
        ),
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

    async def _search_page(
        self, query: str, *, page_size: int, page: int = 1
    ) -> list[dict[str, Any]]:
        payload = await self._request_json(
            _SEARCH_URL,
            params={
                "search_terms": query,
                "search_simple": "1",
                "action": "process",
                "json": "1",
                "page": str(page),
                "page_size": str(page_size),
            },
        )
        products = payload.get("products") if isinstance(payload, dict) else None
        if not isinstance(products, list):
            return []
        return [item for item in products if isinstance(item, dict)]

    def _candidates_from_products(
        self,
        products: list[dict[str, Any]],
        *,
        query: str,
        limit: int,
    ) -> list[ExternalFoodCandidate]:
        tokens = _query_tokens(query)
        ranked = sorted(
            _enrich_missing_brands(products),
            key=lambda item: _rank_product(item, tokens),
        )
        preferred = [item for item in ranked if _dog_preference(item) < 3]
        pool = preferred or ranked
        found: list[ExternalFoodCandidate] = []
        seen_codes: set[str] = set()
        seen_variants: set[tuple[str, ...]] = set()
        for item in pool:
            candidate = _candidate_from_product(item)
            if candidate is None or candidate.barcode in seen_codes:
                continue
            signature = _candidate_signature(candidate)
            if signature in seen_variants:
                continue
            seen_codes.add(candidate.barcode)
            seen_variants.add(signature)
            found.append(candidate)
            if len(found) >= limit:
                break
        return found

    async def search_products(
        self, query: str, *, limit: int = 20
    ) -> list[ExternalFoodCandidate]:
        cleaned = " ".join(query.split())
        if len(cleaned) < 2:
            return []
        cache_key = cleaned.casefold()
        if cache_key in self._search_cache:
            return [
                item.model_copy(deep=True) for item in self._search_cache[cache_key]
            ]
        page_size = 24
        products = await self._search_page(cleaned, page_size=page_size)
        tokens = _query_tokens(cleaned)
        usable = [
            item
            for item in products
            if _candidate_from_product(item) is not None and _dog_preference(item) < 3
        ]
        if len(usable) < 8 and tokens:
            fallback_query = tokens[0]
            fallback_page = 1 if len(tokens) >= 2 else 2
            extra = await self._search_page(
                fallback_query,
                page_size=page_size,
                page=fallback_page,
            )
            seen = {
                str(item.get("code") or "")
                for item in products
                if item.get("code")
            }
            for item in extra:
                code = str(item.get("code") or "")
                if code and code in seen:
                    continue
                if code:
                    seen.add(code)
                products.append(item)
        found = self._candidates_from_products(products, query=cleaned, limit=limit)
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
