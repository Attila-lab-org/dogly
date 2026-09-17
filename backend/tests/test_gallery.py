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

    moments = await client.get(
        f"/v1/dogs/{dog_id}/photos?limit=3",
        headers=auth_headers,
    )
    assert moments.status_code == 200
    assert [item["id"] for item in moments.json()["items"]] == [photo_id]

    deleted = await client.delete(f"/v1/photos/{photo_id}", headers=auth_headers)
    assert deleted.status_code == 204

    photos = await client.get(f"/v1/albums/{album_id}/photos", headers=auth_headers)
    assert photos.status_code == 200
    assert photos.json()["items"] == []


async def test_gallery_soft_delete_removes_storage_object(
    client: httpx.AsyncClient,
    auth_headers,
    state,
):
    dog_id = await create_dog(client, auth_headers)
    album = await client.post(
        f"/v1/dogs/{dog_id}/albums",
        json={"title": "Orfani", "default_visibility": "PRIVATE"},
        headers=auth_headers,
    )
    album_id = album.json()["id"]
    photo = await client.post(
        f"/v1/albums/{album_id}/photos/init",
        json={"content_type": "image/jpeg", "bytes": 8_192},
        headers=auth_headers,
    )
    assert photo.status_code == 201, photo.text
    photo_id = photo.json()["photo"]["id"]
    path = photo.json()["photo"]["storage_path"]
    kept = await client.post(
        f"/v1/albums/{album_id}/photos/init",
        json={"content_type": "image/jpeg", "bytes": 4_096, "caption": "resta"},
        headers=auth_headers,
    )
    kept_path = kept.json()["photo"]["storage_path"]
    state.storage.objects.add(("dog-gallery", path))
    state.storage.objects.add(("dog-gallery", kept_path))

    deleted = await client.delete(f"/v1/photos/{photo_id}", headers=auth_headers)
    assert deleted.status_code == 204
    assert ("dog-gallery", path) not in state.storage.objects
    assert ("dog-gallery", kept_path) in state.storage.objects
    assert state.store.dog_photos[photo_id].deleted_at is not None


async def test_recent_dog_photos_exclude_stories(
    client: httpx.AsyncClient,
    auth_headers,
):
    dog_id = await create_dog(client, auth_headers)
    moments = await client.post(
        f"/v1/dogs/{dog_id}/albums",
        json={"title": "Momenti"},
        headers=auth_headers,
    )
    stories = await client.post(
        f"/v1/dogs/{dog_id}/albums",
        json={"title": "Storie"},
        headers=auth_headers,
    )
    moment = await client.post(
        f"/v1/albums/{moments.json()['id']}/photos/init",
        json={"content_type": "image/jpeg", "bytes": 1_024},
        headers=auth_headers,
    )
    await client.post(
        f"/v1/albums/{stories.json()['id']}/photos/init",
        json={"content_type": "image/jpeg", "bytes": 1_024},
        headers=auth_headers,
    )

    response = await client.get(
        f"/v1/dogs/{dog_id}/photos",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [
        moment.json()["photo"]["id"]
    ]
