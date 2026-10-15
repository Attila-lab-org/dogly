"""Giochi: submit punteggio idempotente e classifica settimanale."""

import httpx

from app.domains.games import current_week_start
from tests.conftest import create_dog


def _score_body(dog_id: str, score: int, crid: str) -> dict:
    return {
        "dog_id": dog_id,
        "game": "squirrel",
        "score": score,
        "client_request_id": crid,
    }


async def test_submit_score_creates_and_is_idempotent(
    client: httpx.AsyncClient, auth_headers
):
    dog_id = await create_dog(client, auth_headers)
    first = await client.post(
        "/v1/games/scores", json=_score_body(dog_id, 9, "crid-games-0001"), headers=auth_headers
    )
    assert first.status_code == 201, first.text
    second = await client.post(
        "/v1/games/scores", json=_score_body(dog_id, 9, "crid-games-0001"), headers=auth_headers
    )
    assert second.status_code in (200, 201), second.text
    assert second.json()["id"] == first.json()["id"]

    board = await client.get("/v1/games/leaderboard", headers=auth_headers)
    assert board.status_code == 200, board.text
    items = board.json()["items"]
    assert len(items) == 1  # idempotenza: una sola partita registrata
    assert items[0]["score"] == 9
    assert items[0]["is_mine"] is True


async def test_submit_score_validates_range(
    client: httpx.AsyncClient, auth_headers
):
    dog_id = await create_dog(client, auth_headers)
    resp = await client.post(
        "/v1/games/scores", json=_score_body(dog_id, 999, "crid-games-0002"), headers=auth_headers
    )
    assert resp.status_code == 422


async def test_leaderboard_best_per_dog_and_ordering(
    client: httpx.AsyncClient, auth_headers, user_id, state
):
    dog_id = await create_dog(client, auth_headers)
    for score, crid in ((4, "crid-games-a"), (12, "crid-games-b"), (7, "crid-games-c")):
        resp = await client.post(
            "/v1/games/scores", json=_score_body(dog_id, score, crid), headers=auth_headers
        )
        assert resp.status_code == 201, resp.text

    # Un altro cane (altro utente) direttamente nello store.
    from app.domains.models import DogRec, GameScoreRec
    from datetime import UTC, datetime

    state.store.dogs["dog-rival"] = DogRec(
        id="dog-rival", owner_id="other-user", name="Fido",
        created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
    )
    state.store.game_scores["gs-rival"] = GameScoreRec(
        id="gs-rival", user_id="other-user", dog_id="dog-rival", game="squirrel",
        score=15, week_start=current_week_start(), client_request_id="crid-rival-x",
        created_at=datetime.now(UTC),
    )

    board = await client.get("/v1/games/leaderboard", headers=auth_headers)
    assert board.status_code == 200, board.text
    body = board.json()
    # best-per-cane: il mio cane compare una sola volta col suo massimo (12)
    mine_items = [item for item in body["items"] if item["dog_id"] == dog_id]
    assert len(mine_items) == 1
    assert mine_items[0]["score"] == 12
    # ordinamento: il rivale da 15 è primo
    assert body["items"][0]["dog_name"] == "Fido"
    assert body["items"][0]["score"] == 15
    # il chiamante ha la propria posizione anche fuori dalla top
    assert body["me"]["score"] == 12
    assert body["me"]["rank"] == 2


async def test_leaderboard_empty_week_is_honest(
    client: httpx.AsyncClient, auth_headers
):
    board = await client.get("/v1/games/leaderboard", headers=auth_headers)
    assert board.status_code == 200, board.text
    assert board.json()["items"] == []
    assert board.json()["me"] is None
