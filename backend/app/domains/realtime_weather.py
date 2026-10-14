"""Best-effort local weather for Ask situational context (Open-Meteo, no key)."""

from __future__ import annotations

from typing import Any

import httpx


async def fetch_local_weather(
    *,
    latitude: float,
    longitude: float,
) -> dict[str, Any] | None:
    """Return a compact weather snapshot, or None if unavailable."""
    try:
        # Keep weather optional and cheap: never stall the chat turn.
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                    "timezone": "auto",
                },
            )
            response.raise_for_status()
            raw = response.json()
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        return None
    current = raw.get("current") if isinstance(raw, dict) else None
    if not isinstance(current, dict):
        return None
    temperature = current.get("temperature_2m")
    if temperature is None:
        return None
    return {
        "source": "open-meteo",
        "latitude": latitude,
        "longitude": longitude,
        "timezone": raw.get("timezone"),
        "temperature_c": temperature,
        "humidity_pct": current.get("relative_humidity_2m"),
        "weather_code": current.get("weather_code"),
        "wind_speed_kmh": current.get("wind_speed_10m"),
        "observed_at": current.get("time"),
    }
