"""GET /v1/weather/current: coordinate arrotondate, cache breve, 204 onesto."""

import httpx

from app.api.routes import weather as weather_route


def _fake_weather(temperature: float = 31.5):
    return {
        "source": "open-meteo",
        "latitude": 0,
        "longitude": 0,
        "timezone": "Europe/Rome",
        "temperature_c": temperature,
        "humidity_pct": 40,
        "weather_code": 1,
        "wind_speed_kmh": 8.0,
        "observed_at": "2026-08-01T12:00",
    }


async def test_weather_current_rounds_coordinates(
    client: httpx.AsyncClient, auth_headers, monkeypatch
):
    weather_route._reset_weather_cache()
    calls = []

    async def fake_fetch(*, latitude: float, longitude: float):
        calls.append((latitude, longitude))
        return _fake_weather()

    monkeypatch.setattr(weather_route, "fetch_local_weather", fake_fetch)

    resp = await client.get(
        "/v1/weather/current",
        params={"lat": 45.46427, "lng": 9.18951},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["temperature_c"] == 31.5
    assert body["weather_code"] == 1
    # Privacy: arrotondato a 2 decimali (~1km) prima della chiamata.
    assert calls == [(45.46, 9.19)]


async def test_weather_current_caches_per_rounded_cell(
    client: httpx.AsyncClient, auth_headers, monkeypatch
):
    weather_route._reset_weather_cache()
    calls = []

    async def fake_fetch(*, latitude: float, longitude: float):
        calls.append((latitude, longitude))
        return _fake_weather()

    monkeypatch.setattr(weather_route, "fetch_local_weather", fake_fetch)

    for lat, lng in ((45.4642, 9.1895), (45.4640, 9.1896)):
        resp = await client.get(
            "/v1/weather/current",
            params={"lat": lat, "lng": lng},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
    # Stessa cella arrotondata → una sola chiamata upstream.
    assert len(calls) == 1


async def test_weather_current_unavailable_is_honest_204(
    client: httpx.AsyncClient, auth_headers, monkeypatch
):
    weather_route._reset_weather_cache()

    async def fake_fetch(*, latitude: float, longitude: float):
        return None

    monkeypatch.setattr(weather_route, "fetch_local_weather", fake_fetch)

    resp = await client.get(
        "/v1/weather/current",
        params={"lat": 41.9, "lng": 12.5},
        headers=auth_headers,
    )
    assert resp.status_code == 204
    assert resp.content == b""
