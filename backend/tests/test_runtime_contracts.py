"""Runtime contracts shared by the backend and the mobile application."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.api.pagination import paginate_desc
from app.api.routes.digestive import _public_digestive_status
from app.contracts.api import BehaviorCaptureInitRequest, FecalInitRequest
from app.domains.billing_db import _webhook_status_to_db
from app.providers.billing import map_revenuecat_event


@dataclass
class _Item:
    id: str
    created_at: datetime


def test_newest_first_pagination_continues_toward_older_items():
    now = datetime.now(UTC)
    items = [_Item(str(index), now + timedelta(minutes=index)) for index in range(5)]

    first, cursor = paginate_desc(items, cursor=None, limit=2)
    second, next_cursor = paginate_desc(items, cursor=cursor, limit=2)
    third, final_cursor = paginate_desc(items, cursor=next_cursor, limit=2)

    assert [item.id for item in first] == ["4", "3"]
    assert [item.id for item in second] == ["2", "1"]
    assert [item.id for item in third] == ["0"]
    assert final_cursor is None


def test_digestive_worker_statuses_are_mapped_to_mobile_contract():
    assert _public_digestive_status("OBSERVING") == "PROCESSING"
    assert _public_digestive_status("FAILED_RETRYABLE") == "PROCESSING"
    assert _public_digestive_status("REJECTED_QUALITY") == "INSUFFICIENT_IMAGE"
    assert _public_digestive_status("COMPLETED") == "COMPLETED"
    assert _public_digestive_status("FAILED_TERMINAL") == "FAILED_TERMINAL"


def test_revenuecat_cancellation_keeps_access_until_expiration():
    update = map_revenuecat_event(
        {
            "event": {
                "id": "evt-cancel",
                "type": "CANCELLATION",
                "app_user_id": "user-1",
                "product_id": "dogly_annual",
            }
        }
    )
    assert update is not None
    assert update["status"] == "active"
    assert update["plan"] == "PREMIUM_ANNUAL"


def test_revenuecat_billing_issue_maps_to_grace_period():
    update = map_revenuecat_event(
        {
            "event": {
                "id": "evt-billing",
                "type": "BILLING_ISSUE",
                "app_user_id": "user-1",
                "product_id": "dogly_monthly",
            }
        }
    )
    assert update is not None
    assert update["status"] == "grace_period"
    assert update["plan"] == "PREMIUM_MONTHLY"
    assert _webhook_status_to_db(update["status"]) == "GRACE_PERIOD"


def test_capture_contracts_allow_webm_and_reject_unsupported_media():
    request = BehaviorCaptureInitRequest(
        dog_id="dog",
        client_request_id="request-123",
        duration_ms=8_000,
        bytes=1_000,
        content_type="video/webm",
    )
    assert request.content_type == "video/webm"
    with pytest.raises(ValidationError):
        BehaviorCaptureInitRequest(
            dog_id="dog",
            client_request_id="request-123",
            duration_ms=8_000,
            bytes=1_000,
            content_type="video/x-msvideo",
        )
    with pytest.raises(ValidationError):
        FecalInitRequest(
            dog_id="dog",
            client_request_id="request-123",
            bytes=1_000,
            content_type="application/pdf",
        )
