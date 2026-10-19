"""Pre-call daily USD budget gate (ops, sez. 25 / RUNBOOK).

Kill switches are read inline by each provider; the daily USD budgets are
enforced here against internal.ai_cost_events BEFORE any paid provider call
is attempted. A pg_advisory_xact_lock serializes the persisted-spend snapshot
per role (serverless invocations share the same Postgres). Calls already in
flight are not yet recorded, so the cap may be exceeded by their final cost.

A BudgetExceededError is operational, not transient: it must never be
retried (that would burn the remaining budget) — the worker maps it to a
terminal failure (ErrorCode.AI_BUDGET_EXCEEDED).
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


class BudgetExceededError(RuntimeError):
    """Daily USD budget exhausted for a provider role: non-retryable."""

    def __init__(self, role: str, budget_usd: float, spent_usd: float):
        self.role = role
        self.budget_usd = budget_usd
        self.spent_usd = spent_usd
        super().__init__(
            f"{role} daily budget exceeded: "
            f"${spent_usd:.4f} spent of ${budget_usd:.2f} today"
        )


# A role budget is a shared daily cap. Keep the mapping explicit so a new
# provider operation cannot silently create a second, unmetered allowance.
ROLE_OPERATIONS: dict[str, tuple[str, ...]] = {
    "observer": ("observer.observe",),
    "reasoner": (
        "reasoner.interpret",
        "reasoner.refine_context",
        "reasoner.personal",
        "digestive.reason",
        "realtime.attachment_recognition",
        "realtime.chat",
    ),
    "digestive_vision": (
        "digestive_vision.observe_stool",
        "digestive_vision.verify_anomaly_focus",
    ),
    "owner_transcription": ("owner_story.transcribe", "voice.transcribe"),
    "realtime_live": ("realtime.live",),
}


async def check_daily_budget(
    engine: AsyncEngine | None,
    *,
    role: str,
    budget_usd: float,
    operation: str,
) -> None:
    """Raise BudgetExceededError when today's recorded spend for `operation`
    has reached `budget_usd`. No-op without a database (cost telemetry is
    persisted there) and with budget_usd <= 0 (explicit opt-out)."""
    if engine is None or budget_usd <= 0:
        return
    async with engine.begin() as conn:
        # Serialize budget checks per role across concurrent invocations.
        await conn.execute(
            text("select pg_advisory_xact_lock(hashtext('ai_budget:' || :role))"),
            {"role": role},
        )
        operations = tuple(dict.fromkeys((*ROLE_OPERATIONS.get(role, ()), operation)))
        placeholders = ", ".join(f":operation_{index}" for index in range(len(operations)))
        params = {f"operation_{index}": value for index, value in enumerate(operations)}
        spent = (
            await conn.execute(
                text(
                    f"""
                    select coalesce(sum(cost_usd), 0.0)
                    from internal.ai_cost_events
                    where operation in ({placeholders})
                      and created_at >= current_date
                    """
                ),
                params,
            )
        ).scalar()
    if (spent or 0.0) >= budget_usd:
        raise BudgetExceededError(role, budget_usd, float(spent or 0.0))
