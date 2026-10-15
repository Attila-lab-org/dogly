"""Nearby places: Google Places Text Search."""

from __future__ import annotations

import httpx
import pytest

from app.contracts.errors import ApiError
from app.domains import places as places_domain
from app.domains.places import _PlaceHit

GOOGLE_VET_PAYLOAD = {
    "places": [
        {
            "id": "places/vet1",
            "displayName": {"text": "Clinica San Barnaba"},
            "primaryType": "veterinary_care",
            "types": ["veterinary_care", "point_of_interest"],
            "location": {"latitude": 45.4701, "longitude": 9.1995},
            "nationalPhoneNumber": "+39 02 555 0100",
        },
        {
            "id": "places/pharmacy1",
            "displayName": {"text": "Lafarmacia Del Duomo"},
            "primaryType": "pharmacy",
            "types": ["pharmacy", "health"],
            "location": {"latitude": 45.464, "longitude": 9.19},
        },
        {
            "id": "places/far",
            "displayName": {"text": "Vet Lontano"},
            "primaryType": "veterinary_care",
            "types": ["veterinary_care"],
            "location": {"latitude": 45.7, "longitude": 9.4},
        },
    ]
}

GOOGLE_PARK_PAYLOAD = {
    "places": [
        {
            "id": "places/dog1",
            "displayName": {"text": "Area Cani Montanari"},
            "primaryType": "dog_park",
            "types": ["dog_park", "park"],
            "location": {"latitude": 45.462, "longitude": 9.191},
        },
        {
            "id": "places/park1",
            "displayName": {"text": "Parco Sempione"},
            "primaryType": "park",
            "types": ["park"],
            "location": {"latitude": 45.463, "longitude": 9.192},
        },
        {
            "id": "places/parking1",
            "displayName": {"text": "Parking Diego"},
            "primaryType": "parking",
            "types": ["parking", "parking_lot"],
            "location": {"latitude": 45.461, "longitude": 9.19},
        },
    ]
}


def test_parse_filters_pharmacies_parking_and_distance():
    vets = places_domain._parse_places(
        GOOGLE_VET_PAYLOAD, lat=45.46, lng=9.19, kind="VET", radius_m=5000
    )
    parks = places_domain._parse_places(
        GOOGLE_PARK_PAYLOAD, lat=45.46, lng=9.19, kind="PARK", radius_m=5000
    )
    assert [item.name for item in vets] == ["Clinica San Barnaba"]
    assert vets[0].phone == "+39025550100"
    names = [item.name for item in places_domain._dedupe(parks)]
    assert names[0] == "Area Cani Montanari"
    assert "Parco Sempione" in names
    assert "Parking Diego" not in names


@pytest.mark.asyncio
async def test_search_nearby_uses_google_for_both_kinds(monkeypatch):
    calls: list[str] = []

    async def fake_fetch(*, lat, lng, kind, radius_m, api_key, purpose="default"):
        del lat, lng, radius_m, api_key, purpose
        calls.append(kind)
        payload = GOOGLE_PARK_PAYLOAD if kind == "PARK" else GOOGLE_VET_PAYLOAD
        return places_domain._parse_places(
            payload, lat=45.46, lng=9.19, kind=kind, radius_m=5000
        )

    monkeypatch.setattr(places_domain, "_api_key", lambda: "test-key")
    monkeypatch.setattr(places_domain, "_fetch_kind", fake_fetch)
    result = await places_domain.search_nearby(lat=45.46, lng=9.19)
    assert sorted(calls) == ["PARK", "VET"]
    assert {item.kind for item in result.items} == {"PARK", "VET"}
    assert result.items[0].distance_m <= result.items[-1].distance_m


@pytest.mark.asyncio
async def test_emergency_purpose_searches_vets_only(monkeypatch):
    purposes: list[str] = []

    async def fake_fetch(*, lat, lng, kind, radius_m, api_key, purpose="default"):
        del lat, lng, radius_m, api_key
        purposes.append(purpose)
        assert kind == "VET"
        return places_domain._parse_places(
            GOOGLE_VET_PAYLOAD, lat=45.46, lng=9.19, kind="VET", radius_m=5000
        )

    monkeypatch.setattr(places_domain, "_api_key", lambda: "test-key")
    monkeypatch.setattr(places_domain, "_fetch_kind", fake_fetch)
    result = await places_domain.search_nearby(
        lat=45.46, lng=9.19, purpose="emergency"
    )
    assert purposes == ["emergency"]
    assert all(item.kind == "VET" for item in result.items)


