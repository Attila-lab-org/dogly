"""Owner-reported observations: bounded extraction and explicit confirmation."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.contracts.api import OwnerReportedFact
from app.domains.repository import new_id


def normalized_statement(value: str) -> str:
    """Exact-content deduplication, never semantic merging of different facts."""
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split()).rstrip(".! ")


def clean_owner_stories(stories: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Clean the read projection; retain original records for owner edits/deletion.

    Newest confirmed duplicate wins, with its source id. Different statements
    (including negation/corrections) remain distinct and dated.
    """
    import json

    seen: set[str] = set()
    cleaned = []
    for story in sorted(stories, key=lambda row: str(row.get("confirmed_at") or ""), reverse=True):
        raw = story.get("facts") or story.get("facts_json") or []
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except (ValueError, TypeError):
                continue
        if not isinstance(raw, list):
            continue
        facts = []
        for fact in raw:
            if not isinstance(fact, dict) or not isinstance(fact.get("statement"), str):
                continue
            statement = " ".join(fact["statement"].split())
            fingerprint = normalized_statement(statement)
            if not is_useful_owner_statement(statement) or fingerprint in seen:
                continue
            seen.add(fingerprint)
            facts.append({**fact, "statement": statement})
        if facts:
            cleaned.append({**story, "facts": facts})
    return cleaned


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
            "amput",
            "allergic",
            "intolleran",
            "ciec",
            "sord",
            "disabil",
            "non può",
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
    if normalized_statement(text) in {"n/a", "non disponibile", "non specificato", "unknown", "null", "undefined"}:
        return False
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
