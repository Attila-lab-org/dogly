"""Privacy export/delete workflows exercise the memory path used in CI."""

from __future__ import annotations

import gzip
import json

import httpx

from tests.conftest import create_dog


async def test_privacy_export_memory_path_uploads_gzip(
    client: httpx.AsyncClient,
    worker_client: httpx.AsyncClient,
    auth_headers: dict[str, str],
    state,
    user_id: str,
) -> None:
    dog_id = await create_dog(client, auth_headers)

    started = await client.post("/v1/privacy/export", headers=auth_headers)
    assert started.status_code == 202, started.text
    job_id = started.json()["export_job_id"]
    assert started.json()["status"] == "queued"

    processed = await worker_client.post(
        "/tasks/run",
        json={"task_type": "privacy_export", "event_id": job_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert processed.status_code == 200, processed.text
    body = processed.json()
    assert body["status"] == "COMPLETED"

    blob = state.storage.blobs[("exports", body["storage_path"])]
    payload = json.loads(gzip.decompress(blob).decode("utf-8"))
    assert payload["user_id"] == user_id
    assert [dog["id"] for dog in payload["dogs"]] == [dog_id]
    assert "bytes" not in json.dumps(payload)

    status = await client.get(f"/v1/privacy/export/{job_id}", headers=auth_headers)
    assert status.status_code == 200, status.text
    status_body = status.json()
    assert status_body["status"] == "completed"
    assert status_body["download_url"].startswith("https://storage.mock.local/exports/read/")
    assert status_body["expires_at"] is not None


async def test_account_deletion_memory_path_requires_confirmation_and_purges(
    client: httpx.AsyncClient,
    worker_client: httpx.AsyncClient,
    auth_headers: dict[str, str],
    state,
    user_id: str,
) -> None:
    dog_id = await create_dog(client, auth_headers)

    invalid = await client.post(
        "/v1/privacy/delete-account",
        json={"confirm": "delete"},
        headers=auth_headers,
    )
    assert invalid.status_code == 422

    started = await client.post(
        "/v1/privacy/delete-account",
        json={"confirm": "DELETE_MY_ACCOUNT"},
        headers=auth_headers,
    )
    assert started.status_code == 202, started.text
    job_id = started.json()["deletion_job_id"]
    assert started.json()["status"] == "pending"

    processed = await worker_client.post(
        "/tasks/run",
        json={"task_type": "account_deletion", "event_id": job_id},
        headers={"x-internal-token": "test-internal-token"},
    )
    assert processed.status_code == 200, processed.text
    assert processed.json()["status"] == "COMPLETED"
    assert user_id not in state.store.profiles
    assert dog_id not in state.store.dogs
    assert state.store.deletion_jobs[job_id].status == "completed"
