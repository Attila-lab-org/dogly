"""Nearby places: Overpass primary, Photon fallback."""

from __future__ import annotations

import httpx
import pytest

from app.contracts.errors import ApiError
from app.domains import places as places_domain
from app.domains.places import _PlaceHit

OVERPASS_PAYLOAD = {
    "elements": [
        {
            "type": "node",
            "id": 101,
            "lat": 45.4701,
            "lon": 9.1995,
            "tags": {"amenity": "veterinary", "name": "Clinica San Barnaba"},
        },
        {
            "type": "way",
            "id": 202,
            "center": {"lat": 45.462, "lon": 9.191},
            "tags": {
                "leisure": "dog_park",
                "name": "Area Cani Montanari",
                "contact:phone": "+39 02 555 0100",
            },
        },
        {
            "type": "way",
            "id": 303,
            "center": {"lat": 45.463, "lon": 9.192},
            "tags": {"leisure": "park"},
        },
        {
            "type": "node",
            "id": 404,
            "lat": 45.7,
            "lon": 9.4,
            "tags": {"amenity": "veterinary", "name": "Vet Lontano"},
        },
        {
            "type": "node",
            "id": 505,
            "lat": 45.461,
            "lon": 9.19,
            "tags": {"shop": "bakery", "name": "Panificio"},
        },
    ]
}


def test_overpass_query_builds_per_kind():
    both = places_domain._overpass_query_text(
        lat=45.46, lng=9.19, kind=None, radius_m=5000
    )
    assert '["amenity"="veterinary"]' in both
    assert '["healthcare"="veterinary"]' in both
    assert '["office"="veterinary"]' in both
    assert '["leisure"="dog_park"]' in both
    assert '["leisure"~"^(park|recreation_ground)$"]' in both
    assert "(around:5000,45.46,9.19)" in both

    vet = places_domain._overpass_query_text(
        lat=45.46, lng=9.19, kind="VET", radius_m=3000
    )
    assert "veterinary" in vet and "leisure" not in vet

    park = places_domain._overpass_query_text(
        lat=45.46, lng=9.19, kind="PARK", radius_m=3000
    )
    assert "leisure" in park and "veterinary" not in park


def test_overpass_parses_nodes_ways_tags_and_sorts_by_distance():
    items = places_domain._dedupe(
        places_domain._parse_overpass(
            OVERPASS_PAYLOAD, lat=45.46, lng=9.19, kind=None, radius_m=5000
        )
    )
    names = [item.name for item in items]
    assert "Area Cani Montanari" in names
    assert "Clinica San Barnaba" in names
    assert "Parco" in names
    assert "Vet Lontano" not in names
    assert "Panificio" not in names
    # dog_park ha rank migliore: compare tra park items
    park_items = [item for item in items if item.kind == "PARK"]
    assert park_items[0].name == "Area Cani Montanari"
    dog_park = next(item for item in items if item.name == "Area Cani Montanari")
    assert dog_park.phone == "+39025550100"
    assert dog_park.kind == "PARK"
    vet = next(item for item in items if item.name == "Clinica San Barnaba")
    assert vet.kind == "VET"
    assert vet.phone is None


@pytest.mark.asyncio
async def test_search_nearby_uses_overpass_first(monkeypatch):
    calls: list[tuple[str | None, int]] = []

    async def fake_overpass(*, lat, lng, kind, radius_m):
        del lat, lng
        calls.append((kind, radius_m))
        return places_domain._parse_overpass(
            OVERPASS_PAYLOAD, lat=45.46, lng=9.19, kind=kind, radius_m=radius_m
        )

    async def photon_should_not_run(**_kwargs):
        raise AssertionError("Photon non deve partire se Overpass risponde")

    monkeypatch.setattr(places_domain, "_fetch_overpass", fake_overpass)
    monkeypatch.setattr(places_domain, "_fetch_photon", photon_should_not_run)
    result = await places_domain.search_nearby(lat=45.46, lng=9.19)
    # kind=None → fetch PARK e VET in parallelo
    assert sorted(kind for kind, _ in calls) == ["PARK", "VET"]
    assert {item.kind for item in result.items} == {"PARK", "VET"}
    assert result.items[0].distance_m <= result.items[-1].distance_m


