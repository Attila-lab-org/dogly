"""Nearby useful places: Overpass first, Photon fallback (no Google key)."""

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

OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
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


def _overpass_query(lat: float, lng: float, radius_m: int, kinds: list[Kind]) -> str:
    around = f"(around:{radius_m},{lat},{lng})"
    parts: list[str] = []
    if "PARK" in kinds:
        parts.extend(
            [
                f'node["leisure"="dog_park"]{around};',
                f'way["leisure"="dog_park"]{around};',
                f'node["leisure"="park"]{around};',
                f'way["leisure"="park"]{around};',
            ]
        )
    if "VET" in kinds:
        parts.extend(
            [
                f'node["amenity"="veterinary"]{around};',
                f'way["amenity"="veterinary"]{around};',
                f'node["healthcare"="veterinary"]{around};',
            ]
        )
    body = "\n  ".join(parts)
    return f"""
[out:json][timeout:8];
(
  {body}
);
out center 30;
"""


def _element_kind(el: dict[str, Any]) -> Kind | None:
    tags = el.get("tags") or {}
    leisure = tags.get("leisure")
    if leisure in {"dog_park", "park"}:
        return "PARK"
    if tags.get("amenity") == "veterinary" or tags.get("healthcare") == "veterinary":
        return "VET"
    return None


def _element_point(el: dict[str, Any]) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    center = el.get("center") or {}
    if "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def _items_from_overpass(
    elements: list[dict[str, Any]],
    *,
    lat: float,
    lng: float,
    kinds: list[Kind],
    radius_m: int,
) -> list[NearbyPlaceOut]:
    items: list[NearbyPlaceOut] = []
    for el in elements:
        current = _element_kind(el)
        if current is None or current not in kinds:
            continue
        point = _element_point(el)
        if point is None:
            continue
        tags = el.get("tags") or {}
        name = tags.get("name") or (
            "Parco per cani" if current == "PARK" else "Veterinario"
        )
        plat, plng = point
        distance = haversine_m(lat, lng, plat, plng)
        if distance > radius_m:
            continue
        items.append(
            NearbyPlaceOut(
                id=f"{current.lower()}-{el.get('id')}",
                name=name,
                kind=current,
                distance_m=distance,
                lat=plat,
                lng=plng,
                maps_url=maps_url(name, plat, plng),
            )
        )
    return items


async def _fetch_overpass_race(query: str) -> list[dict[str, Any]] | None:
    """Race mirrors in parallel; first valid JSON wins. None = all failed."""
    body = f"data={quote_plus(query)}".encode()
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": _USER_AGENT,
    }

    async def one(endpoint: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=7.0) as client:
            response = await client.post(endpoint, content=body, headers=headers)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("Overpass payload is not an object")
            return list(payload.get("elements") or [])

    tasks = [asyncio.create_task(one(endpoint)) for endpoint in OVERPASS_ENDPOINTS]
    try:
        while tasks:
            done, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED
            )
            tasks = list(pending)
            for finished in done:
                try:
                    elements = finished.result()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Overpass mirror failed: %s", exc)
                    continue
                for task in tasks:
                    task.cancel()
                return elements
    finally:
        for task in tasks:
            task.cancel()
    return None


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
    # Photon results are often a bit farther than Overpass around-filter.
    max_distance = max(radius_m, 9000)
    items: list[NearbyPlaceOut] = []
    async with httpx.AsyncClient(timeout=8.0) as client:
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
    provider_errors: list[str] = []
    collected: list[NearbyPlaceOut] = []

    elements = await _fetch_overpass_race(
        _overpass_query(lat, lng, radius_m, kinds)
    )
    if elements is None:
        provider_errors.append("overpass")
    else:
        collected.extend(
            _items_from_overpass(
                elements, lat=lat, lng=lng, kinds=kinds, radius_m=radius_m
            )
        )

    if not collected:
        # Overpass is often blocked/slow from cloud IPs; Photon is the reliable path.
        for current in kinds:
            try:
                collected.extend(
                    await _fetch_photon(
                        lat=lat, lng=lng, kind=current, radius_m=radius_m
                    )
                )
            except Exception as exc:  # noqa: BLE001
                provider_errors.append(f"photon:{current}")
                logger.warning("Photon fallback failed (%s): %s", current, exc)

    unique = _dedupe(collected)
    if not unique and provider_errors and elements is None:
        raise ApiError(
            ErrorCode.PROCESSING_FAILED,
            "Non riesco a caricare i luoghi adesso. Riprova tra poco.",
            retryable=True,
        )
    return NearbyPlacesResponse(items=unique, location_label=None)
