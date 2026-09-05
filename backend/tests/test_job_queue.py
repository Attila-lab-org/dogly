"""Vercel Workflow queue, fake queue and dependency guard tests."""

import re
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.config import Settings
from app.providers.mock import InMemoryJobQueue
from app.providers.vercel_workflows import VercelWorkflowsJobQueue, build_job_queue


def test_factory_selects_fake_for_local():
    q = build_job_queue(Settings(job_queue_backend="fake"))
    assert isinstance(q, InMemoryJobQueue)


def test_factory_selects_vercel_workflows():
    q = build_job_queue(
        Settings(
            job_queue_backend="vercel_workflows",
        )
    )
    assert isinstance(q, VercelWorkflowsJobQueue)


def test_factory_rejects_unknown_backend():
    with pytest.raises(ValueError):
        build_job_queue(Settings(job_queue_backend="cloud_tasks"))  # not a V1 backend


async def test_vercel_queue_starts_managed_workflow_with_ids_only():
    run = type("Run", (), {"run_id": "wfr_test"})()
    with patch("vercel.workflow.start", new=AsyncMock(return_value=run)) as start:
        q = VercelWorkflowsJobQueue()
        task_id = await q.enqueue(
            task_type="behavior_analysis",
            payload={"event_id": "evt-1", "capture_id": "cap-1", "user_id": "u-1"},
        )
    assert task_id == "wfr_test"
    assert start.await_args.kwargs == {
        "task_type": "behavior_analysis",
        "event_id": "evt-1",
    }


async def test_vercel_queue_requires_event_id():
    with pytest.raises(ValueError):
        await VercelWorkflowsJobQueue().enqueue(
            task_type="behavior_analysis",
            payload={},
        )


def test_no_gcp_dependencies_declared():
    """SPEC_AMENDMENT_V1.1: nessuna dipendenza GCP nel codice V1."""
    pyproject = (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text()
    assert not re.search(r"google-cloud|googleapis|gcloud", pyproject, re.IGNORECASE)
