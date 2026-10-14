"""Nearby useful places via Photon + optional Nominatim phone enrichment."""

from __future__ import annotations

import asyncio
import logging
import math
import re
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import quote_plus

import httpx

from app.contracts.api import NearbyPlaceOut, NearbyPlacesResponse
from app.contracts.errors import ApiError, ErrorCode

Kind = Literal["PARK", "VET"]
logger = logging.getLogger(__name__)

PHOTON_ENDPOINT = "https://photon.komoot.io/api/"
NOMINATIM_LOOKUP = "https://nominatim.openstreetmap.org/lookup"
_USER_AGENT = "Dogly/1.0 (nearby places; contact=support@dogly.app)"


@dataclass
class _PlaceHit:
    id: str
    name: str
    kind: Kind
    distance_m: int
    lat: float
    lng: float
    maps_url: str
    osm_ref: str | None = None
    phone: str | None = None

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


def _bbox(lat: float, lng: float, radius_m: int) -> str:
    dlat = radius_m / 111_000.0
    dlng = radius_m / (111_000.0 * max(0.2, abs(math.cos(math.radians(lat)))))
    return f"{lng - dlng},{lat - dlat},{lng + dlng},{lat + dlat}"


def _photon_kind(properties: dict[str, Any], requested: Kind) -> Kind | None:
    osm_value = str(properties.get("osm_value") or "").casefold()
    osm_key = str(properties.get("osm_key") or "").casefold()
    name = str(properties.get("name") or "").casefold()
    if requested == "VET":
        if "veterinar" in osm_value or osm_value in {"veterinary", "animal_boarding"}:
            return "VET"
        if "veterinar" in name or "clinica veterinaria" in name or "ambulatorio" in name:
            return "VET"
        if osm_key in {"amenity", "healthcare", "office"}:
            return "VET"
        return None
    if requested == "PARK":
        if osm_value in {"dog_park", "park", "recreation_ground", "garden"}:
            return "PARK"
        if any(
            token in name
            for token in (
                "parco",
                "dog park",
                "sgambamento",
                "area cani",
                "dog area",
            )
        ):
            return "PARK"
        return "PARK" if osm_key == "leisure" else None
    return None


def _normalize_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d+]", "", str(raw).strip())
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) < 6:
        return None
    return cleaned if cleaned.startswith("+") else digits


async def _photon_query(
    client: httpx.AsyncClient,
    *,
    query: str,
    lat: float,
    lng: float,
    kind: Kind,
    max_distance: int,
    bbox: str,
) -> list[_PlaceHit]:
    response = await client.get(
        PHOTON_ENDPOINT,
        params={
            "q": query,
            "lat": lat,
            "lon": lng,
            "limit": 20,
            "bbox": bbox,
            "location_bias_scale": 0.5,
        },
        headers={"User-Agent": _USER_AGENT},
    )
    response.raise_for_status()
    payload = response.json()
    features = list((payload or {}).get("features") or [])
    items: list[_PlaceHit] = []
    for index, feature in enumerate(features):
        geometry = feature.get("geometry") or {}
        properties = feature.get("properties") or {}
        coords = geometry.get("coordinates")
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        plng, plat = float(coords[0]), float(coords[1])
        mapped = _photon_kind(properties, kind)
        if mapped is None:
            continue
        distance = haversine_m(lat, lng, plat, plng)
        if distance > max_distance:
            continue
        name = str(properties.get("name") or "").strip() or (
            "Parco per cani" if kind == "PARK" else "Veterinario"
        )
        osm_type = str(properties.get("osm_type") or "N").upper()[:1]
        osm_id = properties.get("osm_id") or f"{query}-{index}"
        items.append(
            _PlaceHit(
                id=f"{kind.lower()}-photon-{osm_type}{osm_id}",
                name=name,
                kind=kind,
                distance_m=distance,
                lat=plat,
                lng=plng,
                maps_url=maps_url(name, plat, plng),
                osm_ref=f"{osm_type}{osm_id}",
            )
        )
    return items


