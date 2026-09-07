"""Typed lifestyle schema: closed/bounded DogLifestylePatch enforcement.

The mobile client (apps/mobile/src/features/lifestyle) sends snake_case
single-choice keys with null = "non so"; quantified fields accept bounded
numbers and lists. Unknown keys, out-of-range values and oversized lists are
rejected at the API boundary with 422.
"""

import httpx
import pytest
from pydantic import ValidationError

from app.contracts.api import DogLifestylePatch


def test_routine_accepts_mobile_progressive_profiling_payload():
    payload = DogLifestylePatch.model_validate(
        {
            "routine": {"activity": "CALM", "sleep": None, "social": "BOTH"},
            "confirm": True,
        }
    )
    # Only explicitly sent keys are part of the patch; explicit null clears.
    assert payload.routine_update() == {
        "activity": "CALM",
        "sleep": None,
        "social": "BOTH",
    }


def test_routine_accepts_quantified_fields():
    payload = DogLifestylePatch.model_validate(
        {
            "routine": {
                "sleep_hours": 12.5,
                "walks_per_day": 3,
                "walk_minutes_average": 45,
                "activity_level": "moderate",
                "alone_hours": 4.0,
                "meal_schedule": {
                    "meals_per_day": 2,
                    "typical_times": ["08:00", "19:00"],
                },
                "usual_rest_periods": ["dopo pranzo"],
                "social_contacts": ["cane del vicino"],
                "usual_triggers": ["campanello"],
                "recent_changes": ["trasloco la scorsa settimana"],
            },
            "confirm": True,
        }
    )
    dump = payload.routine_update()
    assert dump["meal_schedule"]["meals_per_day"] == 2
    assert dump["recent_changes"] == ["trasloco la scorsa settimana"]


@pytest.mark.parametrize(
    "routine",
    [
        {"sleep_hours": 24.5},
        {"walks_per_day": 11},
        {"walk_minutes_average": 501},
        {"alone_hours": 25},
        {"activity": "HYPER"},
        {"meal_schedule": {"meals_per_day": 11}},
        {"meal_schedule": {"meals_per_day": 2, "typical_times": ["07:00"] * 7}},
        {"social_contacts": ["amico"] * 21},
        {"social_contacts": ["x" * 101]},
        {"usual_triggers": ["x" * 101]},
        {"recent_changes": ["cambio"] * 11},
        {"recent_changes": ["x" * 201]},
        {"unknown_free_form_key": "nope"},
    ],
)
def test_routine_rejects_out_of_range_oversized_and_unknown(routine):
    with pytest.raises(ValidationError):
        DogLifestylePatch.model_validate({"routine": routine, "confirm": True})


def test_preferences_closed_and_bounded():
    payload = DogLifestylePatch.model_validate(
        {
            "preferences": {"walk_environment": "CITY", "notes": "passeggiate al parco"},
            "confirm": True,
        }
    )
    assert payload.preferences_update()["walk_environment"] == "CITY"
    with pytest.raises(ValidationError):
        DogLifestylePatch.model_validate(
            {"preferences": {"free_form": 1}, "confirm": True}
        )
    with pytest.raises(ValidationError):
        DogLifestylePatch.model_validate(
            {"preferences": {"notes": "x" * 501}, "confirm": True}
        )


async def test_patch_lifestyle_rejects_bad_payload_with_422(
    client: httpx.AsyncClient, auth_headers
):
    dog = await client.post("/v1/dogs", headers=auth_headers, json={"name": "Luna"})
    dog_id = dog.json()["id"]

    out_of_range = await client.patch(
        f"/v1/dogs/{dog_id}/lifestyle",
        headers=auth_headers,
        json={"routine": {"sleep_hours": 30}, "confirm": True},
    )
    assert out_of_range.status_code == 422

    unknown_key = await client.patch(
        f"/v1/dogs/{dog_id}/lifestyle",
        headers=auth_headers,
        json={"routine": {"naps_per_day": 3}, "confirm": True},
    )
    assert unknown_key.status_code == 422

    oversized = await client.patch(
        f"/v1/dogs/{dog_id}/lifestyle",
        headers=auth_headers,
        json={"routine": {"social_contacts": ["x"] * 21}, "confirm": True},
    )
    assert oversized.status_code == 422


async def test_patch_lifestyle_mobile_payload_roundtrip_and_null_clears(
    client: httpx.AsyncClient, auth_headers
):
    dog = await client.post("/v1/dogs", headers=auth_headers, json={"name": "Rocky"})
    dog_id = dog.json()["id"]

    first = await client.patch(
        f"/v1/dogs/{dog_id}/lifestyle",
        headers=auth_headers,
        json={
            "routine": {"activity": "CALM", "social": "BOTH", "time_alone": "LITTLE"},
            "confirm": True,
        },
    )
    assert first.status_code == 200, first.text
    assert first.json()["routine"]["social"] == "BOTH"

    # Explicit null clears only the sent key; other keys survive the merge.
    second = await client.patch(
        f"/v1/dogs/{dog_id}/lifestyle",
        headers=auth_headers,
        json={"routine": {"social": None}, "confirm": True},
    )
    assert second.status_code == 200, second.text
    assert second.json()["routine"]["social"] is None
    assert second.json()["routine"]["activity"] == "CALM"
    assert second.json()["routine"]["time_alone"] == "LITTLE"
