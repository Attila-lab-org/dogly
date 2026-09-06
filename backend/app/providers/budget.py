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
        spent = (
            await conn.execute(
                text(
                    """
                    select coalesce(sum(cost_usd), 0.0)
                    from internal.ai_cost_events
                    where operation = :operation
                      and created_at >= current_date
                    """
                ),
                {"operation": operation},
            )
        ).scalar()
    if (spent or 0.0) >= budget_usd:
        raise BudgetExceededError(role, budget_usd, float(spent or 0.0))
