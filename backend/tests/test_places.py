"""Nearby places: Overpass race + Photon fallback."""

from __future__ import annotations

import pytest

from app.contracts.errors import ApiError
from app.domains import places as places_domain


@pytest.mark.asyncio
async def test_search_nearby_falls_back_to_photon_when_overpass_fails(monkeypatch):
    async def boom(_query: str):
        return None

    async def photon(*, lat: float, lng: float, kind: str, radius_m: int):
        del lat, lng, radius_m
        from app.contracts.api import NearbyPlaceOut

        return [
            NearbyPlaceOut(
                id=f"{kind.lower()}-1",
                name="Clinica Test" if kind == "VET" else "Parco Test",
                kind=kind,  # type: ignore[arg-type]
                distance_m=400,
                lat=45.46,
                lng=9.19,
                maps_url="https://maps.example/test",
            )
        ]

    monkeypatch.setattr(places_domain, "_fetch_overpass_race", boom)
    monkeypatch.setattr(places_domain, "_fetch_photon", photon)

    result = await places_domain.search_nearby(lat=45.46, lng=9.19)
    assert len(result.items) == 2
    assert {item.kind for item in result.items} == {"PARK", "VET"}


@pytest.mark.asyncio
async def test_search_nearby_errors_when_all_providers_fail(monkeypatch):
    async def boom(_query: str):
        return None

    async def photon_fail(**_kwargs):
        raise RuntimeError("photon down")

    monkeypatch.setattr(places_domain, "_fetch_overpass_race", boom)
    monkeypatch.setattr(places_domain, "_fetch_photon", photon_fail)

    with pytest.raises(ApiError):
        await places_domain.search_nearby(lat=45.46, lng=9.19)
