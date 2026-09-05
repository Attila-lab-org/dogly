"""Gallery albums + profile visibility API (Dogly UX V1)."""

import httpx

from tests.conftest import create_dog


async def test_album_photo_and_visibility_flow(
    client: httpx.AsyncClient, auth_headers
):
    dog_id = await create_dog(client, auth_headers)

    vis = await client.get(f"/v1/dogs/{dog_id}/visibility", headers=auth_headers)
    assert vis.status_code == 200
    assert vis.json()["visibility"] == "PRIVATE"

    denied = await client.put(
        f"/v1/dogs/{dog_id}/visibility",
        json={"visibility": "PUBLIC"},
        headers=auth_headers,
    )
    assert denied.status_code == 422

    published = await client.put(
        f"/v1/dogs/{dog_id}/visibility",
        json={"visibility": "PUBLIC", "consent_version": "public-profile-v1"},
        headers=auth_headers,
    )
    assert published.status_code == 200
    assert published.json()["visibility"] == "PUBLIC"

    album = await client.post(
        f"/v1/dogs/{dog_id}/albums",
        json={"title": "Passeggiate", "default_visibility": "PRIVATE"},
        headers=auth_headers,
    )
    assert album.status_code == 201, album.text
    album_id = album.json()["id"]

    listed = await client.get(f"/v1/dogs/{dog_id}/albums", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1

    photo = await client.post(
        f"/v1/albums/{album_id}/photos/init",
        json={"content_type": "image/jpeg", "bytes": 120_000, "caption": "Al parco"},
        headers=auth_headers,
    )
    assert photo.status_code == 201, photo.text
    photo_id = photo.json()["photo"]["id"]
    assert photo.json()["upload"]["url"]

    patched = await client.patch(
        f"/v1/photos/{photo_id}",
        json={"visibility": "PUBLISHED"},
        headers=auth_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["visibility"] == "PUBLISHED"

    deleted = await client.delete(f"/v1/photos/{photo_id}", headers=auth_headers)
    assert deleted.status_code == 204

    photos = await client.get(f"/v1/albums/{album_id}/photos", headers=auth_headers)
    assert photos.status_code == 200
    assert photos.json()["items"] == []
