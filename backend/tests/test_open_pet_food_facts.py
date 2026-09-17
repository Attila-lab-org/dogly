"""Open Pet Food Facts adapter: UA, 429, transient retry, barcode cache."""

from __future__ import annotations

import httpx
import pytest

from app.providers.base import ProviderRateLimitError
from app.providers.open_pet_food_facts import (
    OpenPetFoodFactsClient,
    clear_barcode_cache,
)


def _product_payload() -> dict:
    return {
        "status": 1,
        "product": {
            "code": "8000000000000",
            "product_name": "Crocchette prova",
            "brands": "Acme",
            "ingredients_text": "pollo, riso",
            "nutriments": {"energy-kcal_100g": 350},
        },
    }


@pytest.fixture(autouse=True)
def _clean_cache():
    clear_barcode_cache()
    yield
    clear_barcode_cache()


@pytest.mark.asyncio
async def test_sends_identifiable_user_agent():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["user-agent"])
        return httpx.Response(200, json=_product_payload())

    client = OpenPetFoodFactsClient(
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        user_agent="DOGly/1.0 (+https://dogly.app)",
        cache={},
    )
    candidate = await client.lookup_barcode("8000000000000")
    assert candidate is not None
    assert seen == ["DOGly/1.0 (+https://dogly.app)"]


@pytest.mark.asyncio
async def test_rate_limit_is_not_retried():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(429, json={"status": 0})

    client = OpenPetFoodFactsClient(
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        cache={},
        max_retries=2,
    )
    with pytest.raises(ProviderRateLimitError):
        await client.lookup_barcode("8000000000000")
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_retries_transient_errors_then_succeeds():
    calls = {"n": 0}
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, json={"status": 0})
        return httpx.Response(200, json=_product_payload())

    async def sleeper(delay: float) -> None:
        sleeps.append(delay)

    client = OpenPetFoodFactsClient(
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        cache={},
        max_retries=2,
        sleeper=sleeper,
    )
    candidate = await client.lookup_barcode("8000000000000")
    assert candidate is not None
    assert candidate.name == "Crocchette prova"
    assert calls["n"] == 2
    assert sleeps == [0.2]


@pytest.mark.asyncio
async def test_barcode_cache_avoids_repeat_requests():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=_product_payload())

    cache: dict = {}
    client = OpenPetFoodFactsClient(
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        cache=cache,
    )
    first = await client.lookup_barcode("8000000000000")
    second = await client.lookup_barcode("8000000000000")
    assert first is not None and second is not None
    assert first.name == second.name
    assert calls["n"] == 1
