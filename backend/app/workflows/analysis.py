"""Durable analysis workflows executed by Vercel."""

from __future__ import annotations

from typing import Any

from app.workflow import wf


@wf.step(max_retries=5)
async def process_analysis_step(*, task_type: str, event_id: str | None = None) -> dict[str, Any]:
    # Imports stay inside the step to avoid a provider-factory import cycle.
    from app.api.deps import build_default_state
    from app.worker import handlers

    state = build_default_state()
    if task_type == "media_retention_cleanup":
        return await handlers.process_media_retention_cleanup(state, event_id=event_id)
    if not event_id:
        raise ValueError(f"event_id is required for workflow task type: {task_type}")
    if task_type == "behavior_analysis":
        return await handlers.process_behavior_event(state, event_id=event_id)
    if task_type == "digestive_analysis":
        return await handlers.process_digestive_event(state, event_id=event_id)
    if task_type == "privacy_export":
        return await handlers.process_privacy_export(state, event_id=event_id)
    if task_type == "account_deletion":
        return await handlers.process_account_deletion(state, event_id=event_id)
    raise ValueError(f"Unsupported workflow task type: {task_type}")


@wf.workflow
async def analysis_workflow(*, task_type: str, event_id: str | None = None) -> dict[str, Any]:
    return await process_analysis_step(task_type=task_type, event_id=event_id)