@pytest.mark.asyncio
async def test_search_nearby_widens_when_empty(monkeypatch):
    radii: list[int] = []

    async def fake_fetch(*, lat, lng, kind, radius_m, api_key, purpose="default"):
        del lat, lng, kind, api_key, purpose
        radii.append(radius_m)
        if radius_m < 10_000:
            return []
        return [
            _PlaceHit(
                id="vet-1",
                name="Clinica Test",
                kind="VET",
                distance_m=400,
                lat=45.46,
                lng=9.19,
                maps_url="https://maps.example/test",
            )
        ]

    monkeypatch.setattr(places_domain, "_api_key", lambda: "test-key")
    monkeypatch.setattr(places_domain, "_fetch_kind", fake_fetch)
    result = await places_domain.search_nearby(
        lat=45.46, lng=9.19, kind="VET", radius_m=4000
    )
    assert 4000 in radii and 20_000 in radii
    assert len(result.items) == 1


@pytest.mark.asyncio
async def test_search_nearby_errors_without_api_key(monkeypatch):
    monkeypatch.setattr(places_domain, "_api_key", lambda: "")
    with pytest.raises(ApiError):
        await places_domain.search_nearby(lat=45.46, lng=9.19)


@pytest.mark.asyncio
async def test_search_nearby_errors_when_google_fails(monkeypatch):
    async def boom(**_kwargs):
        raise httpx.ConnectError("google down")

    monkeypatch.setattr(places_domain, "_api_key", lambda: "test-key")
    monkeypatch.setattr(places_domain, "_fetch_kind", boom)
    with pytest.raises(ApiError):
        await places_domain.search_nearby(lat=45.46, lng=9.19)


@pytest.mark.asyncio
async def test_park_only_keeps_many_parks(monkeypatch):
    async def fake_fetch(*, lat, lng, kind, radius_m, api_key, purpose="default"):
        del lat, lng, radius_m, api_key, purpose
        assert kind == "PARK"
        return [
            _PlaceHit(
                id=f"park-{i}",
                name=f"Parco {i}",
                kind="PARK",
                distance_m=100 + i * 50,
                lat=45.46 + i * 0.001,
                lng=9.19,
                maps_url="https://maps.example/p",
            )
            for i in range(25)
        ]

    monkeypatch.setattr(places_domain, "_api_key", lambda: "test-key")
    monkeypatch.setattr(places_domain, "_fetch_kind", fake_fetch)
    result = await places_domain.search_nearby(lat=45.46, lng=9.19, kind="PARK")
    assert len(result.items) == places_domain.RESULT_LIMIT
    assert all(item.kind == "PARK" for item in result.items)


def test_dedupe_by_name_and_rounded_coords():
    base = {"kind": "PARK", "lat": 45.46001, "lng": 9.19001, "maps_url": "https://x"}
    items = [
        _PlaceHit(id="a", name="Parco Sempione", distance_m=300, **base),
        _PlaceHit(
            id="b",
            name="parco sempione",
            distance_m=310,
            lat=45.46002,
            lng=9.19002,
            kind="PARK",
            maps_url="https://x",
        ),
        _PlaceHit(
            id="c",
            name="Parco Sempione",
            distance_m=900,
            lat=45.4702,
            lng=9.2002,
            kind="PARK",
            maps_url="https://x",
        ),
    ]
    unique = places_domain._dedupe(items)
    assert [item.id for item in unique] == ["a", "c"]


def test_normalize_phone_keeps_callable_numbers():
    assert places_domain._normalize_phone("+39 02 5810 6826") == "+390258106826"
    assert places_domain._normalize_phone("02/58106826") == "0258106826"
    assert places_domain._normalize_phone("n/a") is None
