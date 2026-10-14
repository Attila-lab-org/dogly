"""Nearby places via Photon."""

from __future__ import annotations

import pytest

from app.contracts.api import NearbyPlaceOut
from app.contracts.errors import ApiError
from app.domains import places as places_domain


@pytest.mark.asyncio
async def test_search_nearby_uses_photon_in_parallel(monkeypatch):
    calls: list[str] = []

    async def photon(*, lat: float, lng: float, kind: str, radius_m: int):
        del lat, lng, radius_m
        calls.append(kind)
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

    monkeypatch.setattr(places_domain, "_fetch_photon", photon)
    result = await places_domain.search_nearby(lat=45.46, lng=9.19)
    assert set(calls) == {"PARK", "VET"}
    assert len(result.items) == 2


@pytest.mark.asyncio
async def test_search_nearby_errors_when_photon_fails(monkeypatch):
    async def photon_fail(**_kwargs):
        raise RuntimeError("photon down")

    monkeypatch.setattr(places_domain, "_fetch_photon", photon_fail)
    with pytest.raises(ApiError):
        await places_domain.search_nearby(lat=45.46, lng=9.19)
