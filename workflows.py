"""Root Vercel Workflow registry entrypoint."""

from __future__ import annotations

import os
import sys

_BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.workflows import analysis_workflow, wf  # noqa: E402

__all__ = ["analysis_workflow", "wf"]
