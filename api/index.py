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
