"""JobQueue adapter tests (SPEC_AMENDMENT_V1.1): Vercel Workflows dispatch,
fake queue, factory selection, and the no-GCP-dependency guard."""

import re
from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.providers.mock import InMemoryJobQueue
from app.providers.vercel_workflows import (
    QueueUnavailableError,
    VercelWorkflowsJobQueue,
    build_job_queue,
)


def test_factory_selects_fake_for_local():
    q = build_job_queue(Settings(job_queue_backend="fake"))
    assert isinstance(q, InMemoryJobQueue)


def test_factory_selects_vercel_workflows():
    q = build_job_queue(
        Settings(
            job_queue_backend="vercel_workflows",
            workflow_base_url="https://deploy.vercel.app",
            worker_internal_token="secret",
        )
    )
    assert isinstance(q, VercelWorkflowsJobQueue)


def test_factory_rejects_unknown_backend():
    with pytest.raises(ValueError):
        build_job_queue(Settings(job_queue_backend="cloud_tasks"))  # not a V1 backend


def test_vercel_queue_requires_base_url():
    with pytest.raises(ValueError):
        VercelWorkflowsJobQueue(workflow_base_url="", internal_token="t")


async def test_vercel_queue_posts_ids_only_with_internal_auth():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["token"] = request.headers.get("x-internal-token")
        seen["body"] = request.content.decode()
        return httpx.Response(200, json={"status": "ok"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        q = VercelWorkflowsJobQueue(
            workflow_base_url="https://deploy.vercel.app/",
            internal_token="topsecret",
            client=client,
        )
        task_id = await q.enqueue(
            task_type="behavior_analysis",
            payload={"event_id": "evt-1", "capture_id": "cap-1", "user_id": "u-1"},
        )
    assert task_id.startswith("wf-")
    assert seen["url"] == "https://deploy.vercel.app/tasks/run"
    assert seen["token"] == "topsecret"
    # Payload contract (spec 22): IDs only — no media bytes, no secrets.
    assert "evt-1" in seen["body"] and "topsecret" not in seen["body"]


async def test_vercel_queue_5xx_is_retryable_dispatch_failure():
    transport = httpx.MockTransport(lambda req: httpx.Response(503))
    async with httpx.AsyncClient(transport=transport) as client:
        q = VercelWorkflowsJobQueue(
            workflow_base_url="https://deploy.vercel.app", internal_token="t", client=client
        )
        with pytest.raises(QueueUnavailableError):
            await q.enqueue(task_type="behavior_analysis", payload={"event_id": "e"})


def test_no_gcp_dependencies_declared():
    """SPEC_AMENDMENT_V1.1: nessuna dipendenza GCP nel codice V1."""
    pyproject = (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text()
    assert not re.search(r"google-cloud|googleapis|gcloud", pyproject, re.IGNORECASE)
