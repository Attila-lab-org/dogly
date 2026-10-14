"""Nearby useful places via Photon (fast). Overpass is too slow/unreliable from cloud."""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any, Literal
from urllib.parse import quote_plus

import httpx

from app.contracts.api import NearbyPlaceOut, NearbyPlacesResponse
from app.contracts.errors import ApiError, ErrorCode

Kind = Literal["PARK", "VET"]
logger = logging.getLogger(__name__)

PHOTON_ENDPOINT = "https://photon.komoot.io/api/"
_USER_AGENT = "Dogly/1.0 (nearby places; contact=support@dogly.app)"


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


def _photon_kind(properties: dict[str, Any], requested: Kind) -> Kind | None:
    osm_value = str(properties.get("osm_value") or "").casefold()
    osm_key = str(properties.get("osm_key") or "").casefold()
    name = str(properties.get("name") or "").casefold()
    if requested == "VET":
        if "veterinar" in osm_value or osm_value == "veterinary":
            return "VET"
        if "veterinar" in name or "clinica veterinaria" in name:
            return "VET"
        return "VET" if osm_key in {"amenity", "healthcare"} else None
    if requested == "PARK":
        if osm_value in {"dog_park", "park", "recreation_ground"}:
            return "PARK"
        if any(
            token in name
            for token in ("parco", "dog park", "sgambamento", "area cani", "dog area")
        ):
            return "PARK"
        return "PARK" if osm_key == "leisure" else None
    return None


async def _fetch_photon(
    *,
    lat: float,
    lng: float,
    kind: Kind,
    radius_m: int,
) -> list[NearbyPlaceOut]:
    queries = (
        ("veterinario", "veterinary")
        if kind == "VET"
        else ("parco cani", "area cani", "dog park")
    )
    max_distance = max(radius_m, 9000)
    items: list[NearbyPlaceOut] = []
    async with httpx.AsyncClient(timeout=5.0) as client:
        for query in queries:
            response = await client.get(
                PHOTON_ENDPOINT,
                params={"q": query, "lat": lat, "lon": lng, "limit": 12},
                headers={"User-Agent": _USER_AGENT},
            )
            response.raise_for_status()
            payload = response.json()
            features = list((payload or {}).get("features") or [])
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
                osm_id = properties.get("osm_id") or f"{query}-{index}"
                items.append(
                    NearbyPlaceOut(
                        id=f"{kind.lower()}-photon-{osm_id}",
                        name=name,
                        kind=kind,
                        distance_m=distance,
                        lat=plat,
                        lng=plng,
                        maps_url=maps_url(name, plat, plng),
                    )
                )
            if items:
                break
    return items


def _dedupe(items: list[NearbyPlaceOut], *, limit: int = 12) -> list[NearbyPlaceOut]:
    items = sorted(
        items, key=lambda item: (item.distance_m is None, item.distance_m or 10**9)
    )
    seen: set[tuple[str, int, int]] = set()
    unique: list[NearbyPlaceOut] = []
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
    radius_m: int = 4500,
) -> NearbyPlacesResponse:
    kinds: list[Kind] = [kind] if kind else ["PARK", "VET"]
    provider_errors = 0

    async def one(current: Kind) -> list[NearbyPlaceOut]:
        nonlocal provider_errors
        try:
            return await _fetch_photon(
                lat=lat, lng=lng, kind=current, radius_m=radius_m
            )
        except Exception as exc:  # noqa: BLE001
            provider_errors += 1
            logger.warning("Photon nearby failed (%s): %s", current, exc)
            return []

    batches = await asyncio.gather(*(one(current) for current in kinds))
    unique = _dedupe([item for batch in batches for item in batch])
    if not unique and provider_errors:
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "Non riesco a caricare i luoghi adesso. Riprova tra poco.",
            retryable=True,
        )
    return NearbyPlacesResponse(items=unique, location_label=None)
