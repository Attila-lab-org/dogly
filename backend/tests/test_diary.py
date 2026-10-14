"""GET /v1/diary: digestive_score esposto dalla timeline (fecal_score_estimate)."""

from datetime import UTC, datetime

import httpx

from app.domains.models import FecalEventRec
from tests.conftest import create_dog


def _fecal_event(
    event_id: str,
    dog_id: str,
    user_id: str,
    score: int | None,
) -> FecalEventRec:
    return FecalEventRec(
        id=event_id,
        dog_id=dog_id,
        user_id=user_id,
        client_request_id=f"crid-{event_id}",
        image_path=f"{user_id}/{dog_id}/{event_id}.jpg",
        status="COMPLETED",
        fecal_score_estimate=score,
        created_at=datetime.now(UTC),
    )


async def test_diary_item_exposes_digestive_score(
    client: httpx.AsyncClient, auth_headers, state, user_id
):
    dog_id = await create_dog(client, auth_headers)
    state.store.fecal_events["fec-score-3"] = _fecal_event(
        "fec-score-3", dog_id, user_id, 3
    )
    state.store.fecal_events["fec-score-none"] = _fecal_event(
        "fec-score-none", dog_id, user_id, None
    )

    resp = await client.get("/v1/diary", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    items = {item["id"]: item for item in resp.json()["items"]}
    assert items["fec-score-3"]["digestive_score"] == 3
    assert items["fec-score-none"]["digestive_score"] is None


async def test_diary_digestive_score_never_leaks_other_users(
    client: httpx.AsyncClient, auth_headers, state, user_id
):
    dog_id = await create_dog(client, auth_headers)
    state.store.fecal_events["fec-alien"] = _fecal_event(
        "fec-alien", dog_id, user_id, 5
    )

    resp = await client.get(
        "/v1/diary", headers=auth_headers, params={"domain": "DIGESTIVE"}
    )
    assert resp.status_code == 200, resp.text
    assert [item["digestive_score"] for item in resp.json()["items"]] == [5]
