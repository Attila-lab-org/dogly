"""Nearby useful places via OpenStreetMap Overpass (no Google Places key)."""

from __future__ import annotations

import logging
import math
from typing import Any, Literal
from urllib.parse import quote_plus

import httpx

from app.contracts.api import NearbyPlaceOut, NearbyPlacesResponse

Kind = Literal["PARK", "VET"]
logger = logging.getLogger(__name__)

OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
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
[out:json][timeout:18];
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


async def _fetch_overpass(query: str) -> list[dict[str, Any]]:
    body = f"data={quote_plus(query)}".encode()
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Dogly/1.0 (nearby places)",
    }
    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=20.0) as client:
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                response = await client.post(endpoint, content=body, headers=headers)
                if response.status_code >= 400:
                    last_error = RuntimeError(f"Overpass HTTP {response.status_code}")
                    continue
                payload = response.json()
                return list(payload.get("elements") or [])
            except Exception as exc:  # noqa: BLE001 — try next mirror
                last_error = exc
                logger.warning("Overpass mirror failed: %s (%s)", endpoint, exc)
    if last_error:
        logger.warning("All Overpass mirrors failed: %s", last_error)
    return []


async def search_nearby(
    *,
    lat: float,
    lng: float,
    kind: Kind | None = None,
    radius_m: int = 4500,
) -> NearbyPlacesResponse:
    kinds: list[Kind] = [kind] if kind else ["PARK", "VET"]
    elements = await _fetch_overpass(_overpass_query(lat, lng, radius_m, kinds))
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
    items.sort(key=lambda item: (item.distance_m is None, item.distance_m or 10**9))
    seen: set[tuple[str, int, int]] = set()
    unique: list[NearbyPlaceOut] = []
    for item in items:
        key = (item.kind, int(item.lat * 1e4), int(item.lng * 1e4))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
        if len(unique) >= 12:
            break
    return NearbyPlacesResponse(items=unique, location_label=None)
