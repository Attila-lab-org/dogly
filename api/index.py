"""Vercel serverless entrypoint shim (infra/vercel/README.md).

Exports the public FastAPI app and mounts the internal worker app
under /tasks so a single Python serverless function can serve both
the public API (spec sez. 9) and the internal workflow routes
(spec sez. 22), matching vercel.json rewrites (/* -> /api/index).
"""

from __future__ import annotations

import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BACKEND = os.path.join(_ROOT, "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.api.app import app  # noqa: E402  (public FastAPI app, spec sez. 9)
from app.worker.main import worker_app  # noqa: E402  (internal worker app, spec sez. 22)

app.mount("/tasks", worker_app)


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    """Lightweight production smoke-check endpoint."""
    return {"service": "dogly", "status": "ok"}


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}
