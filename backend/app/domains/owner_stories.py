"""Owner-reported observations: bounded extraction and explicit confirmation."""

from __future__ import annotations

import re

from app.contracts.api import OwnerReportedFact
from app.domains.repository import new_id


def _category(statement: str) -> str:
    text = statement.lower()
    if any(
        word in text
        for word in (
            "vomit",
            "rigurgit",
            "dolore",
            "feci",
            "diarrea",
            "zopp",
            "farmac",
            "prurito",
            "tosse",
            "febbre",
        )
    ):
        return "HEALTH"
    if any(word in text for word in ("mangia", "cibo", "crocchette", "snack")):
        return "DIET"
    if any(word in text for word in ("dorme", "passegg", "mattina", "sera", "routine")):
        return "ROUTINE"
    if any(word in text for word in ("ama", "prefer", "piace", "odia")):
        return "PREFERENCE"
    return "GENERAL"


def is_useful_owner_statement(statement: str) -> bool:
    """Reject greetings and questions that do not describe the dog."""
    text = re.sub(r"\s+", " ", statement).strip()
    lowered = text.casefold()
    if len(re.findall(r"[a-zà-ÿ]+", lowered)) < 2 or text.endswith("?"):
        return False
    return not any(
        re.fullmatch(pattern, lowered.rstrip(".!"))
        for pattern in (
            r"(ciao|salve|buongiorno|buonasera)( a tutti)?",
            r"(tutto bene|come va|come stai|grazie|va bene)",
            r"(ciao[, ]+)?tutto bene.*",
            r"(ciao[, ]+)?come (va|stai|sta andando).*",
        )
    )


def extract_owner_reported_facts(text: str) -> list[OwnerReportedFact]:
    """Split only explicit owner statements; never infer causes or patterns."""
    normalized = "\n".join(
        re.sub(r"[^\S\n]+", " ", line).strip()
        for line in text.strip().splitlines()
        if line.strip()
    )
    sentences = [
        item.strip(" -")
        for item in re.split(r"(?<=[.!?])\s+|\n+", normalized)
        if item.strip(" -") and is_useful_owner_statement(item.strip(" -"))
    ][:8]
    if not sentences and is_useful_owner_statement(normalized):
        sentences = [normalized]
    return [
        OwnerReportedFact(
            id=new_id(),
            category=_category(statement),
            statement=statement[:280],
        )
        for statement in sentences
    ]
