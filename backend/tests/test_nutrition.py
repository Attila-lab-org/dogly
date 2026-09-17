"""Nutrition list/verify wiring (no fake OCR success)."""

import httpx

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
