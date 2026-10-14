"""Nearby useful places via OpenStreetMap Overpass (no Google Places key)."""

from __future__ import annotations

import json
import math
from typing import Any, Literal
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from app.contracts.api import NearbyPlaceOut, NearbyPlacesResponse

Kind = Literal["PARK", "VET"]


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


def _overpass_query(lat: float, lng: float, radius_m: int, kind: Kind) -> str:
    around = f"(around:{radius_m},{lat},{lng})"
    if kind == "PARK":
        return f"""
[out:json][timeout:12];
(
  node["leisure"="dog_park"]{around};
  way["leisure"="dog_park"]{around};
  node["leisure"="park"]{around};
  way["leisure"="park"]{around};
);
out center 20;
"""
    return f"""
[out:json][timeout:12];
(
  node["amenity"="veterinary"]{around};
  way["amenity"="veterinary"]{around};
  node["healthcare"="veterinary"]{around};
);
out center 20;
"""


def _fetch_overpass(query: str) -> list[dict[str, Any]]:
    req = Request(
        "https://overpass-api.de/api/interpreter",
        data=f"data={quote_plus(query)}".encode(),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Dogly/1.0",
        },
        method="POST",
    )
    with urlopen(req, timeout=14) as resp:  # noqa: S310 — fixed Overpass endpoint
        payload = json.loads(resp.read().decode("utf-8"))
    return list(payload.get("elements") or [])


def _element_point(el: dict[str, Any]) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    center = el.get("center") or {}
    if "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def search_nearby(
    *,
    lat: float,
    lng: float,
    kind: Kind | None = None,
    radius_m: int = 3500,
) -> NearbyPlacesResponse:
    kinds: list[Kind] = [kind] if kind else ["PARK", "VET"]
    items: list[NearbyPlaceOut] = []
    for current in kinds:
        try:
            elements = _fetch_overpass(_overpass_query(lat, lng, radius_m, current))
        except Exception:
            elements = []
        for el in elements:
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
