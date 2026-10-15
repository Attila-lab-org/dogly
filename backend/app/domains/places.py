"""Nearby useful places via Google Places Text Search (New).

Overpass/Photon are gone: production was timing out / returning garbage.
Requires GOOGLE_PLACES_API_KEY (Places API New enabled).
"""
from __future__ import annotations

import asyncio
import logging
import math
import re
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import quote_plus

import httpx

from app.config import get_settings
from app.contracts.api import NearbyPlaceOut, NearbyPlacesResponse
from app.contracts.errors import ApiError, ErrorCode

Kind = Literal["PARK", "VET"]
logger = logging.getLogger(__name__)

PLACES_TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = (
    "places.id,places.displayName,places.location,"
    "places.types,places.primaryType,places.nationalPhoneNumber,"
    "places.internationalPhoneNumber"
)

RESULT_LIMIT = 20
PER_KIND_LIMIT = 12
DEFAULT_RADIUS_M = 8_000

# Text queries tuned for IT; dog_park first, then generic parks as fill.
_VET_QUERIES = ("clinica veterinaria", "veterinario")
_EMERGENCY_VET_QUERIES = (
    "pronto soccorso veterinario",
    "clinica veterinaria 24 ore",
    "ospedale veterinario",
)
_PARK_QUERIES = ("area cani", "dog park", "sgambamento cani", "parco")

Purpose = Literal["default", "emergency"]

_VET_TYPES = frozenset({"veterinary_care"})
_PARK_TYPES = frozenset({"dog_park", "park"})
_REJECT_TYPES = frozenset(
    {
        "pharmacy",
        "drugstore",
        "parking",
        "parking_lot",
        "parking_garage",
        "gas_station",
        "restaurant",
        "cafe",
        "bar",
        "lodging",
        "hotel",
        "supermarket",
        "convenience_store",
    }
)


@dataclass
class _PlaceHit:
    id: str
    name: str
    kind: Kind
    distance_m: int
    lat: float
    lng: float
    maps_url: str
    phone: str | None = None
    park_rank: int = 0

    def to_out(self) -> NearbyPlaceOut:
        return NearbyPlaceOut(
            id=self.id,
            name=self.name,
            kind=self.kind,
            distance_m=self.distance_m,
            lat=self.lat,
            lng=self.lng,
            maps_url=self.maps_url,
            phone=self.phone,
        )


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    radius = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def maps_url(name: str, lat: float, lng: float) -> str:
    query = quote_plus(f"{name} @{lat},{lng}")
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def _normalize_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d+]", "", str(raw).strip())
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) < 6:
        return None
    return cleaned if cleaned.startswith("+") else digits


def _api_key() -> str:
    return (get_settings().google_places_api_key or "").strip()


def _accept_place(place: dict[str, Any], kind: Kind) -> bool:
    primary = str(place.get("primaryType") or "").casefold()
    types = {str(t).casefold() for t in (place.get("types") or [])}
    name = str((place.get("displayName") or {}).get("text") or "").casefold()

    if kind == "VET":
        if primary in {"pharmacy", "drugstore"}:
            return False
        if primary in _VET_TYPES or "veterinary_care" in types:
            return True
        return "veterinar" in name or "clinica veterinaria" in name

    # PARK — drop parking lots / shops even if the query matched loosely.
    if primary in _REJECT_TYPES:
        return False
    if primary == "dog_park" or "dog_park" in types:
        return True
    if primary == "park" or "park" in types:
        return True
    dog_tokens = ("area cani", "dog park", "sgambamento", "parco cani", "dog area")
    if any(token in name for token in dog_tokens):
        return True
    return any(token in name for token in ("parco", "giardino", "garden"))


def _park_rank(place: dict[str, Any]) -> int:
    primary = str(place.get("primaryType") or "").casefold()
    types = {str(t).casefold() for t in (place.get("types") or [])}
    name = str((place.get("displayName") or {}).get("text") or "").casefold()
    if primary == "dog_park" or "dog_park" in types:
        return 0
    if any(t in name for t in ("area cani", "dog park", "sgambamento", "parco cani")):
        return 0
    return 2


def _parse_places(
    payload: dict[str, Any],
    *,
    lat: float,
    lng: float,
    kind: Kind,
    radius_m: int,
) -> list[_PlaceHit]:
    items: list[_PlaceHit] = []
    for place in payload.get("places") or []:
        if not _accept_place(place, kind):
            continue
        location = place.get("location") or {}
        plat, plng = location.get("latitude"), location.get("longitude")
        if plat is None or plng is None:
            continue
        flat, flng = float(plat), float(plng)
        distance = haversine_m(lat, lng, flat, flng)
        if distance > radius_m:
            continue
        name = str((place.get("displayName") or {}).get("text") or "").strip()
        if not name:
            name = "Veterinario" if kind == "VET" else "Parco / area cani"
        place_id = str(place.get("id") or f"{kind}-{flat}-{flng}")
        phone = _normalize_phone(
            place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber")
        )
        items.append(
            _PlaceHit(
                id=f"{kind.lower()}-g-{place_id}",
                name=name,
                kind=kind,
                distance_m=distance,
                lat=flat,
                lng=flng,
                maps_url=maps_url(name, flat, flng),
                phone=phone,
                park_rank=_park_rank(place) if kind == "PARK" else 0,
            )
        )
    return items


