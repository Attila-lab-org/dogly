from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx

from tests.conftest import create_dog


async def test_care_agenda_crud(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    dog_id = await create_dog(client, auth_headers)
    scheduled_at = datetime.now(UTC) + timedelta(days=10)

    created = await client.post(
        f"/v1/dogs/{dog_id}/care-events",
        headers={**auth_headers, "X-Idempotency-Key": "care-create-1"},
        json={
            "event_type": "VACCINE",
            "title": "Richiamo vaccino",
            "scheduled_at": scheduled_at.isoformat(),
            "all_day": True,
            "timezone": "Europe/Rome",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["reminder_enabled"] is True
    assert body["reminder_minutes_before"] == 1440
    assert body["status"] == "SCHEDULED"

    listed = await client.get(
        f"/v1/dogs/{dog_id}/care-events",
        headers=auth_headers,
    )
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [body["id"]]

    completed = await client.patch(
        f"/v1/care-events/{body['id']}",
        headers=auth_headers,
        json={"status": "COMPLETED"},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "COMPLETED"
    assert completed.json()["completed_at"] is not None

    upcoming = await client.get(
        f"/v1/dogs/{dog_id}/care-events",
        headers=auth_headers,
    )
    assert upcoming.json()["items"] == []

    history = await client.get(
        f"/v1/dogs/{dog_id}/care-events?include_completed=true",
        headers=auth_headers,
    )
    assert len(history.json()["items"]) == 1

    deleted = await client.delete(
        f"/v1/care-events/{body['id']}",
        headers=auth_headers,
    )
    assert deleted.status_code == 204
