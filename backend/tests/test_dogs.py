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