async def _fetch_photon(
    *,
    lat: float,
    lng: float,
    kind: Kind,
    radius_m: int,
) -> list[_PlaceHit]:
    queries = (
        ("veterinario", "clinica veterinaria", "veterinary")
        if kind == "VET"
        else ("parco cani", "area cani", "dog park", "sgambamento cani")
    )
    max_distance = max(radius_m, 12_000)
    bbox = _bbox(lat, lng, max_distance)
    async with httpx.AsyncClient(timeout=6.0) as client:
        batches = await asyncio.gather(
            *[
                _photon_query(
                    client,
                    query=query,
                    lat=lat,
                    lng=lng,
                    kind=kind,
                    max_distance=max_distance,
                    bbox=bbox,
                )
                for query in queries
            ],
            return_exceptions=True,
        )
    items: list[_PlaceHit] = []
    for batch in batches:
        if isinstance(batch, BaseException):
            logger.warning("Photon query failed (%s): %s", kind, batch)
            continue
        items.extend(batch)
    return items


async def _enrich_vet_phones(items: list[_PlaceHit]) -> list[_PlaceHit]:
    """Attach phone numbers for vets via Nominatim extratags when available."""
    vets = [item for item in items if item.kind == "VET" and item.osm_ref]
    if not vets:
        return items
    refs = ",".join(item.osm_ref for item in vets[:8] if item.osm_ref)
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(
                NOMINATIM_LOOKUP,
                params={"osm_ids": refs, "format": "json", "extratags": 1},
                headers={"User-Agent": _USER_AGENT},
            )
            response.raise_for_status()
            rows = list(response.json() or [])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Nominatim phone enrich failed: %s", exc)
        return items

    phones: dict[str, str] = {}
    for row in rows:
        osm_type = str(row.get("osm_type") or "")[:1].upper()
        # Nominatim uses full words: node/way/relation
        type_map = {"n": "N", "w": "W", "r": "R", "N": "N", "W": "W", "R": "R"}
        full = str(row.get("osm_type") or "").casefold()
        if full.startswith("node"):
            osm_type = "N"
        elif full.startswith("way"):
            osm_type = "W"
        elif full.startswith("relation"):
            osm_type = "R"
        else:
            osm_type = type_map.get(osm_type, osm_type)
        osm_id = row.get("osm_id")
        if osm_id is None:
            continue
        extratags = row.get("extratags") or {}
        phone = _normalize_phone(
            extratags.get("phone")
            or extratags.get("contact:phone")
            or row.get("phone")
        )
        if phone:
            phones[f"{osm_type}{osm_id}"] = phone

    if not phones:
        return items
    for item in items:
        if item.kind == "VET" and item.osm_ref and item.osm_ref in phones:
            item.phone = phones[item.osm_ref]
    return items


def _dedupe(items: list[_PlaceHit], *, limit: int = 12) -> list[_PlaceHit]:
    items = sorted(items, key=lambda item: item.distance_m)
    seen: set[tuple[str, int, int]] = set()
    unique: list[_PlaceHit] = []
    for item in items:
        key = (item.kind, int(item.lat * 1e4), int(item.lng * 1e4))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
        if len(unique) >= limit:
            break
    return unique


async def search_nearby(
    *,
    lat: float,
    lng: float,
    kind: Kind | None = None,
    radius_m: int = 8000,
) -> NearbyPlacesResponse:
    kinds: list[Kind] = [kind] if kind else ["PARK", "VET"]
    provider_errors = 0

    async def one(current: Kind, radius: int) -> list[_PlaceHit]:
        nonlocal provider_errors
        try:
            return await _fetch_photon(
                lat=lat, lng=lng, kind=current, radius_m=radius
            )
        except Exception as exc:  # noqa: BLE001
            provider_errors += 1
            logger.warning("Photon nearby failed (%s): %s", current, exc)
            return []

    batches = await asyncio.gather(*(one(current, radius_m) for current in kinds))
    unique = _dedupe([item for batch in batches for item in batch])

    # Expand once if the first pass is empty (coarse GPS / sparse OSM).
    if not unique and not provider_errors:
        wide = max(radius_m * 2, 20_000)
        batches = await asyncio.gather(*(one(current, wide) for current in kinds))
        unique = _dedupe([item for batch in batches for item in batch])

    if not unique and provider_errors:
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "Non riesco a caricare i luoghi adesso. Riprova tra poco.",
            retryable=True,
        )

    unique = await _enrich_vet_phones(unique)
    return NearbyPlacesResponse(
        items=[item.to_out() for item in unique],
        location_label=None,
    )
