"""Per-domain DogIntelligenceContext facade. Extends the current engine."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.domains.models import DogRec
from app.knowledge.breed_resolver import BreedResolution, resolve_breed
from app.knowledge.intelligence_v3 import ClaimSummary, select_claims
from app.knowledge.models import DogContextSnapshot

IntelligenceDomain = Literal["behavior", "digestive", "nutrition"]


class DogIntelligenceContext(BaseModel):
    domain: IntelligenceDomain
    version: str = "intelligence/v3"
    dog_id: str
    dog_name: str
    sex: str | None = None
    age_months: int | None = None
    size: str | None = None
    owner_display_name: str | None = None
    breed_label: str | None = None
    breed: BreedResolution
    claims: list[ClaimSummary] = Field(default_factory=list)
    flags: dict[str, bool] = Field(default_factory=dict)
    digestive: dict[str, Any] | None = None
    nutrition: dict[str, Any] | None = None

    def observer_payload(self) -> dict[str, str] | None:
        if not self.flags.get("morphology_observer_context_v1"):
            return None
        return self.breed.observer_safe_morphology()

    def reasoner_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "version": self.version,
            "domain": self.domain,
            "identity": {
                "name": self.dog_name,
                "sex": self.sex,
                "age_months": self.age_months,
                "size": self.size,
                "breed": self.breed_label,
                "owner_display_name": self.owner_display_name,
            },
            "breed_status": self.breed.status,
            "prior_eligible": self.breed.prior_eligible,
            "functional_group": (
                self.breed.functional_group
                if self.flags.get("breed_intelligence_v1") and self.breed.status == "NAMED"
                else None
            ),
            "claims": [claim.model_dump(mode="json") for claim in self.claims],
            "rules": [
                "Pretraining is language, not a scientific source.",
                "Mix and unknown have no named-breed prior.",
                "Never infer aggression from breed or mix.",
                "Sex and owner name are identity facts, not behavioral verdicts.",
                "Owner facts stay owner-reported.",
            ],
        }
        if self.digestive:
            payload["digestive"] = self.digestive
        if self.nutrition and self.flags.get("nutrition_intelligence_v1"):
            payload["nutrition"] = self.nutrition
        return payload

    def audit(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "domain": self.domain,
            "breed_status": self.breed.status,
            "canonical_id": self.breed.canonical_id,
            "functional_group": self.breed.functional_group,
            "prior_eligible": self.breed.prior_eligible,
            "claim_ids": [claim.claim_id for claim in self.claims],
            "flags": self.flags,
        }


def intelligence_flags(settings: Settings | None = None) -> dict[str, bool]:
    cfg = settings or get_settings()
    return {
        "breed_intelligence_v1": bool(cfg.breed_intelligence_v1),
        "morphology_observer_context_v1": bool(cfg.morphology_observer_context_v1),
        "nutrition_intelligence_v1": bool(cfg.nutrition_intelligence_v1),
        "digestive_longitudinal_v3": bool(cfg.digestive_longitudinal_v3),
        "open_pet_food_facts_v1": bool(cfg.open_pet_food_facts_v1),
    }


def build_dog_intelligence_context(
    dog: DogRec,
    dog_context: DogContextSnapshot | None = None,
    *,
    domain: IntelligenceDomain,
    settings: Settings | None = None,
    digestive: dict[str, Any] | None = None,
    nutrition: dict[str, Any] | None = None,
) -> DogIntelligenceContext:
    flags = intelligence_flags(settings)
    breed = resolve_breed(
        dog_context.breed_label if dog_context is not None else dog.breed_label,
        is_mix=dog_context.is_mix if dog_context is not None else dog.is_mix,
    )
    extra_when: list[str] = []
    if breed.status == "NAMED":
        extra_when.append("named_breed")
    age_months = dog_context.age_months if dog_context is not None else None
    size = dog_context.size if dog_context is not None else dog.size
    sex = dog_context.sex if dog_context is not None else dog.sex
    owner_display_name = (
        dog_context.owner_display_name if dog_context is not None else None
    )
    breed_label = (
        dog_context.breed_label if dog_context is not None else dog.breed_label
    )
    return DogIntelligenceContext(
        domain=domain,
        dog_id=dog.id,
        dog_name=dog.name,
        sex=sex,
        age_months=age_months,
        size=size,
        owner_display_name=owner_display_name,
        breed_label=breed_label,
        breed=breed,
        claims=select_claims(domain=domain, flags=flags, extra_when=extra_when),
        flags=flags,
        digestive=digestive,
        nutrition=nutrition,
    )
