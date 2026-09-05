"""PostgreSQL repository for subscriptions and usage ledgers."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domains.billing import plan_limits
from app.domains.models import SubscriptionRec, UsageLedgerRec
from app.domains.repository import PLAN_ALLOWANCES, next_month_reset, now_utc


def _row_to_subscription(row: Any) -> SubscriptionRec:
    data = dict(row)
    data["user_id"] = str(data["user_id"])
    data["status"] = _db_status_to_api(data["status"])
    data["renews_at"] = data.pop("period_end", None)
    return SubscriptionRec.model_validate(data)


def _row_to_ledger(row: Any) -> UsageLedgerRec:
    data = dict(row)
    data["user_id"] = str(data["user_id"])
    return UsageLedgerRec.model_validate(data)


def _db_status_to_api(status: str | None) -> str:
    if (status or "").upper() in {"ACTIVE", "TRIALING", "GRACE_PERIOD"}:
        return "active"
    return "inactive"


def _webhook_status_to_db(status: str | None) -> str:
    normalized = (status or "").lower()
    if normalized == "active":
        return "ACTIVE"
    if normalized == "grace_or_cancelled":
        return "CANCELLED"
    return "EXPIRED"


def _expiration_ms_to_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    return datetime.fromtimestamp(int(value) / 1000, UTC)


async def get_subscription(engine: AsyncEngine, user_id: str) -> SubscriptionRec:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select user_id, plan, status, store, product_id, period_end, updated_at
                    from public.subscriptions
                    where user_id = :user_id
                    """
                ),
                {"user_id": user_id},
            )
        ).mappings().first()
    if row:
        return _row_to_subscription(row)
    return SubscriptionRec(user_id=user_id, updated_at=now_utc())


async def get_usage_ledger(engine: AsyncEngine, user_id: str) -> UsageLedgerRec:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select user_id, behavior_limit, behavior_used, behavior_reserved,
                           digestive_limit, digestive_used, digestive_reserved, reset_at
                    from public.usage_ledgers
                    where user_id = :user_id
                      and reset_at > now()
                    order by period_start desc
                    limit 1
                    """
                ),
                {"user_id": user_id},
            )
        ).mappings().first()
    if row:
        return _row_to_ledger(row)
    limits = PLAN_ALLOWANCES["FREE"]
    return UsageLedgerRec(
        user_id=user_id,
        behavior_limit=limits["behavior"],
        digestive_limit=limits["digestive"],
        reset_at=next_month_reset(),
    )


async def subscription_status_payload(engine: AsyncEngine, user_id: str) -> dict:
    sub = await get_subscription(engine, user_id)
    ledger = await get_usage_ledger(engine, user_id)
    limits = plan_limits(sub.plan)
    return {
        "plan": {
            "plan": sub.plan,
            "status": sub.status,
            "renews_at": sub.renews_at,
            "max_active_dogs": limits["max_active_dogs"],
        },
        "entitlement_source": "revenuecat_mirror",
        "limits": {
            "behavior": {
                "limit": ledger.behavior_limit,
                "used": ledger.behavior_used,
                "reserved": ledger.behavior_reserved,
            },
            "digestive": {
                "limit": ledger.digestive_limit,
                "used": ledger.digestive_used,
                "reserved": ledger.digestive_reserved,
            },
            "reset_at": ledger.reset_at,
        },
        "synced_at": now_utc(),
    }


async def upsert_subscription_from_webhook(engine: AsyncEngine, update: dict) -> bool:
    event_id = update.get("event_id")
    user_id = update["user_id"]
    plan = update["plan"]
    limits = PLAN_ALLOWANCES.get(plan, PLAN_ALLOWANCES["FREE"])
    db_status = _webhook_status_to_db(update.get("status"))
    period_end = _expiration_ms_to_datetime(update.get("expiration_at_ms"))

    async with engine.begin() as conn:
        if event_id:
            existing = (
                await conn.execute(
                    text(
                        """
                        select last_webhook_event_id
                        from public.subscriptions
                        where user_id = :user_id
                        """
                    ),
                    {"user_id": user_id},
                )
            ).mappings().first()
            if existing and existing["last_webhook_event_id"] == event_id:
                return False

        await conn.execute(
            text(
                """
                insert into public.subscriptions (
                  user_id, plan, status, store, product_id, period_end,
                  last_webhook_event_id, updated_at
                ) values (
                  :user_id, :plan, :status, :store, :product_id, :period_end,
                  :event_id, now()
                )
                on conflict (user_id) do update set
                  plan = excluded.plan,
                  status = excluded.status,
                  store = excluded.store,
                  product_id = excluded.product_id,
                  period_end = excluded.period_end,
                  last_webhook_event_id = excluded.last_webhook_event_id,
                  updated_at = now()
                """
            ),
            {
                "user_id": user_id,
                "plan": plan,
                "status": db_status,
                "store": update.get("store"),
                "product_id": update.get("product_id"),
                "period_end": period_end,
                "event_id": event_id,
            },
        )
        await conn.execute(
            text(
                """
                update public.usage_ledgers
                set behavior_limit = :behavior_limit,
                    digestive_limit = :digestive_limit,
                    updated_at = now()
                where user_id = :user_id
                  and reset_at > now()
                """
            ),
            {
                "user_id": user_id,
                "behavior_limit": limits["behavior"],
                "digestive_limit": limits["digestive"],
            },
        )
    return True
