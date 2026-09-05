"""In-memory consent history used by local development and unit tests."""

from __future__ import annotations

from app.contracts.api import UserConsentsPatch, UserConsentsResponse
from app.domains.repository import InMemoryStore, now_utc

FIELD_TO_TYPE = {
    "service_terms": "SERVICE_TERMS",
    "research_training": "RESEARCH_TRAINING",
    "notifications": "NOTIFICATIONS",
    "media_retention": "MEDIA_RETENTION",
}
TYPE_TO_FIELD = {value: key for key, value in FIELD_TO_TYPE.items()}


def get_consents(store: InMemoryStore, user_id: str) -> UserConsentsResponse:
    values: dict[str, bool] = {}
    versions: dict[str, str] = {}
    for row in store.user_consents:
        if row["user_id"] != user_id:
            continue
        field = TYPE_TO_FIELD[row["consent_type"]]
        values[field] = row["granted"]
        versions[field] = row["policy_version"]
    return UserConsentsResponse(**values, policy_versions=versions)


def patch_consents(
    store: InMemoryStore, user_id: str, payload: UserConsentsPatch
) -> UserConsentsResponse:
    now = now_utc().isoformat()
    for field, consent_type in FIELD_TO_TYPE.items():
        granted = getattr(payload, field)
        if granted is None:
            continue
        store.user_consents.append(
            {
                "user_id": user_id,
                "consent_type": consent_type,
                "policy_version": payload.policy_version,
                "granted": granted,
                "granted_at": now if granted else None,
                "revoked_at": None if granted else now,
                "created_at": now,
            }
        )
    return get_consents(store, user_id)
