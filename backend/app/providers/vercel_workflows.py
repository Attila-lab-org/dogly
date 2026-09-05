"""Durable Vercel Workflow implementation of the JobQueue protocol."""

from __future__ import annotations

from app.config import Settings
from app.providers.base import JobQueue
from app.providers.mock import InMemoryJobQueue


class VercelWorkflowsJobQueue(JobQueue):
    """Starts managed, replayable workflow runs; payloads contain IDs only."""

    async def enqueue(self, *, task_type: str, payload: dict[str, str]) -> str:
        event_id = payload.get("event_id")
        if not event_id:
            raise ValueError("event_id is required for durable analysis workflows")

        from vercel import workflow

        from app.workflows.analysis import analysis_workflow

        run = await workflow.start(
            analysis_workflow,
            task_type=task_type,
            event_id=event_id,
        )
        return run.run_id


def build_job_queue(settings: Settings) -> JobQueue:
    """Select the queue implementation from config (SPEC_AMENDMENT_V1.1):
    ``fake`` for local dev/CI, ``vercel_workflows`` for staging/production."""
    if settings.job_queue_backend == "fake":
        return InMemoryJobQueue()
    if settings.job_queue_backend == "vercel_workflows":
        return VercelWorkflowsJobQueue()
    raise ValueError(f"unsupported JOB_QUEUE_BACKEND: {settings.job_queue_backend}")
