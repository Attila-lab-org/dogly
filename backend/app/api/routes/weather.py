"""GET /v1/weather/current — meteo locale best-effort per i consigli Home.

Privacy: le coordinate vengono arrotondate a 2 decimali (~1km) prima di
chiamare Open-Meteo e non vengono mai persistite. Cache in-memory breve
(10 min) per cella arrotondata: il meteo non cambia più in fretta di così
e Open-Meteo resta gratuita finché non la martelliamo.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel

from app.api.deps import UserIdDep
from app.domains.realtime_weather import fetch_local_weather

router = APIRouter()

CACHE_TTL_SECONDS = 600
_cache: dict[tuple[float, float], tuple[float, dict]] = {}


class WeatherCurrentOut(BaseModel):
    temperature_c: float
    humidity_pct: int | None = None
    weather_code: int | None = None
    wind_speed_kmh: float | None = None


@router.get("/weather/current", response_model=WeatherCurrentOut)
async def get_current_weather(
    _user_id: UserIdDep,
    response: Response,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
) -> WeatherCurrentOut | Response:
    rounded = (round(lat, 2), round(lng, 2))
    now = time.monotonic()
    cached = _cache.get(rounded)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        raw = cached[1]
    else:
        fresh = await fetch_local_weather(latitude=rounded[0], longitude=rounded[1])
        if fresh is None:
            # Onesto: nessun dato inventato, il client userà i fallback stagionali.
            return Response(status_code=204)
        raw = fresh
        _cache[rounded] = (now, raw)
    return WeatherCurrentOut(
        temperature_c=raw["temperature_c"],
        humidity_pct=raw.get("humidity_pct"),
        weather_code=raw.get("weather_code"),
        wind_speed_kmh=raw.get("wind_speed_kmh"),
    )


def _reset_weather_cache() -> None:
    """Solo test."""
    _cache.clear()
