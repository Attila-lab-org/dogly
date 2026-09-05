from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

from app.domains.dogs_db import _parse_birth_date, _row_to_dog


def test_parse_birth_date_returns_postgres_compatible_date() -> None:
    assert _parse_birth_date("2022-09-01") == date(2022, 9, 1)


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
