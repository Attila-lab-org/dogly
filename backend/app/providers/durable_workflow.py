"""Durable analysis workflow steps (Vercel Workflows Python SDK ready).

V1 ships a DB-backed step runner invoked by /tasks/run. Each step is
idempotent and persists progress so retries after cold start are safe.
When the Vercel Workflows Python SDK is available in the deployment image,
`run_behavior_workflow` can be wrapped with `@workflow` / `@step` decorators
without changing domain logic.
"""

from __future__ import annotations

from typing import Any

from app.api.deps import AppState
from app.worker import handlers


async def run_behavior_workflow(state: AppState, *, event_id: str) -> dict[str, Any]:
    """Single durable entry: observe → interpret → persist → quota finalize."""
    return await handlers.process_behavior_event(state, event_id=event_id)


async def run_digestive_workflow(state: AppState, *, event_id: str) -> dict[str, Any]:
    return await handlers.process_digestive_event(state, event_id=event_id)
