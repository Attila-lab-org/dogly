"""Tests for scientific claim validation governance."""

from __future__ import annotations

from app.contracts.canine_intelligence import ReasoningClaim
from app.knowledge.claim_validation import (
    _scientific_records,
    _tokens,
    govern_assistant_text,
    known_scientific_ids,
    semantic_overlap,
    validate_claim,
    validate_claims,
)


def test_uncovered_hypothesis_stays_hedged() -> None:
    claim = ReasoningClaim(
        claim_id="c1",
        statement="Forse il cambio dieta ha un ruolo, ma non e' certo.",
        basis="GENERAL_MODEL",
        strength="MODERATE",
    )
    result = validate_claim(claim)
    assert result.status == "HYPOTHESIS"
    assert result.owner_facing_strength == "HEDGED"


def test_unknown_personal_source_is_contradicted() -> None:
    claim = ReasoningClaim(
        claim_id="c2",
        statement="Secondo l'ultima analisi digestiva e' colpa del cibo.",
        basis="CURRENT_OBSERVATION",
        strength="STRONG",
        source_ids=["missing-event"],
        asserts_causation=True,
    )
    result = validate_claim(claim, context_ids={"other-event"})
    assert result.status == "CONTRADICTED"
    assert result.owner_facing_strength == "HEDGED"


def test_diagnosis_is_blocked_by_safety() -> None:
    claim = ReasoningClaim(
        claim_id="c3",
        statement="Ha sicuramente la giardia.",
        basis="GENERAL_MODEL",
        strength="STRONG",
        asserts_diagnosis=True,
    )
    result = validate_claim(claim)
    assert result.status == "BLOCKED_BY_SAFETY"


def test_known_scientific_id_supports_only_when_content_matches() -> None:
    records = _scientific_records()
    assert records
    card_id = next(iter(records))
    evidence_tokens = sorted(_tokens(records[card_id]))
    assert evidence_tokens
    statement = " ".join(evidence_tokens[:8])
    claim = ReasoningClaim(
        claim_id="c4",
        statement=statement,
        basis="SCIENTIFIC_EVIDENCE",
        strength="MODERATE",
        scientific_card_ids=[card_id],
    )
    result = validate_claim(claim)
    assert result.status == "SUPPORTED"
    assert card_id in result.matched_scientific_ids
    assert semantic_overlap(statement, records[card_id]) >= 0.12


def test_irrelevant_scientific_id_is_contradicted() -> None:
    sci = known_scientific_ids()
    assert sci
    card_id = next(iter(sci))
    claim = ReasoningClaim(
        claim_id="c4b",
        statement=(
            "Rocky vuole uscire a fare la passeggiata e aspetta vicino alla porta."
        ),
        basis="SCIENTIFIC_EVIDENCE",
        strength="STRONG",
        scientific_card_ids=[card_id],
    )
    result = validate_claim(claim)
    assert result.status == "CONTRADICTED"
    assert card_id not in result.matched_scientific_ids
    assert any("support" in reason.lower() for reason in result.reasons)


def test_govern_text_downgrades_certainty_and_causation() -> None:
    claim = ReasoningClaim(
        claim_id="c5",
        statement="Il cibo ha sicuramente causato la diarrea.",
        basis="GENERAL_MODEL",
        strength="STRONG",
        asserts_causation=True,
    )
    decision = validate_claims([claim])
    text, downgraded = govern_assistant_text(
        "Il cibo ha sicuramente causato la diarrea.",
        decision,
    )
    assert downgraded
    assert "possibilmente" in text.lower() or "associazione temporale" in text.lower()
