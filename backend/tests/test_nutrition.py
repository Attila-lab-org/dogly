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


async def test_quantity_change_updates_active_period_without_food_change(
    client: httpx.AsyncClient, auth_headers
):
    dog_id = await create_dog(client, auth_headers)
    created = await client.post(
        "/v1/nutrition/foods/manual",
        json={
            "dog_id": dog_id,
            "client_request_id": "manual-food-qty-0001",
            "brand": None,
            "name": "Pasto casalingo al pollo",
            "guaranteed_analysis": {},
        },
        headers={**auth_headers, "X-Idempotency-Key": "manual-food-qty-0001"},
    )
    food_id = created.json()["id"]
    started = await client.post(
        "/v1/nutrition/feeding-periods",
        json={
            "dog_id": dog_id,
            "food_product_id": food_id,
            "start_at": "2026-09-01T10:00:00Z",
            "quantity_per_day": "200 g",
            "treats_notes": "un biscotto",
            "transition_notes": "passaggio lento",
        },
        headers={**auth_headers, "X-Idempotency-Key": "feed-qty-start"},
    )
    assert started.status_code == 201, started.text
    period_id = started.json()["id"]

    patched = await client.patch(
        f"/v1/nutrition/feeding-periods/{period_id}",
        json={"quantity_per_day": "250 g"},
        headers={**auth_headers, "X-Idempotency-Key": f"feed-qty-{period_id}-250"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["id"] == period_id
    assert patched.json()["start_at"].startswith("2026-09-01")
    assert patched.json()["quantity_per_day"] == "250 g"
    assert patched.json()["end_at"] is None

    repeated = await client.post(
        "/v1/nutrition/feeding-periods",
        json={
            "dog_id": dog_id,
            "food_product_id": food_id,
            "start_at": "2026-09-18T08:00:00Z",
            "quantity_per_day": "260 g",
        },
        headers={**auth_headers, "X-Idempotency-Key": "feed-qty-repost"},
    )
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["id"] == period_id
    assert repeated.json()["start_at"].startswith("2026-09-01")
    assert repeated.json()["quantity_per_day"] == "260 g"

    listed = await client.get(
        f"/v1/nutrition/feeding-periods?dog_id={dog_id}", headers=auth_headers
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["quantity_per_day"] == "260 g"


def test_quantity_update_keeps_food_start_and_notes():
    from datetime import UTC, datetime, timedelta

    from app.contracts.api import FeedingPeriodCreate, FeedingPeriodUpdate
    from app.domains.digestive import (
        build_inmemory_digestive_context,
        create_feeding_period,
        update_feeding_period,
    )
    from app.domains.models import DogRec, FecalEventRec, FoodProductRec
    from app.domains.repository import InMemoryStore

    store = InMemoryStore()
    now = datetime(2026, 9, 18, tzinfo=UTC)
    dog_id = "00000000-0000-0000-0000-000000000001"
    user_id = "00000000-0000-0000-0000-0000000000aa"
    food_id = "00000000-0000-0000-0000-0000000000f1"
    store.dogs[dog_id] = DogRec(
        id=dog_id,
        owner_id=user_id,
        name="Oreo",
        created_at=now - timedelta(days=40),
    )
    store.food_products[food_id] = FoodProductRec(
        id=food_id,
        owner_id=user_id,
        dog_id=dog_id,
        client_request_id="food-qty",
        name="Pasto casalingo",
        verified_at=now - timedelta(days=20),
        created_at=now - timedelta(days=20),
    )
    period = create_feeding_period(
        store,
        user_id=user_id,
        payload=FeedingPeriodCreate(
            dog_id=dog_id,
            food_product_id=food_id,
            start_at=now - timedelta(days=10),
            quantity_per_day="200 g",
            treats_notes="un biscotto",
            transition_notes="passaggio lento",
        ),
    )
    updated = update_feeding_period(
        store,
        user_id=user_id,
        period_id=period.id,
        payload=FeedingPeriodUpdate(quantity_per_day="250 g"),
    )
    assert updated.id == period.id
    assert updated.start_at == period.start_at
    assert updated.quantity_per_day == "250 g"
    assert updated.treats_notes == "un biscotto"
    assert updated.transition_notes == "passaggio lento"

    event = FecalEventRec(
        id="now",
        dog_id=dog_id,
        user_id=user_id,
        client_request_id="now",
        image_path="path",
        created_at=now,
        status="COMPLETED",
        fecal_score_estimate=4,
        learning_eligible=True,
    )
    store.fecal_events["now"] = event
    context = build_inmemory_digestive_context(store, event=event)
    assert context.food_started_days_ago == 10
    assert context.quantity_per_day == "250 g"


def test_manual_food_insert_matches_partial_unique_index():
    import inspect

    from app.domains import digestive_db

    source = inspect.getsource(digestive_db.create_manual_food_product)
    assert "on conflict (owner_id, client_request_id)" in source
    assert "where client_request_id is not null" in source
