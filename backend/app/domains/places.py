"""Nearby useful places: Overpass (POI OSM) primary, Photon fallback.

Correzioni v1 Social:
- con kind=None non far saturare i 12 slot dai leisure=park (i vet sparivano);
- se Overpass risponde vuoto → Photon (prima solo su exception);
- tag healthcare=veterinary + mirror Overpass;
- priorità dog_park rispetto ai parchi generici.
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

from app.contracts.api import NearbyPlaceOut, NearbyPlacesResponse
from app.contracts.errors import ApiError, ErrorCode

Kind = Literal["PARK", "VET"]
logger = logging.getLogger(__name__)

OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
PHOTON_ENDPOINT = "https://photon.komoot.io/api/"
NOMINATIM_LOOKUP = "https://nominatim.openstreetmap.org/lookup"
_USER_AGENT = "Dogly/1.0 (nearby places; contact=support@dogly.app)"

RESULT_LIMIT = 20
PER_KIND_LIMIT = 12
DEFAULT_RADIUS_M = 8_000


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


def _normalize_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d+]", "", str(raw).strip())
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) < 6:
        return None
    return cleaned if cleaned.startswith("+") else digits


# ---------------------------------------------------------------------------
# Overpass (sorgente primaria)
# ---------------------------------------------------------------------------


def _overpass_query_text(
    *,
    lat: float,
    lng: float,
    kind: Kind | None,
    radius_m: int,
) -> str:
    parts: list[str] = []
    if kind in (None, "VET"):
        parts.append(f'nwr(around:{radius_m},{lat},{lng})["amenity"="veterinary"];')
        parts.append(f'nwr(around:{radius_m},{lat},{lng})["healthcare"="veterinary"];')
        parts.append(f'nwr(around:{radius_m},{lat},{lng})["office"="veterinary"];')
    if kind in (None, "PARK"):
        # dog_park prima; park/recreation_ground come riempimento.
        parts.append(f'nwr(around:{radius_m},{lat},{lng})["leisure"="dog_park"];')
        parts.append(
            f'nwr(around:{radius_m},{lat},{lng})'
            '["leisure"~"^(park|recreation_ground)$"];'
        )
        parts.append(f'nwr(around:{radius_m},{lat},{lng})["dog"="yes"]["leisure"="park"];')
    body = "\n  ".join(parts)
    return f"[out:json][timeout:15];\n(\n  {body}\n);\nout center tags;"


def _overpass_hit_kind(tags: dict[str, Any]) -> Kind | None:
    amenity = str(tags.get("amenity") or "").casefold()
    healthcare = str(tags.get("healthcare") or "").casefold()
    office = str(tags.get("office") or "").casefold()
    if "veterinar" in amenity or amenity == "veterinary":
        return "VET"
    if "veterinar" in healthcare or healthcare == "veterinary":
        return "VET"
    if "veterinar" in office or office == "veterinary":
        return "VET"
    leisure = str(tags.get("leisure") or "").casefold()
    if leisure in {"dog_park", "park", "recreation_ground"}:
        return "PARK"
    if str(tags.get("dog") or "").casefold() in {"yes", "designated"} and leisure:
        return "PARK"
    return None


def _overpass_name(tags: dict[str, Any], kind: Kind) -> str:
    name = str(tags.get("name") or "").strip()
    if name:
        return name
    if kind == "VET":
        return "Veterinario"
    leisure = str(tags.get("leisure") or "").casefold()
    return "Area cani" if leisure == "dog_park" else "Parco"


def _park_rank(tags: dict[str, Any]) -> int:
    """Più basso = più rilevante per un cane."""
    leisure = str(tags.get("leisure") or "").casefold()
    if leisure == "dog_park":
        return 0
    if str(tags.get("dog") or "").casefold() in {"yes", "designated"}:
        return 1
    if leisure == "recreation_ground":
        return 2
    return 3


def _parse_overpass(
    payload: dict[str, Any],
    *,
    lat: float,
    lng: float,
    kind: Kind | None,
    radius_m: int,
) -> list[_PlaceHit]:
    items: list[_PlaceHit] = []
    for element in payload.get("elements") or []:
        etype = str(element.get("type") or "")
        eid = element.get("id")
        if etype == "node":
            plat, plng = element.get("lat"), element.get("lon")
        else:
            center = element.get("center") or {}
            plat, plng = center.get("lat"), center.get("lon")
        if plat is None or plng is None or eid is None:
            continue
        tags = element.get("tags") or {}
        hit_kind = _overpass_hit_kind(tags)
        if hit_kind is None or (kind and hit_kind != kind):
            continue
        flat, flng = float(plat), float(plng)
        distance = haversine_m(lat, lng, flat, flng)
        if distance > radius_m:
            continue
        name = _overpass_name(tags, hit_kind)
        phone = _normalize_phone(tags.get("phone") or tags.get("contact:phone"))
        osm_ref = f"{etype[:1].upper()}{eid}"
        items.append(
            _PlaceHit(
                id=f"{hit_kind.lower()}-osm-{osm_ref}",
                name=name,
                kind=hit_kind,
                distance_m=distance,
                lat=flat,
                lng=flng,
                maps_url=maps_url(name, flat, flng),
                osm_ref=osm_ref,
                phone=phone,
            )
        )
        # stash rank on object for park sorting via distance tweak below
        if hit_kind == "PARK":
            # Prefer dog parks without changing public distance_m much:
            # sort key uses (rank, distance) in _dedupe_kind.
            setattr(items[-1], "_park_rank", _park_rank(tags))
    return items


async def _fetch_overpass(
    *,
    lat: float,
    lng: float,
    kind: Kind | None,
    radius_m: int,
) -> list[_PlaceHit]:
    query = _overpass_query_text(lat=lat, lng=lng, kind=kind, radius_m=radius_m)
    last_error: Exception | None = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                response = await client.post(
                    endpoint,
                    content=query,
                    headers={"User-Agent": _USER_AGENT},
                )
                response.raise_for_status()
                payload = response.json()
            return _parse_overpass(
                payload, lat=lat, lng=lng, kind=kind, radius_m=radius_m
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("Overpass endpoint failed (%s): %s", endpoint, exc)
    if last_error is not None:
        raise last_error
    return []


# ---------------------------------------------------------------------------
# Photon (fallback: geocoder)
# ---------------------------------------------------------------------------


def _photon_kind(properties: dict[str, Any], requested: Kind) -> Kind | None:
    osm_value = str(properties.get("osm_value") or "").casefold()
    osm_key = str(properties.get("osm_key") or "").casefold()
    name = str(properties.get("name") or "").casefold()
    if requested == "VET":
        if osm_value in {"university", "bus_stop", "school", "college"}:
            return None
        if "veterinar" in osm_value or osm_value in {"veterinary", "animal_boarding"}:
            return "VET"
        if "veterinar" in name or "clinica veterinaria" in name or "ambulatorio" in name:
            return "VET"
        if osm_key in {"amenity", "healthcare", "office"} and "veterinar" in (
            osm_value + name
        ):
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
        ("clinica veterinaria", "veterinario", "ambulatorio veterinario")
        if kind == "VET"
        else ("area cani", "parco cani", "dog park", "sgambamento cani", "parco")
    )
    max_distance = max(radius_m, 15_000)
    bbox = _bbox(lat, lng, max_distance)
    async with httpx.AsyncClient(timeout=8.0) as client:
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
    """Attach phone numbers for vets via Nominatim extratags (ramo Photon)."""
    vets = [item for item in items if item.kind == "VET" and item.osm_ref and not item.phone]
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
        full = str(row.get("osm_type") or "").casefold()
        if full.startswith("node"):
            osm_type = "N"
        elif full.startswith("way"):
            osm_type = "W"
        elif full.startswith("relation"):
            osm_type = "R"
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


# ---------------------------------------------------------------------------
# Orchestrazione
# ---------------------------------------------------------------------------


def _dedupe(items: list[_PlaceHit], *, limit: int = RESULT_LIMIT) -> list[_PlaceHit]:
    def sort_key(item: _PlaceHit) -> tuple[int, int]:
        rank = int(getattr(item, "_park_rank", 0)) if item.kind == "PARK" else 0
        return (rank, item.distance_m)

    items = sorted(items, key=sort_key)
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
    """Quota ampia a entrambe: i park non soffocano i vet e viceversa."""
    parks_u = _dedupe(parks, limit=PER_KIND_LIMIT)
    vets_u = _dedupe(vets, limit=PER_KIND_LIMIT)
    merged = parks_u + vets_u
    return sorted(merged, key=lambda item: item.distance_m)


async def _search_photon(
    *,
    lat: float,
    lng: float,
    kind: Kind | None,
    radius_m: int,
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
    if kind is None:
        unique = _merge_balanced(
            [item for item in batches[0]],
            [item for item in batches[1]],
        )
    else:
        unique = _dedupe([item for batch in batches for item in batch])

    # Expand once if the first pass is empty (coarse GPS / sparse OSM).
    if not unique and not provider_errors:
        wide = max(radius_m * 2, 20_000)
        batches = await asyncio.gather(*(one(current, wide) for current in kinds))
        if kind is None:
            unique = _merge_balanced(batches[0], batches[1])
        else:
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


async def _overpass_for_kind(
    *,
    lat: float,
    lng: float,
    kind: Kind,
    radius_m: int,
) -> list[_PlaceHit]:
    items = await _fetch_overpass(lat=lat, lng=lng, kind=kind, radius_m=radius_m)
    if items:
        return items
    wide = max(radius_m * 2, 20_000)
    return await _fetch_overpass(lat=lat, lng=lng, kind=kind, radius_m=wide)


async def search_nearby(
    *,
    lat: float,
    lng: float,
    kind: Kind | None = None,
    radius_m: int = DEFAULT_RADIUS_M,
) -> NearbyPlacesResponse:
    overpass_ok = False
    try:
        if kind is None:
            parks, vets = await asyncio.gather(
                _overpass_for_kind(lat=lat, lng=lng, kind="PARK", radius_m=radius_m),
                _overpass_for_kind(lat=lat, lng=lng, kind="VET", radius_m=radius_m),
            )
            overpass_ok = True
            unique = _merge_balanced(parks, vets)
        else:
            items = await _overpass_for_kind(
                lat=lat, lng=lng, kind=kind, radius_m=radius_m
            )
            overpass_ok = True
            unique = _dedupe(items, limit=RESULT_LIMIT)

        if unique:
            return NearbyPlacesResponse(
                items=[item.to_out() for item in unique],
                location_label=None,
            )
        logger.info(
            "Overpass nearby empty (lat=%s lng=%s kind=%s) → Photon",
            lat,
            lng,
            kind,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Overpass nearby failed, fallback to Photon: %s", exc)
        overpass_ok = False

    # Vuoto o errore Overpass → Photon (prima il vuoto non faceva fallback).
    photon = await _search_photon(lat=lat, lng=lng, kind=kind, radius_m=radius_m)
    if photon.items or not overpass_ok:
        return photon
    return photon
