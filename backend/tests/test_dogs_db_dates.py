from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

import pytest

from app.contracts.errors import ApiError, ErrorCode
from app.domains.age_stage import normalize_age_stage, profile_life_stage
from app.domains.dogs_db import (
    _normalize_size,
    _parse_birth_date,
    _row_to_dog,
    get_owned_dog,
)
from app.domains.ids import require_uuid


def test_parse_birth_date_returns_postgres_compatible_date() -> None:
    assert _parse_birth_date("2022-09-01") == date(2022, 9, 1)


def test_normalize_size_matches_database_constraint() -> None:
    assert _normalize_size("medium") == "MEDIUM"
    assert _normalize_size(None) is None


def test_row_to_dog_serializes_database_date() -> None:
    dog_id = uuid4()
    owner_id = uuid4()

    dog = _row_to_dog(
        {
            "id": dog_id,
            "owner_id": owner_id,
            "name": "Oreo",
            "birth_date": date(2022, 9, 1),
            "age_stage": "adult",
            "size": "medium",
            "breed_label": "Akita Americano",
            "is_mix": False,
            "sex": None,
            "weight_kg": None,
            "photo_path": None,
            "created_at": datetime.now(UTC),
        }
    )

    assert dog.birth_date == "2022-09-01"


async def test_get_owned_dog_rejects_non_uuid_without_hitting_database() -> None:
    with pytest.raises(ApiError) as exc:
        await get_owned_dog(None, user_id=str(uuid4()), dog_id="dog-rocky")  # type: ignore[arg-type]

    assert exc.value.code == ErrorCode.NOT_FOUND


def test_normalize_age_stage_accepts_labels_and_rejects_garbage() -> None:
    assert normalize_age_stage("5 anni") == "5 anni"
    assert normalize_age_stage("adult") == "ADULT"
    assert normalize_age_stage("Adulto") == "ADULT"
    assert normalize_age_stage("boh") == "UNKNOWN"
    assert profile_life_stage("5 anni") == "MATURE_ADULT"
    assert profile_life_stage("Meno di 1 anno") == "PUPPY"


def test_require_uuid_rejects_mock_identifiers() -> None:
    with pytest.raises(ApiError) as exc:
        require_uuid("evt-relax", not_found="Event not found")
    assert exc.value.code == ErrorCode.NOT_FOUND
