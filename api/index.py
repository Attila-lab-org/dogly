"""Vercel serverless entrypoint shim (infra/vercel/README.md).

Exports the public FastAPI app and mounts the internal worker app
under /tasks so a single Python serverless function can serve both
the public API (spec sez. 9) and the internal workflow routes
(spec sez. 22), matching vercel.json rewrites (/* -> /api/index).
"""

from __future__ import annotations

import os
import sys

from sqlalchemy import text

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BACKEND = os.path.join(_ROOT, "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.api.app import app  # noqa: E402  (public FastAPI app, spec sez. 9)
from app.worker.main import worker_app  # noqa: E402  (internal worker app, spec sez. 22)


@app.post("/ops/recover-a2e77c41", include_in_schema=False)
async def recover_stuck_behavior_runs() -> dict[str, list[str]]:
    """One-shot retry after enabling Gemini API in Google Cloud."""
    from vercel import workflow

    from app.workflows.analysis import analysis_workflow

    run_ids: list[str] = []
    for event_id in (
        "f541c8db-1358-44c4-ab2d-236f6365701a",
        "1172e328-8f29-483c-b4fa-4ace04e644cf",
    ):
        run = await workflow.start(
            analysis_workflow,
            task_type="behavior_analysis",
            event_id=event_id,
        )
        run_ids.append(run.run_id)
    return {"run_ids": run_ids}


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    """Lightweight production smoke-check endpoint."""
    return {"service": "dogly", "status": "ok"}


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", include_in_schema=False)
async def ready() -> dict[str, str]:
    """Verify that the production process can reach its database."""
    state = app.state.cbi
    if state.engine is None:
        raise RuntimeError("Database is not configured")
    async with state.engine.connect() as connection:
        await connection.execute(text("select 1"))
    return {"status": "ok", "database": "connected"}


# The worker app already declares /tasks/run. Mounting it at /tasks would
# accidentally expose /tasks/tasks/run.
app.mount("/", worker_app)
