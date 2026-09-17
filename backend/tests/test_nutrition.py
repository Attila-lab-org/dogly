"""Nutrition label extraction, owner verification, and feeding-period wiring."""

import httpx

from app.api.routes import nutrition as nutrition_routes
from app.contracts.api import FoodLabelExtraction, GuaranteedAnalysis
from app.providers.base import ProviderUsage
from tests.conftest import create_dog


async def test_food_scan_verify_and_list(client: httpx.AsyncClient, auth_headers):
    dog_id = await create_dog(client, auth_headers)
    init = await client.post(
        "/v1/nutrition/foods/scan/init",
        json={
            "dog_id": dog_id,
            "client_request_id": "food-scan-0001",
            "bytes": 120_000,
            "content_type": "image/jpeg",
        },
        headers={**auth_headers, "X-Idempotency-Key": "food-scan-0001"},
    )
    assert init.status_code == 200, init.text
    food_id = init.json()["food_product_id"]

    listed = await client.get(
        f"/v1/nutrition/foods?dog_id={dog_id}", headers=auth_headers
    )
    assert listed.status_code == 200
    assert any(item["id"] == food_id for item in listed.json())
    assert listed.json()[0]["verified_at"] is None

    verify = await client.patch(
        f"/v1/nutrition/foods/{food_id}/verify",
        json={
            "brand": "Acme",
            "name": "Adult Chicken",
            "ingredients_raw": "chicken, rice",
            "guaranteed_analysis": {"crude_protein_min": 26.0, "calories": "350 kcal/100g"},
        },
        headers={**auth_headers, "X-Idempotency-Key": f"verify-{food_id}"},
    )
    assert verify.status_code == 200, verify.text
    assert verify.json()["verified_at"] is not None

    period = await client.post(
        "/v1/nutrition/feeding-periods",
        json={
            "dog_id": dog_id,
            "food_product_id": food_id,
            "start_at": "2026-09-08T10:00:00Z",
            "quantity_per_day": "200g",
        },
        headers={**auth_headers, "X-Idempotency-Key": "feed-0001"},
    )
    assert period.status_code == 201, period.text
    periods = await client.get(
        f"/v1/nutrition/feeding-periods?dog_id={dog_id}", headers=auth_headers
    )
    assert periods.status_code == 200
    assert periods.json()[0]["quantity_per_day"] == "200g"


async def test_uploaded_label_is_read_into_an_unverified_draft(
    client: httpx.AsyncClient,
    auth_headers,
    state,
    monkeypatch,
):
    dog_id = await create_dog(client, auth_headers)
    init = await client.post(
        "/v1/nutrition/foods/scan/init",
        json={
            "dog_id": dog_id,
            "client_request_id": "food-extract-0001",
            "bytes": 80_000,
            "content_type": "image/jpeg",
        },
        headers={**auth_headers, "X-Idempotency-Key": "food-extract-0001"},
    )
    food_id = init.json()["food_product_id"]
    image_path = init.json()["upload"]["storage_path"]
    state.storage.objects.add(("food-labels", image_path))
    calls = 0

    async def fake_extract(settings, *, image_ref):
        nonlocal calls
        calls += 1
        assert image_ref
        return (
            FoodLabelExtraction(
                brand="Dogly Food",
                name="Adult Pollo",
                ingredients_raw="pollo, riso",
                guaranteed_analysis=GuaranteedAnalysis(
                    crude_protein_min=26,
                    crude_fat_min=14,
                    calories="365 kcal/100 g",
                ),
                extraction_confidence={
                    "brand": 0.94,
                    "name": 0.91,
                    "ingredients": 0.82,
                    "protein": 0.97,
                },
            ),
            ProviderUsage(provider="openai", model="test"),
        )

    monkeypatch.setattr(nutrition_routes, "extract_food_label", fake_extract)

    extracted = await client.post(
        f"/v1/nutrition/foods/{food_id}/extract",
        headers=auth_headers,
    )
    assert extracted.status_code == 200, extracted.text
    body = extracted.json()
    assert body["brand"] == "Dogly Food"
    assert body["name"] == "Adult Pollo"
    assert body["guaranteed_analysis"]["crude_protein_min"] == 26
    assert body["extraction_confidence"]["ingredients"] == 0.82
    assert body["verified_at"] is None

    repeated = await client.post(
        f"/v1/nutrition/foods/{food_id}/extract",
        headers=auth_headers,
    )
    assert repeated.status_code == 200
    assert calls == 1


async def test_owner_can_add_food_without_scanning_a_label(
    client: httpx.AsyncClient, auth_headers
):
    dog_id = await create_dog(client, auth_headers)
    created = await client.post(
        "/v1/nutrition/foods/manual",
        json={
            "dog_id": dog_id,
            "client_request_id": "manual-food-0001",
            "brand": None,
            "name": "Pasto casalingo al pollo",
            "guaranteed_analysis": {},
        },
        headers={**auth_headers, "X-Idempotency-Key": "manual-food-0001"},
    )

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "Pasto casalingo al pollo"
    assert body["verified_at"] is not None

    repeated = await client.post(
        "/v1/nutrition/foods/manual",
        json={
            "dog_id": dog_id,
            "client_request_id": "manual-food-0001",
            "brand": None,
            "name": "Pasto casalingo al pollo",
            "guaranteed_analysis": {},
        },
        headers={**auth_headers, "X-Idempotency-Key": "manual-food-0001"},
    )
    assert repeated.status_code == 201
    assert repeated.json()["id"] == body["id"]
