"""Nearby places via Photon."""

from __future__ import annotations

import pytest

from app.contracts.errors import ApiError
from app.domains import places as places_domain
from app.domains.places import _PlaceHit


@pytest.mark.asyncio
async def test_search_nearby_uses_photon_in_parallel(monkeypatch):
    calls: list[str] = []

    async def photon(*, lat: float, lng: float, kind: str, radius_m: int):
        del lat, lng, radius_m
        calls.append(kind)
        return [
            _PlaceHit(
                id=f"{kind.lower()}-1",
                name="Clinica Test" if kind == "VET" else "Parco Test",
                kind=kind,  # type: ignore[arg-type]
                distance_m=400,
                lat=45.46,
                lng=9.19,
                maps_url="https://maps.example/test",
                osm_ref="N1",
                phone="+390212345678" if kind == "VET" else None,
            )
        ]

    async def no_phones(items):
        return items

    monkeypatch.setattr(places_domain, "_fetch_photon", photon)
    monkeypatch.setattr(places_domain, "_enrich_vet_phones", no_phones)
    result = await places_domain.search_nearby(lat=45.46, lng=9.19)
    assert set(calls) == {"PARK", "VET"}
    assert len(result.items) == 2
    vet = next(item for item in result.items if item.kind == "VET")
    assert vet.phone == "+390212345678"


@pytest.mark.asyncio
async def test_search_nearby_errors_when_photon_fails(monkeypatch):
    async def photon_fail(**_kwargs):
        raise RuntimeError("photon down")

    monkeypatch.setattr(places_domain, "_fetch_photon", photon_fail)
    with pytest.raises(ApiError):
        await places_domain.search_nearby(lat=45.46, lng=9.19)


def test_normalize_phone_keeps_callable_numbers():
    assert places_domain._normalize_phone("+39 02 5810 6826") == "+390258106826"
    assert places_domain._normalize_phone("02/58106826") == "0258106826"
    assert places_domain._normalize_phone("n/a") is None
