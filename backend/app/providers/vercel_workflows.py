"""Vercel Workflows JobQueue adapter — V1 async processing implementation
(SPEC_AMENDMENT_V1.1).

Vercel Workflows provides durable, retryable, push-based job execution. This
adapter starts a workflow run by invoking the internal worker route of the
same Vercel deployment, authenticated with the shared
``WORKER_INTERNAL_TOKEN`` secret (workflow routes have no public ingress
semantics: the token check rejects any external caller).

The queue stays behind the :class:`app.providers.base.JobQueue` protocol, so
a future migration to another vendor (e.g. Cloud Tasks as documented scaling
path) requires only a new adapter — no domain refactor.

Payload contract (unchanged, spec 22): IDs only; no raw media, no secrets.
"""

from __future__ import annotations

import uuid

import httpx

from app.config import Settings
from app.providers.base import JobQueue
from app.providers.mock import InMemoryJobQueue

WORKER_RUN_PATH = "/tasks/run"
INTERNAL_TOKEN_HEADER = "x-internal-token"


class QueueUnavailableError(Exception):
    """Retryable dispatch failure (transient platform/5xx error). The event
    stays QUEUED and the API can re-enqueue (idempotent worker side)."""


class VercelWorkflowsJobQueue(JobQueue):
    """Push-based dispatch to the private worker via Vercel Workflows.

    Durability/retry/backoff are provided by the platform: a non-2xx worker
    response marks the workflow run failed and it is retried according to the
    workflow configuration; the worker handlers are idempotent so duplicate
    delivery is a no-op once the event is terminal (spec 22).
    """

    def __init__(
        self,
        *,
        workflow_base_url: str,
        internal_token: str,
        client: httpx.AsyncClient | None = None,
        timeout_s: float = 10.0,
    ) -> None:
        if not workflow_base_url:
            raise ValueError("workflow_base_url is required for VercelWorkflowsJobQueue")
        self._base = workflow_base_url.rstrip("/")
        self._token = internal_token
        self._client = client or httpx.AsyncClient(timeout=timeout_s)
        self._owns_client = client is None

    async def enqueue(self, *, task_type: str, payload: dict[str, str]) -> str:
        task_id = f"wf-{uuid.uuid4().hex[:12]}"
        response = await self._client.post(
            f"{self._base}{WORKER_RUN_PATH}",
            json={"task_type": task_type, **payload},
            headers={
                INTERNAL_TOKEN_HEADER: self._token,
                "x-idempotency-key": payload.get("event_id", task_id),
                "content-type": "application/json",
            },
        )
        if response.status_code >= 500:
            raise QueueUnavailableError(f"workflow dispatch failed: HTTP {response.status_code}")
        response.raise_for_status()
        return task_id

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()


def build_job_queue(settings: Settings) -> JobQueue:
    """Select the queue implementation from config (SPEC_AMENDMENT_V1.1):
    ``fake`` for local dev/CI, ``vercel_workflows`` for staging/production."""
    if settings.job_queue_backend == "fake":
        return InMemoryJobQueue()
    if settings.job_queue_backend == "vercel_workflows":
        return VercelWorkflowsJobQueue(
            workflow_base_url=settings.workflow_base_url,
            internal_token=settings.worker_internal_token,
        )
    raise ValueError(f"unsupported JOB_QUEUE_BACKEND: {settings.job_queue_backend}")
