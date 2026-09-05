"""Registered Vercel workflows."""

from app.workflow import wf
from app.workflows.analysis import analysis_workflow

__all__ = ["analysis_workflow", "wf"]
