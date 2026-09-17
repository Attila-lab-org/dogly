"""Versioned Intelligence V3 claims. Repo JSON is the source of truth."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DATA_PATH = Path(__file__).parent / "data" / "dogly_intelligence_v3.json"
EXPECTED_VERSION = "3.0"


class IntelligenceSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    citation: str
    url: str
    license: str
    commercial_use: str
    use: str


class IntelligenceClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    domain: Literal["behavior", "digestive", "nutrition", "population"]
    statement: str
    forbidden: str
    applies_when: list[str] = Field(default_factory=list)
    evidence_grade: Literal["A", "B", "C"]
    source_ids: list[str]


class IntelligenceV3Document(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    sources: list[IntelligenceSource]
    claims: list[IntelligenceClaim]

    def claim_map(self) -> dict[str, IntelligenceClaim]:
        return {claim.id: claim for claim in self.claims}


class ClaimSummary(BaseModel):
    claim_id: str
    statement: str
    forbidden: str
    evidence_grade: str
    source_ids: list[str]


@lru_cache(maxsize=1)
def get_intelligence_v3() -> IntelligenceV3Document:
    with DATA_PATH.open(encoding="utf-8") as handle:
        document = IntelligenceV3Document.model_validate(json.load(handle))
    if document.version != EXPECTED_VERSION:
        raise ValueError(f"Unsupported intelligence V3 version: {document.version!r}")
    source_ids = {source.id for source in document.sources}
    claim_ids = [claim.id for claim in document.claims]
    if len(claim_ids) != len(set(claim_ids)):
        raise ValueError("duplicate intelligence claim id")
    for claim in document.claims:
        unknown = set(claim.source_ids) - source_ids
        if unknown:
            raise ValueError(f"{claim.id}: unknown sources {unknown}")
    return document


def select_claims(
    *,
    domain: str,
    flags: dict[str, bool],
    extra_when: list[str] | None = None,
    limit: int = 3,
) -> list[ClaimSummary]:
    document = get_intelligence_v3()
    active = {"always", domain, *(extra_when or [])}
    active.update(name for name, enabled in flags.items() if enabled)
    selected: list[ClaimSummary] = []
    for claim in document.claims:
        if not set(claim.applies_when) & active:
            continue
        if (
            claim.domain == "population"
            and "always" not in claim.applies_when
            and not flags.get("breed_intelligence_v1")
        ):
            continue
        selected.append(
            ClaimSummary(
                claim_id=claim.id,
                statement=claim.statement,
                forbidden=claim.forbidden,
                evidence_grade=claim.evidence_grade,
                source_ids=claim.source_ids,
            )
        )
        if len(selected) >= limit:
            break
    return selected


def document_checksum() -> str:
    payload = json.dumps(
        json.loads(DATA_PATH.read_text(encoding="utf-8")),
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    import hashlib

    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def export_document() -> dict[str, Any]:
    return get_intelligence_v3().model_dump(mode="json")
