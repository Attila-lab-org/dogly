"""Nearby useful places: Overpass (POI per categoria OSM) primary, Photon fallback.

Photon è un geocoder, non un motore POI: restava come unica sorgente e
restituiva risultati irrilevanti/lontani. Overpass interroga direttamente i
tag OSM (amenity=veterinary, leisure=dog_park|park|recreation_ground) entro
il raggio reale — niente chiavi, gratis, e i telefoni sono già nei tag.
Se Overpass fallisce si ripiega sul geocoder Photon (con arricchimento
telefoni Nominatim, che Overpass rende inutile nel ramo primario).
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

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"
PHOTON_ENDPOINT = "https://photon.komoot.io/api/"
NOMINATIM_LOOKUP = "https://nominatim.openstreetmap.org/lookup"
_USER_AGENT = "Dogly/1.0 (nearby places; contact=support@dogly.app)"

RESULT_LIMIT = 12


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
        parts.append(f'nwr(around:{radius_m},{lat},{lng})["office"="veterinary"];')
    if kind in (None, "PARK"):
        parts.append(
            f'nwr(around:{radius_m},{lat},{lng})'
            '["leisure"~"^(dog_park|park|recreation_ground)$"];'
        )
    body = "\n  ".join(parts)
    return f"[out:json][timeout:10];\n(\n  {body}\n);\nout center tags;"


def _overpass_hit_kind(tags: dict[str, Any]) -> Kind | None:
    if str(tags.get("amenity") or "").casefold() == "veterinary":
        return "VET"
    if str(tags.get("office") or "").casefold() == "veterinary":
        return "VET"
    leisure = str(tags.get("leisure") or "").casefold()
    if leisure in {"dog_park", "park", "recreation_ground"}:
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
    return items


async def _fetch_overpass(
    *,
    lat: float,
    lng: float,
    kind: Kind | None,
    radius_m: int,
) -> list[_PlaceHit]:
    query = _overpass_query_text(lat=lat, lng=lng, kind=kind, radius_m=radius_m)
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.post(
            OVERPASS_ENDPOINT,
            content=query,
            headers={"User-Agent": _USER_AGENT},
        )
        response.raise_for_status()
        payload = response.json()
    return _parse_overpass(payload, lat=lat, lng=lng, kind=kind, radius_m=radius_m)


# ---------------------------------------------------------------------------
# Photon (fallback: geocoder, meno preciso sui POI per categoria)
# ---------------------------------------------------------------------------


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
    """Attach phone numbers for vets via Nominatim extratags (ramo Photon)."""
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
    items = sorted(items, key=lambda item: item.distance_m)
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


async def search_nearby(
    *,
    lat: float,
    lng: float,
    kind: Kind | None = None,
    radius_m: int = 5000,
) -> NearbyPlacesResponse:
    try:
        items = _dedupe(
            await _fetch_overpass(lat=lat, lng=lng, kind=kind, radius_m=radius_m)
        )
        if not items:
            # Expand once (zone con OSM rado): stessa sorgente, raggio doppio.
            wide = max(radius_m * 2, 20_000)
            items = _dedupe(
                await _fetch_overpass(lat=lat, lng=lng, kind=kind, radius_m=wide)
            )
        return NearbyPlacesResponse(
            items=[item.to_out() for item in items],
            location_label=None,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Overpass nearby failed, fallback to Photon: %s", exc)
    return await _search_photon(lat=lat, lng=lng, kind=kind, radius_m=radius_m)
