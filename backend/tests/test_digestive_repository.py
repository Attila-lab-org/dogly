from datetime import UTC, datetime

from app.domains.digestive_db import _fecal_from_row


def test_retained_digestive_result_survives_deleted_private_image():
    event = _fecal_from_row(
        {
            "id": "event-1",
            "dog_id": "dog-1",
            "user_id": "user-1",
            "client_request_id": "request-1",
            "image_path": None,
            "status": "COMPLETED",
            "retention_state": "DELETED",
            "created_at": datetime.now(UTC),
        }
    )

    assert event.image_path == ""
    assert event.status == "COMPLETED"
    assert event.retention_state.value == "DELETED"
