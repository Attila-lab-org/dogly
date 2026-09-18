"""Dedicated Digestive Knowledge Registry V1.

Repo JSON is the source of truth. Retrieval is deterministic and returns
audit cards/source IDs; it never writes diagnosis text onto the consumer UI.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DATA_PATH = Path(__file__).parent / "data" / "digestive_knowledge_v1.json"
EXPECTED_VERSION = "digestive-knowledge/v1"
ACTIVE_STATUS = "active_v1"
GUIDANCE_ONLY_STATUS = "guidance_only"

SOURCE_PUBLISHERS = {
    "PURINA_FECAL_CHART_7": "Purina Institute",
    "CAVETT_2021_JSAP": "Journal of Small Animal Practice",
    "CHAUVEL_2025_PHOTO": "Preventive Veterinary Medicine",
    "VCA_DIARRHEA_CONTEXT": "VCA Animal Hospitals",
    "MERCK_DIGESTIVE_DOGS": "Merck Veterinary Manual",
    "MERCK_WHEN_VET": "Merck Veterinary Manual",
    "CORNELL_DIARRHEA": "Cornell University College of Veterinary Medicine",
    "ACVS_FOREIGN_BODY": "American College of Veterinary Surgeons",
    "WSAVA_NUTRITION_2011": "World Small Animal Veterinary Association",
    "AAHA_NUTRITION_2021": "American Animal Hospital Association",
    "AAHA_FEEDING_PLAN_2021": "American Animal Hospital Association",
    "WERNER_2020_CADS": "Journal of Veterinary Internal Medicine",
}

SOURCE_TITLES = {
    "PURINA_FECAL_CHART_7": "Purina Fecal Scoring Chart (7-point scale)",
    "CAVETT_2021_JSAP": (
        "Consistency of faecal scoring using two canine faecal scoring systems"
    ),
    "CHAUVEL_2025_PHOTO": "Validation of photographic fecal scoring in puppies",
    "VCA_DIARRHEA_CONTEXT": "Diarrhea Questionnaire and Checklist for Dogs",
    "MERCK_DIGESTIVE_DOGS": "Introduction to Digestive Disorders of Dogs",
    "MERCK_WHEN_VET": "When to See a Veterinarian",
    "CORNELL_DIARRHEA": "Diarrhea",
    "ACVS_FOREIGN_BODY": "Gastrointestinal Foreign Bodies",
    "WSAVA_NUTRITION_2011": "WSAVA Nutritional Assessment Guidelines",
    "AAHA_NUTRITION_2021": (
        "2021 AAHA Nutrition and Weight Management Guidelines for Dogs and Cats"
    ),
    "AAHA_FEEDING_PLAN_2021": (
        "Feeding Plans for Healthy, Appropriate Weight Cats and Dogs"
    ),
    "WERNER_2020_CADS": (
        "Effect of amoxicillin-clavulanic acid on clinical scores in acute diarrhea"
    ),
}


class DigestiveKnowledgeSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    citation: str
    url: str
    use: str
    limitation: str


class DigestiveKnowledgeClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    group: str
    statement: str
    trigger: str
    output: str
    forbidden: str
    evidence_grade: Literal["A", "B", "C"]
    source_ids: list[str]
    current_fields: list[str] = Field(default_factory=list)
    status: Literal["active_v1", "guidance_only"]
    notes: str | None = None


class DigestiveKnowledgeDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    created_at: str
    purpose: str
    evidence_grades: dict[str, str]
    global_forbidden: list[str]
    sources: list[DigestiveKnowledgeSource]
    claims: list[DigestiveKnowledgeClaim]

    def source_map(self) -> dict[str, DigestiveKnowledgeSource]:
        return {source.id: source for source in self.sources}

    def claim_map(self) -> dict[str, DigestiveKnowledgeClaim]:
        return {claim.id: claim for claim in self.claims}


class DigestiveKnowledgeFacts(BaseModel):
    """Current observation/context fields used for deterministic retrieval."""

    model_config = ConfigDict(extra="forbid")

    image_quality: str = "unknown"
    consistency: str = "unknown"
    shape: str = "unknown"
    moisture: str = "unknown"
    segmentation: str = "unknown"
    score: int | None = None
    color_family: str = "UNKNOWN"
    mucus: str = "unknown"
    blood: str = "unknown"
    melena: str = "unknown"
    foreign: str = "unknown"
    undigested: str = "unknown"
    confidence_band: str = "LOW"
    learning_eligible: bool | None = None
    state: str = "MONITOR"
    safety_state: str = "ROUTINE"
    has_food: bool = False
    quantity_present: bool = False
    food_started_days_ago: int | None = None
    prior_score_count: int = 0
    recent_episode_count_24h: int = 0
    recent_watery_count_24h: int = 0
    episode_count_7d: int = 0
    episode_count_30d: int = 0
    watery_count_7d: int = 0
    vomiting_today: bool | None = None
    reduced_activity_today: bool | None = None
    appetite_reduced: bool | None = None
    straining_or_urgency: bool | None = None
    unusual_food_48h: bool | None = None
    supplements_or_medication: bool | None = None
    weight_present: bool = False
    owner_context_used: bool = False
    photo_based: bool = True


class DigestiveKnowledgeReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reference_id: str
    title: str
    publisher: str
    url: str
    supports: str


class DigestiveKnowledgeRetrieval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registry_version: str
    checksum: str
    claim_ids: list[str]
    references: list[DigestiveKnowledgeReference]


def _canonical_payload() -> str:
    return json.dumps(
        json.loads(DATA_PATH.read_text(encoding="utf-8")),
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )


@lru_cache(maxsize=1)
def get_digestive_knowledge() -> DigestiveKnowledgeDocument:
    with DATA_PATH.open(encoding="utf-8") as handle:
        document = DigestiveKnowledgeDocument.model_validate(json.load(handle))
    if document.version != EXPECTED_VERSION:
        raise ValueError(
            f"Unsupported digestive knowledge version: {document.version!r}"
        )
    source_ids = [source.id for source in document.sources]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("duplicate digestive knowledge source id")
    claim_ids = [claim.id for claim in document.claims]
    if len(claim_ids) != len(set(claim_ids)):
        raise ValueError("duplicate digestive knowledge claim id")
    known_sources = set(source_ids)
    for claim in document.claims:
        unknown = set(claim.source_ids) - known_sources
        if unknown:
            raise ValueError(f"{claim.id}: unknown sources {unknown}")
        if not claim.source_ids:
            raise ValueError(f"{claim.id}: missing source_ids")
    missing_publishers = known_sources - set(SOURCE_PUBLISHERS)
    if missing_publishers:
        raise ValueError(f"unmapped digestive publishers: {missing_publishers}")
    return document


def document_checksum() -> str:
    get_digestive_knowledge()
    return hashlib.sha256(_canonical_payload().encode("utf-8")).hexdigest()


def _level(value: str | None) -> str:
    return str(value or "unknown").lower()


def _is_clear(value: str | None) -> bool:
    return _level(value) == "clear_candidate"


def _is_possible(value: str | None) -> bool:
    return _level(value) in {"possible", "possible_unverified"}


def _digestive_changed(facts: DigestiveKnowledgeFacts) -> bool:
    return facts.state != "ROUTINE" or facts.safety_state != "ROUTINE"


def _nutrition_incomplete(facts: DigestiveKnowledgeFacts) -> bool:
    return not facts.has_food or not facts.quantity_present


def _ordinary_non_safety_color(facts: DigestiveKnowledgeFacts) -> bool:
    family = str(facts.color_family or "UNKNOWN").upper()
    if family in {"RED_APPEARANCE", "BLACK_TARRY_APPEARANCE", "BROWN", "UNKNOWN"}:
        return False
    if _is_clear(facts.blood) or _is_clear(facts.melena):
        return False
    return family in {
        "YELLOW",
        "GREEN",
        "GREEN_BROWN",
        "ORANGE",
        "PALE_GRAY",
        "DARK_BROWN",
        "LIGHT_BROWN",
        "OTHER",
    }


def _matcher_table(facts: DigestiveKnowledgeFacts) -> dict[str, bool]:
    score = facts.score
    consistency = _level(facts.consistency)
    loose = consistency in {"soft", "unformed", "watery"}
    return {
        "DIG_SCORE_SCALE_001": score is not None,
        "DIG_SCORE_1_001": score == 1,
        "DIG_SCORE_2_001": score == 2,
        "DIG_SCORE_3_001": score == 3,
        "DIG_SCORE_4_001": score == 4,
        "DIG_SCORE_5_001": score == 5,
        "DIG_SCORE_6_001": score == 6,
        "DIG_SCORE_7_001": score == 7,
        "DIG_SCORE_PHOTO_LIMIT_001": facts.photo_based,
        "DIG_SCORE_ADJACENT_001": (
            score is not None and facts.confidence_band.upper() != "HIGH"
        ),
        "DIG_PHOTO_VALIDATION_001": facts.photo_based,
        "DIG_BLACK_TARRY_001": _is_clear(facts.melena)
        or str(facts.color_family or "").upper() == "BLACK_TARRY_APPEARANCE",
        "DIG_BLACK_TARRY_POSSIBLE_001": _is_possible(facts.melena),
        "DIG_FRESH_BLOOD_001": _is_clear(facts.blood),
        "DIG_FRESH_BLOOD_POSSIBLE_001": _is_possible(facts.blood),
        "DIG_COLOR_NONRED_NONBLACK_001": _ordinary_non_safety_color(facts),
        "DIG_MUCUS_001": _is_possible(facts.mucus) or _is_clear(facts.mucus),
        "DIG_FOREIGN_MATERIAL_001": _is_clear(facts.foreign),
        "DIG_FOREIGN_POSSIBLE_001": _is_possible(facts.foreign),
        "DIG_UNDIGESTED_FOOD_001": _is_possible(facts.undigested)
        or _is_clear(facts.undigested),
        "DIG_CONTEXT_CORE_001": _digestive_changed(facts),
        "DIG_VOMITING_001": consistency in {"unformed", "watery"},
        "DIG_ACTIVITY_001": _digestive_changed(facts)
        and facts.reduced_activity_today is True,
        "DIG_APPETITE_001": _digestive_changed(facts)
        and facts.appetite_reduced is True,
        "DIG_FREQUENCY_001": facts.recent_episode_count_24h >= 1
        or facts.episode_count_7d >= 2,
        "DIG_REPEATED_WATERY_001": consistency == "watery"
        and facts.recent_watery_count_24h >= 1,
        "DIG_STRAINING_001": facts.straining_or_urgency is True,
        "DIG_DURATION_001": loose
        and (facts.episode_count_7d >= 2 or facts.watery_count_7d >= 2),
        "DIG_DIET_HISTORY_001": _digestive_changed(facts)
        and _nutrition_incomplete(facts),
        "DIG_FOOD_CHANGE_001": facts.has_food
        and facts.food_started_days_ago is not None
        and facts.food_started_days_ago <= 7,
        "DIG_DIET_TRANSITION_001": False,
        "DIG_FEEDING_AMOUNT_001": facts.has_food and not facts.quantity_present,
        "DIG_TREATS_EXTRAS_001": facts.unusual_food_48h is True
        or (_digestive_changed(facts) and facts.unusual_food_48h is None),
        "DIG_MED_SUPPLEMENT_001": facts.supplements_or_medication is True,
        "DIG_WEIGHT_CONTEXT_001": facts.weight_present,
        "DIG_BASELINE_PERSONAL_001": facts.prior_score_count >= 3,
        "DIG_LEARNING_QUALITY_001": _level(facts.image_quality) == "insufficient",
        "DIG_LEARNING_SAFETY_001": facts.learning_eligible is False
        and (
            _is_clear(facts.blood)
            or _is_clear(facts.melena)
            or _is_clear(facts.foreign)
            or _is_possible(facts.blood)
            or _is_possible(facts.melena)
        ),
        "DIG_OWNER_CONTEXT_PROVENANCE_001": facts.owner_context_used,
    }


def _claim_matches(claim_id: str, facts: DigestiveKnowledgeFacts) -> bool:
    return _matcher_table(facts).get(claim_id, False)


def matcher_claim_ids() -> frozenset[str]:
    return frozenset(_matcher_table(DigestiveKnowledgeFacts()))


def select_digestive_claims(
    facts: DigestiveKnowledgeFacts,
    *,
    include_guidance: bool = False,
) -> list[DigestiveKnowledgeClaim]:
    document = get_digestive_knowledge()
    selected: list[DigestiveKnowledgeClaim] = []
    for claim in document.claims:
        if claim.status == GUIDANCE_ONLY_STATUS and not include_guidance:
            continue
        if claim.status != ACTIVE_STATUS and not (
            include_guidance and claim.status == GUIDANCE_ONLY_STATUS
        ):
            continue
        if _claim_matches(claim.id, facts):
            selected.append(claim)
    return selected


def references_for_claims(
    claims: list[DigestiveKnowledgeClaim],
) -> list[DigestiveKnowledgeReference]:
    document = get_digestive_knowledge()
    sources = document.source_map()
    references: list[DigestiveKnowledgeReference] = []
    seen: set[str] = set()
    for claim in claims:
        for source_id in claim.source_ids:
            if source_id in seen:
                continue
            source = sources[source_id]
            seen.add(source_id)
            references.append(
                DigestiveKnowledgeReference(
                    reference_id=source.id,
                    title=SOURCE_TITLES[source.id],
                    publisher=SOURCE_PUBLISHERS[source.id],
                    url=source.url,
                    supports=source.use,
                )
            )
    return references


def retrieve_digestive_knowledge(
    facts: DigestiveKnowledgeFacts,
) -> DigestiveKnowledgeRetrieval:
    claims = select_digestive_claims(facts)
    return DigestiveKnowledgeRetrieval(
        registry_version=EXPECTED_VERSION,
        checksum=document_checksum(),
        claim_ids=[claim.id for claim in claims],
        references=references_for_claims(claims),
    )


def facts_from_observation(
    observation: dict[str, Any],
    *,
    state: str,
    safety_state: str,
    has_food: bool = False,
    quantity_present: bool = False,
    food_started_days_ago: int | None = None,
    prior_score_count: int = 0,
    recent_episode_count_24h: int = 0,
    recent_watery_count_24h: int = 0,
    episode_count_7d: int = 0,
    episode_count_30d: int = 0,
    watery_count_7d: int = 0,
    vomiting_today: bool | None = None,
    reduced_activity_today: bool | None = None,
    appetite_reduced: bool | None = None,
    straining_or_urgency: bool | None = None,
    unusual_food_48h: bool | None = None,
    supplements_or_medication: bool | None = None,
    weight_present: bool = False,
    owner_context_used: bool = False,
) -> DigestiveKnowledgeFacts:
    score_raw = observation.get("fecal_score_estimate")
    score = int(score_raw) if isinstance(score_raw, int | float) else None
    learning = observation.get("learning_eligible")
    return DigestiveKnowledgeFacts(
        image_quality=str(observation.get("image_quality") or "unknown"),
        consistency=str(observation.get("consistency") or "unknown"),
        shape=str(observation.get("shape") or "unknown"),
        moisture=str(observation.get("apparent_moisture") or "unknown"),
        segmentation=str(observation.get("segmentation") or "unknown"),
        score=score,
        color_family=str(observation.get("color_family") or "UNKNOWN"),
        mucus=str(observation.get("mucus_candidate") or "unknown"),
        blood=str(observation.get("fresh_blood_candidate") or "unknown"),
        melena=str(observation.get("melena_candidate") or "unknown"),
        foreign=str(observation.get("foreign_material_candidate") or "unknown"),
        undigested=str(observation.get("undigested_food_candidate") or "unknown"),
        confidence_band=str(observation.get("confidence_band") or "LOW").upper(),
        learning_eligible=learning if isinstance(learning, bool) else None,
        state=state,
        safety_state=safety_state,
        has_food=has_food,
        quantity_present=quantity_present,
        food_started_days_ago=food_started_days_ago,
        prior_score_count=prior_score_count,
        recent_episode_count_24h=recent_episode_count_24h,
        recent_watery_count_24h=recent_watery_count_24h,
        episode_count_7d=episode_count_7d,
        episode_count_30d=episode_count_30d,
        watery_count_7d=watery_count_7d,
        vomiting_today=vomiting_today,
        reduced_activity_today=reduced_activity_today,
        appetite_reduced=appetite_reduced,
        straining_or_urgency=straining_or_urgency,
        unusual_food_48h=unusual_food_48h,
        supplements_or_medication=supplements_or_medication,
        weight_present=weight_present,
        owner_context_used=owner_context_used,
        photo_based=True,
    )
