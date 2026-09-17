"""Small, versioned veterinary source registry for digestive reasoning.

References are selected by deterministic relevance rules. They are audit
metadata, not diagnosis text and are not dumped onto the primary consumer UI.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class DigestiveKnowledgeReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reference_id: str
    title: str
    publisher: str
    url: str
    supports: str


MERCK_GROSS_FECAL = DigestiveKnowledgeReference(
    reference_id="merck-gross-fecal-evaluation/v1",
    title="The Digestive System in Animals",
    publisher="Merck Veterinary Manual",
    url=(
        "https://www.merckvetmanual.com/digestive-system/"
        "digestive-system-introduction/the-digestive-system-in-animals"
    ),
    supports="Gross fecal characteristics must be interpreted with history and examination.",
)

VCA_DIARRHEA_CONTEXT = DigestiveKnowledgeReference(
    reference_id="vca-diarrhea-context/v1",
    title="Diarrhea Questionnaire and Checklist for Dogs",
    publisher="VCA Animal Hospitals",
    url="https://vcahospitals.com/know-your-pet/diarrhea-questionnaire-and-checklist-for-dogs",
    supports="Frequency, blood, mucus, diet, activity and vomiting are relevant context.",
)

WSAVA_NUTRITION = DigestiveKnowledgeReference(
    reference_id="wsava-nutrition-assessment/v1",
    title="WSAVA Nutritional Assessment Guidelines",
    publisher="World Small Animal Veterinary Association",
    url=(
        "https://wsava.org/wp-content/uploads/2020/01/"
        "WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf"
    ),
    supports="Diet history, activity, weight and gastrointestinal signs belong in context.",
)

AAHA_DIET_TRANSITION = DigestiveKnowledgeReference(
    reference_id="aaha-diet-transition-2021/v1",
    title="2021 AAHA Nutrition and Weight Management Guidelines",
    publisher="American Animal Hospital Association",
    url=(
        "https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-"
        "management-guidelines/feeding-plans-for-healthy-appropriate-"
        "weight-cats-and-dogs/"
    ),
    supports=(
        "Gradual diet adjustments over four to seven days may reduce "
        "negative gastrointestinal responses."
    ),
)

FECAL_SCORE_AGREEMENT = DigestiveKnowledgeReference(
    reference_id="jsap-fecal-score-agreement-2021/v1",
    title="Consistency of faecal scoring using two canine faecal scoring systems",
    publisher="Journal of Small Animal Practice",
    url="https://pubmed.ncbi.nlm.nih.gov/33491796/",
    supports=(
        "Visual fecal scores are descriptive monitoring tools with variable "
        "agreement, especially between lay people and veterinarians."
    ),
)


def retrieve_digestive_knowledge(
    *,
    has_food_context: bool,
    needs_clinical_context: bool,
) -> list[DigestiveKnowledgeReference]:
    references = [MERCK_GROSS_FECAL, FECAL_SCORE_AGREEMENT]
    if needs_clinical_context:
        references.append(VCA_DIARRHEA_CONTEXT)
    if has_food_context:
        references.extend([WSAVA_NUTRITION, AAHA_DIET_TRANSITION])
    return references
