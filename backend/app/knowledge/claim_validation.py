"""Scientific validation and governance for general-model reasoning claims.

Validates claim ↔ evidence content, not only that cited IDs exist.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from app.contracts.canine_intelligence import (
    CanineIntelligenceDecision,
    ClaimStrength,
    ClaimValidation,
    ClaimValidationStatus,
    PersonalDogContext,
    ReasoningClaim,
)
from app.knowledge.digestive_registry import get_digestive_knowledge
from app.knowledge.intelligence_v3 import get_intelligence_v3
from app.knowledge.registry import get_registry

_CAUSATION = re.compile(
    r"\b(causa|causato|causata|provoca|provocato|dovuto a|per colpa di|"
    r"per via del cibo|il cibo ha (causato|provocato))\b",
    re.IGNORECASE,
)
_DIAGNOSIS = re.compile(
    r"\b(diagnosi|diagnostic|soffre di|malattia|patologia|"
    r"e' pancreatite|e' giardia|ha un tumore)\b",
    re.IGNORECASE,
)
_CERTAINTY = re.compile(
    r"\b(certamente|sicuramente|senza dubbio|e' sicuro che|deve essere)\b",
    re.IGNORECASE,
)
_TOKEN = re.compile(r"[a-zA-ZÀ-ÿ0-9']{3,}")
_STOP = frozenset(
    {
        "che",
        "non",
        "una",
        "uno",
        "dei",
        "del",
        "della",
        "delle",
        "per",
        "con",
        "come",
        "anche",
        "solo",
        "piu",
        "più",
        "the",
        "and",
        "for",
        "with",
        "from",
        "this",
        "that",
        "cane",
        "dog",
    }
)
_MIN_SEMANTIC_OVERLAP = 0.12


def known_scientific_ids() -> set[str]:
    return set(_scientific_records())


@lru_cache(maxsize=1)
def _scientific_records() -> dict[str, str]:
    """Map registry IDs to searchable text used for semantic support checks."""
    records: dict[str, str] = {}
    registry = get_registry()
    for card in registry.base_knowledge_cards:
        records[card.id] = " ".join(
            [
                card.id,
                card.label or "",
                card.observable or "",
                card.not_conclude or "",
                " ".join(card.compatible or []),
                " ".join(card.modifiers or []),
                card.evidence or "",
            ]
        )
    for entry in registry.advice_catalog:
        records[entry.code] = " ".join(
            [
                entry.code,
                entry.category or "",
                entry.action or "",
                entry.follow_up or "",
                " ".join(entry.applies_to_intents or []),
            ]
        )
    digestive = get_digestive_knowledge()
    for claim in digestive.claims:
        records[claim.id] = " ".join(
            [
                claim.id,
                claim.statement or "",
                claim.forbidden or "",
                claim.trigger or "",
                claim.output or "",
                claim.group or "",
            ]
        )
    for source in digestive.sources:
        records[source.id] = f"{source.id} {getattr(source, 'citation', '')}"
    v3 = get_intelligence_v3()
    for claim in v3.claims:
        records[claim.id] = " ".join(
            [
                claim.id,
                claim.statement or "",
                claim.forbidden or "",
                claim.domain or "",
                " ".join(claim.applies_when or []),
            ]
        )
    for source in v3.sources:
        records[source.id] = f"{source.id} {getattr(source, 'citation', '')}"
    return records


def _tokens(text: str) -> set[str]:
    return {
        token.lower()
        for token in _TOKEN.findall(text or "")
        if token.lower() not in _STOP
    }


def semantic_overlap(claim_text: str, evidence_text: str) -> float:
    left = _tokens(claim_text)
    right = _tokens(evidence_text)
    if not left or not right:
        return 0.0
    return len(left & right) / len(left)


def _rank(value: ClaimStrength) -> int:
    return {"HEDGED": 0, "MODERATE": 1, "STRONG": 2}[value]


def _min_strength(a: ClaimStrength, b: ClaimStrength) -> ClaimStrength:
    return a if _rank(a) <= _rank(b) else b


def _personal_evidence_text(
    personal: PersonalDogContext | None,
    source_id: str,
) -> str:
    if personal is None:
        return ""
    chunks: list[str] = []
    for item in personal.evidence:
        if item.source_id == source_id or item.evidence_id == source_id:
            chunks.append(item.summary)
            chunks.extend(str(value) for value in item.data.values() if value)
    for fact in personal.personal_facts:
        if fact.source_id == source_id:
            chunks.append(str(fact.value))
    for pattern in personal.eligible_patterns:
        if (
            pattern.pattern_id == source_id
            or f"pattern:{pattern.pattern_id}" == source_id
        ):
            chunks.append(pattern.title)
            chunks.append(pattern.support_summary)
    return " ".join(chunks)


def validate_claim(
    claim: ReasoningClaim,
    *,
    personal: PersonalDogContext | None = None,
    context_ids: set[str] | None = None,
    scientific_ids: set[str] | None = None,
    safety_blocked: bool = False,
) -> ClaimValidation:
    reasons: list[str] = []
    matched: list[str] = []
    status: ClaimValidationStatus = "HYPOTHESIS"
    strength: ClaimStrength = claim.strength
    records = _scientific_records()
    known = scientific_ids if scientific_ids is not None else set(records)

    if safety_blocked:
        return ClaimValidation(
            claim_id=claim.claim_id,
            status="BLOCKED_BY_SAFETY",
            reasons=["Deterministic safety interrupt precedes free reasoning."],
            owner_facing_strength="HEDGED",
        )

    if context_ids is None:
        context_ids = personal.evidence_ids() if personal is not None else set()

    semantically_supported = False
    for card_id in claim.scientific_card_ids:
        if card_id not in known:
            reasons.append(f"Unknown scientific id: {card_id}")
            continue
        evidence_text = records.get(card_id, "")
        overlap = semantic_overlap(claim.statement, evidence_text)
        if overlap >= _MIN_SEMANTIC_OVERLAP:
            matched.append(card_id)
            semantically_supported = True
        else:
            reasons.append(
                f"Scientific id {card_id} exists but does not semantically "
                "support this claim."
            )

    missing_sources = [
        source_id for source_id in claim.source_ids if source_id not in context_ids
    ]
    if missing_sources:
        reasons.append(
            "Cited personal/observational sources are not in the dog context: "
            + ", ".join(missing_sources[:4])
        )
        status = "CONTRADICTED"
        strength = "HEDGED"

    personal_supported = False
    if not missing_sources and claim.source_ids:
        for source_id in claim.source_ids:
            evidence_text = _personal_evidence_text(personal, source_id)
            if not evidence_text:
                # ID exists in context_ids but we lack text; allow weak support.
                personal_supported = True
                continue
            if semantic_overlap(claim.statement, evidence_text) >= _MIN_SEMANTIC_OVERLAP:
                personal_supported = True
            else:
                reasons.append(
                    f"Personal source {source_id} is present but does not "
                    "support the claim content."
                )

    if claim.asserts_diagnosis or _DIAGNOSIS.search(claim.statement):
        reasons.append("Diagnosis language is not allowed without clinical authority.")
        return ClaimValidation(
            claim_id=claim.claim_id,
            status="BLOCKED_BY_SAFETY",
            reasons=reasons,
            matched_scientific_ids=matched,
            owner_facing_strength="HEDGED",
        )

    if claim.asserts_causation or _CAUSATION.search(claim.statement):
        reasons.append(
            "Temporal association is allowed; causation requires stronger support."
        )
        strength = _min_strength(strength, "HEDGED")
        if claim.basis in {"CURRENT_OBSERVATION", "OWNER_REPORTED"} and not semantically_supported:
            status = "HYPOTHESIS"

    if _CERTAINTY.search(claim.statement) and (
        claim.basis == "GENERAL_MODEL" or not semantically_supported
    ):
        reasons.append("Certainty without scientific support was downgraded.")
        strength = "HEDGED"
        if status == "SUPPORTED":
            status = "HYPOTHESIS"

    if claim.basis == "SCIENTIFIC_EVIDENCE":
        if semantically_supported and not missing_sources:
            status = "SUPPORTED"
            reasons.append("Claim is semantically backed by cited scientific evidence.")
        elif claim.scientific_card_ids and not matched:
            status = "CONTRADICTED"
            strength = "HEDGED"
            reasons.append(
                "Cited scientific IDs do not support the claim content."
            )
        else:
            reasons.append(
                "Scientific basis claimed without resolvable registry support; "
                "kept as prudent hypothesis."
            )
            status = "HYPOTHESIS"
            strength = "HEDGED"
    elif claim.basis in {"CURRENT_OBSERVATION", "PERSONAL_KNOWLEDGE", "OWNER_REPORTED"}:
        if missing_sources:
            status = "CONTRADICTED"
            strength = "HEDGED"
        elif claim.source_ids and personal_supported:
            status = "SUPPORTED"
            reasons.append(
                "Claim is grounded in personal/observational evidence content."
            )
            strength = _min_strength(strength, "MODERATE")
        elif claim.source_ids and not personal_supported:
            status = "HYPOTHESIS"
            strength = "HEDGED"
            reasons.append(
                "Personal sources were cited but do not clearly support the claim."
            )
        else:
            status = "HYPOTHESIS"
            strength = "HEDGED"
            reasons.append("Personal/observational claim without cited source IDs.")
    elif claim.basis == "GENERAL_MODEL":
        if semantically_supported:
            status = "SUPPORTED"
            reasons.append("General reasoning is backed by relevant registry evidence.")
        else:
            status = "HYPOTHESIS"
            strength = "HEDGED"
            reasons.append(
                "Uncovered general hypothesis allowed only as a prudent possibility."
            )

    if status == "SUPPORTED" and strength == "STRONG" and not semantically_supported:
        strength = "MODERATE"
        reasons.append("Strong wording without semantic scientific support was moderated.")

    return ClaimValidation(
        claim_id=claim.claim_id,
        status=status,
        reasons=reasons,
        matched_scientific_ids=matched,
        owner_facing_strength=strength,
    )


def validate_claims(
    claims: list[ReasoningClaim],
    *,
    personal: PersonalDogContext | None = None,
    context_ids: set[str] | None = None,
    safety_blocked: bool = False,
) -> CanineIntelligenceDecision:
    scientific_ids = known_scientific_ids()
    validations = [
        validate_claim(
            claim,
            personal=personal,
            context_ids=context_ids,
            scientific_ids=scientific_ids,
            safety_blocked=safety_blocked,
        )
        for claim in claims
    ]
    blocked = any(item.status == "BLOCKED_BY_SAFETY" for item in validations)
    downgraded = False
    for item in validations:
        original = next(
            (claim.strength for claim in claims if claim.claim_id == item.claim_id),
            item.owner_facing_strength,
        )
        if (
            original != item.owner_facing_strength
            or item.status in {"HYPOTHESIS", "CONTRADICTED"}
        ):
            downgraded = True
            break
    notes: list[str] = []
    if blocked:
        notes.append("One or more claims were blocked by safety governance.")
    if any(item.status == "CONTRADICTED" for item in validations):
        notes.append(
            "Claims were contradicted by missing or non-supporting evidence."
        )
    if any(
        item.status == "HYPOTHESIS" and not item.matched_scientific_ids
        for item in validations
    ):
        notes.append("Uncovered hypotheses remain hedged possibilities only.")
    return CanineIntelligenceDecision(
        claims=claims,
        validations=validations,
        blocked=blocked,
        downgraded=downgraded,
        notes=notes,
    )


def extract_claims_from_provider_payload(
    raw: dict[str, Any] | None,
) -> list[ReasoningClaim]:
    if not isinstance(raw, dict):
        return []
    payload = raw.get("claims")
    if not isinstance(payload, list):
        return []
    claims: list[ReasoningClaim] = []
    for index, item in enumerate(payload[:8]):
        if not isinstance(item, dict):
            continue
        statement = item.get("statement") or item.get("text")
        if not isinstance(statement, str) or not statement.strip():
            continue
        basis = item.get("basis")
        if basis not in {
            "GENERAL_MODEL",
            "SCIENTIFIC_EVIDENCE",
            "CURRENT_OBSERVATION",
            "OWNER_REPORTED",
            "PERSONAL_KNOWLEDGE",
        }:
            basis = "GENERAL_MODEL"
        strength = item.get("strength")
        if strength not in {"HEDGED", "MODERATE", "STRONG"}:
            strength = "HEDGED"
        try:
            claims.append(
                ReasoningClaim(
                    claim_id=str(item.get("claim_id") or f"claim-{index + 1}"),
                    statement=statement.strip(),
                    basis=basis,
                    strength=strength,
                    source_ids=[
                        str(value) for value in item.get("source_ids", []) if value
                    ][:12],
                    scientific_card_ids=[
                        str(value)
                        for value in item.get("scientific_card_ids", [])
                        if value
                    ][:8],
                    asserts_causation=bool(item.get("asserts_causation", False)),
                    asserts_diagnosis=bool(item.get("asserts_diagnosis", False)),
                )
            )
        except Exception:
            continue
    return claims


def infer_claims_from_answer(
    assistant_text: str,
    *,
    used_source_ids: list[str],
) -> list[ReasoningClaim]:
    if not assistant_text.strip():
        return []
    strength: ClaimStrength = (
        "STRONG" if _CERTAINTY.search(assistant_text) else "HEDGED"
    )
    return [
        ReasoningClaim(
            claim_id="answer-1",
            statement=assistant_text.strip()[:280],
            basis="CURRENT_OBSERVATION" if used_source_ids else "GENERAL_MODEL",
            strength=strength,
            source_ids=list(used_source_ids)[:12],
            asserts_causation=bool(_CAUSATION.search(assistant_text)),
            asserts_diagnosis=bool(_DIAGNOSIS.search(assistant_text)),
        )
    ]


def govern_assistant_text(
    assistant_text: str,
    decision: CanineIntelligenceDecision,
) -> tuple[str, bool]:
    if decision.blocked:
        return (
            "Su questo punto e' piu' prudente non andare oltre senza un parere "
            "professionale. Se noti peggioramento, contatta il veterinario.",
            True,
        )
    text = assistant_text
    downgraded = decision.downgraded
    if any(item.status == "CONTRADICTED" for item in decision.validations):
        text = (
            "Non ho un dato personale sufficiente per confermare quel collegamento. "
            + text
        )
        downgraded = True
    if any(item.status == "HYPOTHESIS" for item in decision.validations) and _CERTAINTY.search(
        text
    ):
        text = re.sub(
            r"\b(certamente|sicuramente|senza dubbio)\b",
            "possibilmente",
            text,
            flags=re.IGNORECASE,
        )
        downgraded = True
    if any(item.status == "HYPOTHESIS" for item in decision.validations) and _CAUSATION.search(
        text
    ):
        text = (
            text
            + " Resta un'associazione temporale possibile, non una causa dimostrata."
        )
        downgraded = True
    return text, downgraded