@pytest.mark.asyncio
async def test_search_nearby_falls_back_to_photon_when_overpass_empty(monkeypatch):
    calls: list[int] = []

    async def fake_overpass(*, lat, lng, kind, radius_m):
        del lat, lng, kind
        calls.append(radius_m)
        return []

    async def photon(*, lat: float, lng: float, kind: str, radius_m: int):
        del lat, lng, radius_m
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
            )
        ]

    async def no_phones(items):
        return items

    monkeypatch.setattr(places_domain, "_fetch_overpass", fake_overpass)
    monkeypatch.setattr(places_domain, "_fetch_photon", photon)
    monkeypatch.setattr(places_domain, "_enrich_vet_phones", no_phones)
    result = await places_domain.search_nearby(lat=45.46, lng=9.19, radius_m=4000)
    # widen Overpass per kind (PARK+VET) poi Photon
    assert 4000 in calls and 20_000 in calls
    assert {item.kind for item in result.items} == {"PARK", "VET"}


@pytest.mark.asyncio
async def test_search_nearby_falls_back_to_photon_on_overpass_error(monkeypatch):
    async def overpass_down(**_kwargs):
        raise httpx.ConnectError("overpass down")

    async def photon(*, lat: float, lng: float, kind: str, radius_m: int):
        del lat, lng, radius_m
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
            )
        ]

    async def no_phones(items):
        return items

    monkeypatch.setattr(places_domain, "_fetch_overpass", overpass_down)
    monkeypatch.setattr(places_domain, "_fetch_photon", photon)
    monkeypatch.setattr(places_domain, "_enrich_vet_phones", no_phones)
    result = await places_domain.search_nearby(lat=45.46, lng=9.19)
    assert {item.kind for item in result.items} == {"PARK", "VET"}


@pytest.mark.asyncio
async def test_search_nearby_errors_when_everything_fails(monkeypatch):
    async def overpass_down(**_kwargs):
        raise httpx.ConnectError("overpass down")

    async def photon_fail(**_kwargs):
        raise RuntimeError("photon down")

    monkeypatch.setattr(places_domain, "_fetch_overpass", overpass_down)
    monkeypatch.setattr(places_domain, "_fetch_photon", photon_fail)
    with pytest.raises(ApiError):
        await places_domain.search_nearby(lat=45.46, lng=9.19)


@pytest.mark.asyncio
async def test_park_only_keeps_many_parks(monkeypatch):
    async def fake_overpass(*, lat, lng, kind, radius_m):
        del lat, lng, radius_m
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

    async def photon_should_not_run(**_kwargs):
        raise AssertionError("Photon non deve partire")

    monkeypatch.setattr(places_domain, "_fetch_overpass", fake_overpass)
    monkeypatch.setattr(places_domain, "_fetch_photon", photon_should_not_run)
    result = await places_domain.search_nearby(lat=45.46, lng=9.19, kind="PARK")
    assert len(result.items) == places_domain.RESULT_LIMIT
    assert all(item.kind == "PARK" for item in result.items)


def test_dedupe_by_name_and_rounded_coords():
    base = dict(kind="PARK", lat=45.46001, lng=9.19001, maps_url="https://x")
    items = [
        _PlaceHit(id="a", name="Parco Sempione", distance_m=300, **base),
        _PlaceHit(
            id="b", name="parco sempione", distance_m=310, lat=45.46002, lng=9.19002,
            kind="PARK", maps_url="https://x",
        ),
        _PlaceHit(
            id="c", name="Parco Sempione", distance_m=900, lat=45.4702, lng=9.2002,
            kind="PARK", maps_url="https://x",
        ),
    ]
    unique = places_domain._dedupe(items)
    assert [item.id for item in unique] == ["a", "c"]


def test_normalize_phone_keeps_callable_numbers():
    assert places_domain._normalize_phone("+39 02 5810 6826") == "+390258106826"
    assert places_domain._normalize_phone("02/58106826") == "0258106826"
    assert places_domain._normalize_phone("n/a") is None
