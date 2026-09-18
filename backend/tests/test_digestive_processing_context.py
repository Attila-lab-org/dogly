import pytest

from app.worker.handlers import process_digestive_event
from tests.conftest import create_dog


@pytest.mark.asyncio
async def test_owner_context_saved_while_digestive_analysis_is_queued(
    client, auth_headers, state
):
    dog_id = await create_dog(client, auth_headers)
    initialized = await client.post(
        "/v1/digestive/fecal/init",
        headers={
            **auth_headers,
            "X-Idempotency-Key": "digestive-context-init",
        },
        json={
            "dog_id": dog_id,
            "client_request_id": "digestive-context-event",
            "bytes": 1_000,
            "content_type": "image/jpeg",
        },
    )
    event_id = initialized.json()["event_id"]
    path = initialized.json()["upload"]["storage_path"]

    contextualized = await client.patch(
        f"/v1/digestive/events/{event_id}/context",
        headers=auth_headers,
        json={"unusual_food_48h": True, "vomiting_today": False},
    )

    assert contextualized.status_code == 200
    assert contextualized.json()["status"] == "UPLOADING"
    assert contextualized.json()["context_answered_keys"] == [
        "unusual_food_48h",
        "vomiting_today",
    ]

    state.storage.objects.add(("digestive-raw", path))
    completed_response = await client.post(
        f"/v1/digestive/fecal/{event_id}/complete",
        headers={
            **auth_headers,
            "X-Idempotency-Key": "digestive-context-complete",
        },
    )
    if completed_response.json()["status"] != "COMPLETED":
        await process_digestive_event(state, event_id=event_id)
    result = await client.get(
        f"/v1/digestive/events/{event_id}", headers=auth_headers
    )

    assert result.status_code == 200
    assert any(
        "48 ore" in item for item in result.json()["possible_associations"]
    )
