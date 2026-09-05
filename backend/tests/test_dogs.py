from __future__ import annotations

import httpx


async def test_dog_profile_returns_birthday_and_mix(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    created = await client.post(
        "/v1/dogs",
        headers=auth_headers,
        json={
            "name": "Luna",
            "birth_date": "2022-05-18",
            "breed_label": "Mix",
            "is_mix": True,
        },
    )

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["birth_date"] == "2022-05-18"
    assert body["breed_label"] == "Mix"
    assert body["is_mix"] is True

    listed = await client.get("/v1/dogs", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["birth_date"] == "2022-05-18"


async def test_dog_avatar_init_complete_persists_signed_url(
    client: httpx.AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    created = await client.post(
        "/v1/dogs",
        headers=auth_headers,
        json={"name": "Nala", "size": "MEDIUM"},
    )
    assert created.status_code == 201, created.text
    dog_id = created.json()["id"]
    assert created.json()["photo_path"] is None
    assert created.json()["photo_url"] is None

    init = await client.post(
        f"/v1/dogs/{dog_id}/avatar/init",
        headers=auth_headers,
        json={"content_type": "image/jpeg", "bytes": 2048},
    )
    assert init.status_code == 200, init.text
    path = init.json()["storage_path"]
    assert path.startswith("users/")
    assert f"/dogs/{dog_id}/avatar/" in path
    assert init.json()["upload"]["url"].startswith("https://storage.mock.local/")

    rejected = await client.post(
        f"/v1/dogs/{dog_id}/avatar/complete",
        headers=auth_headers,
        json={"storage_path": f"users/other/dogs/{dog_id}/avatar/x.jpg"},
    )
    assert rejected.status_code == 422

    completed = await client.post(
        f"/v1/dogs/{dog_id}/avatar/complete",
        headers=auth_headers,
        json={"storage_path": path, "bytes": 2048},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["photo_path"] == path
    assert completed.json()["photo_url"].startswith(
        f"https://storage.mock.local/dog-avatars/read/{path}"
    )

    listed = await client.get("/v1/dogs", headers=auth_headers)
    assert listed.json()["items"][0]["photo_path"] == path
    assert listed.json()["items"][0]["photo_url"]