async def _text_search_one(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    query: str,
    lat: float,
    lng: float,
    radius_m: int,
) -> dict[str, Any]:
    body = {
        "textQuery": query,
        "languageCode": "it",
        "maxResultCount": 15,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": float(radius_m),
            }
        },
    }
    response = await client.post(
        PLACES_TEXT_SEARCH,
        json=body,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        },
    )
    response.raise_for_status()
    return response.json()


async def _fetch_kind(
    *,
    lat: float,
    lng: float,
    kind: Kind,
    radius_m: int,
    api_key: str,
    purpose: Purpose = "default",
) -> list[_PlaceHit]:
    if kind == "VET":
        queries = (
            _EMERGENCY_VET_QUERIES if purpose == "emergency" else _VET_QUERIES
        )
    else:
        queries = _PARK_QUERIES
    async with httpx.AsyncClient(timeout=12.0) as client:
        batches = await asyncio.gather(
            *[
                _text_search_one(
                    client,
                    api_key=api_key,
                    query=query,
                    lat=lat,
                    lng=lng,
                    radius_m=radius_m,
                )
                for query in queries
            ],
            return_exceptions=True,
        )

    items: list[_PlaceHit] = []
    errors = 0
    for batch in batches:
        if isinstance(batch, BaseException):
            errors += 1
            logger.warning("Google Places text search failed (%s): %s", kind, batch)
            continue
        items.extend(
            _parse_places(batch, lat=lat, lng=lng, kind=kind, radius_m=radius_m)
        )

    if not items and errors == len(batches):
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "Non riesco a caricare i luoghi adesso. Riprova tra poco.",
            retryable=True,
        )
    return items


def _dedupe(items: list[_PlaceHit], *, limit: int = RESULT_LIMIT) -> list[_PlaceHit]:
    items = sorted(items, key=lambda item: (item.park_rank, item.distance_m))
    seen: set[tuple[str, str, int, int]] = set()
    unique: list[_PlaceHit] = []
    for item in items:
        key = (
            item.name.casefold(),
            item.kind,
            int(item.lat * 1e4),
            int(item.lng * 1e4),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
        if len(unique) >= limit:
            break
    return unique


def _merge_balanced(parks: list[_PlaceHit], vets: list[_PlaceHit]) -> list[_PlaceHit]:
    parks_u = _dedupe(parks, limit=PER_KIND_LIMIT)
    vets_u = _dedupe(vets, limit=PER_KIND_LIMIT)
    return sorted(parks_u + vets_u, key=lambda item: item.distance_m)


async def _search_kind_with_widen(
    *,
    lat: float,
    lng: float,
    kind: Kind,
    radius_m: int,
    api_key: str,
    purpose: Purpose = "default",
) -> list[_PlaceHit]:
    items = await _fetch_kind(
        lat=lat,
        lng=lng,
        kind=kind,
        radius_m=radius_m,
        api_key=api_key,
        purpose=purpose,
    )
    if items:
        return items
    wide = max(radius_m * 2, 20_000)
    return await _fetch_kind(
        lat=lat,
        lng=lng,
        kind=kind,
        radius_m=wide,
        api_key=api_key,
        purpose=purpose,
    )


async def search_nearby(
    *,
    lat: float,
    lng: float,
    kind: Kind | None = None,
    radius_m: int = DEFAULT_RADIUS_M,
    purpose: Purpose = "default",
) -> NearbyPlacesResponse:
    api_key = _api_key()
    if not api_key:
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "Ricerca luoghi non configurata. Riprova più tardi.",
            retryable=True,
        )

    # Emergency mode always searches vets (24h / pronto soccorso).
    effective_kind: Kind | None = "VET" if purpose == "emergency" else kind

    try:
        if effective_kind is None:
            parks, vets = await asyncio.gather(
                _search_kind_with_widen(
                    lat=lat, lng=lng, kind="PARK", radius_m=radius_m, api_key=api_key
                ),
                _search_kind_with_widen(
                    lat=lat, lng=lng, kind="VET", radius_m=radius_m, api_key=api_key
                ),
            )
            unique = _merge_balanced(parks, vets)
        else:
            items = await _search_kind_with_widen(
                lat=lat,
                lng=lng,
                kind=effective_kind,
                radius_m=radius_m,
                api_key=api_key,
                purpose=purpose,
            )
            unique = _dedupe(items, limit=RESULT_LIMIT)
    except ApiError:
        raise
    except Exception as exc:
        logger.warning("Google Places nearby failed: %s", exc)
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "Non riesco a caricare i luoghi adesso. Riprova tra poco.",
            retryable=True,
        ) from exc

    return NearbyPlacesResponse(
        items=[item.to_out() for item in unique],
        location_label=None,
    )
