"""PostgreSQL repository for append-only user consent history."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.contracts.api import UserConsentsPatch, UserConsentsResponse
from app.domains.consents import FIELD_TO_TYPE, TYPE_TO_FIELD


async def get_consents(engine: AsyncEngine, user_id: str) -> UserConsentsResponse:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    """
                    select distinct on (consent_type)
                           consent_type, policy_version, granted
                    from public.user_consents
                    where user_id = cast(:user_id as uuid)
                    order by consent_type, created_at desc, id desc
                    """
                ),
                {"user_id": user_id},
            )
        ).mappings().all()

    values: dict[str, bool] = {}
    versions: dict[str, str] = {}
    for row in rows:
        field = TYPE_TO_FIELD[str(row["consent_type"])]
        values[field] = bool(row["granted"])
        versions[field] = str(row["policy_version"])
    return UserConsentsResponse(**values, policy_versions=versions)


async def patch_consents(
    engine: AsyncEngine, user_id: str, payload: UserConsentsPatch
) -> UserConsentsResponse:
    async with engine.begin() as conn:
        for field, consent_type in FIELD_TO_TYPE.items():
            granted = getattr(payload, field)
            if granted is None:
                continue
            await conn.execute(
                text(
                    """
                    insert into public.user_consents (
                      user_id, consent_type, policy_version, granted,
                      granted_at, revoked_at
                    ) values (
                      cast(:user_id as uuid), :consent_type, :policy_version,
                      :granted,
                      case when :granted then now() else null end,
                      case when :granted then null else now() end
                    )
                    """
                ),
                {
                    "user_id": user_id,
                    "consent_type": consent_type,
                    "policy_version": payload.policy_version,
                    "granted": granted,
                },
            )
    return await get_consents(engine, user_id)
