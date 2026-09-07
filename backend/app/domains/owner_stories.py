"""Owner-reported observations: bounded extraction and explicit confirmation."""

from __future__ import annotations

import re

from app.contracts.api import OwnerReportedFact
from app.domains.repository import new_id


def _category(statement: str) -> str:
    text = statement.lower()
    if any(word in text for word in ("mangia", "cibo", "crocchette", "snack")):
        return "DIET"
    if any(word in text for word in ("vomit", "dolore", "feci", "zopp", "farmac")):
        return "HEALTH"
    if any(word in text for word in ("dorme", "passegg", "mattina", "sera", "routine")):
        return "ROUTINE"
    if any(word in text for word in ("ama", "prefer", "piace", "odia")):
        return "PREFERENCE"
    return "GENERAL"


def extract_owner_reported_facts(text: str) -> list[OwnerReportedFact]:
    """Split only explicit owner statements; never infer causes or patterns."""
    normalized = " ".join(text.strip().split())
    sentences = [
        item.strip(" -")
        for item in re.split(r"(?<=[.!?])\s+|\n+", normalized)
        if item.strip(" -")
    ][:8]
    if not sentences:
        sentences = [normalized]
    return [
        OwnerReportedFact(
            id=new_id(),
            category=_category(statement),
            statement=statement[:280],
        )
        for statement in sentences
    ]
