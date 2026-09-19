"""Governed, auditable behavior decision policy.

The reasoner proposes a hypothesis. This module checks whether observable
signal families, scientific coverage, context and contradictions support it.
It may promote an abstention only when one bounded candidate is both uniquely
supported and already present among the reasoner's alternatives.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.interpretation import (
    AlternativeIntent,
    ContextOption,
    EvidenceItem,
    InterpretationContract,
)
from app.contracts.observation import (
    ApproachWithdrawalFreeze,
    BodyHeight,
    EarPosition,
    Locomotion,
    ObservationContract,
    Posture,
    TailHeight,
    TailMovement,
    TriState,
    VocalizationType,
)
from app.contracts.taxonomy import ConfidenceBand, ContextBucket, IntentCode
from app.domains.context_bucket import observation_supports_exit
from app.knowledge.models import KnowledgeContext

BEHAVIOR_DECISION_POLICY_VERSION = "behavior-decision/v3"


@dataclass(frozen=True)
class Signal:
    key: str
    family: str
    ref: str
    description: str


@dataclass(frozen=True)
class IntentPolicy:
    intent: IntentCode
    paths: tuple[frozenset[str], ...]
    supporting: frozenset[str]
    contradictions: frozenset[str]
    exclusions: frozenset[str] = frozenset()
    min_families: int = 2


class CandidateDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: IntentCode
    matched_path: list[str]
    supporting_signals: list[str]
    contradictions: list[str]
    excluded_by: list[str]
    signal_families: list[str]
    eligible: bool
    score: int


class BehaviorDecisionTrace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy_version: str = BEHAVIOR_DECISION_POLICY_VERSION
    initial_intent: IntentCode | None
    final_intent: IntentCode | None
    resolution: Literal[
        "ACCEPTED_REASONER",
        "PROMOTED_BOUNDED_CANDIDATE",
        "OVERRIDDEN_UNSUPPORTED",
        "ABSTAINED",
        "SAFETY_PRESERVED",
    ]
    scientific_coverage: str
    scientific_card_ids: list[str] = Field(default_factory=list)
    context_bucket: ContextBucket
    personal_pattern_ids: list[str] = Field(default_factory=list)
    candidates: list[CandidateDecision] = Field(default_factory=list)
    confidence_ceiling: ConfidenceBand
    copy_source: Literal["REASONER", "DECISION_FALLBACK", "SAFETY"]


_POLICIES = (
    IntentPolicy(
        intent=IntentCode.PLAY_INTERACTION,
        paths=(
            frozenset({"body.play_bow"}),
            frozenset({"body.loose", "movement.approach", "tail.wagging"}),
        ),
        supporting=frozenset(
            {"body.play_bow", "body.loose", "movement.approach", "tail.wagging"}
        ),
        contradictions=frozenset(
            {
                "body.stiff",
                "body.lowered",
                "movement.withdrawal",
                "tail.tucked",
                "face.lip_lick",
                "vocal.growl",
            }
        ),
        min_families=1,
    ),
    IntentPolicy(
        intent=IntentCode.ATTENTION_REQUEST,
        paths=(
            frozenset({"target.owner", "movement.approach"}),
            frozenset({"target.owner", "vocal.whine"}),
        ),
        supporting=frozenset(
            {"target.owner", "movement.approach", "vocal.whine", "vocal.bark"}
        ),
        contradictions=frozenset(
            {"movement.withdrawal", "target.external", "tail.tucked"}
        ),
    ),
    IntentPolicy(
        intent=IntentCode.OUTSIDE_REQUEST,
        paths=(
            frozenset({"target.exit", "movement.approach"}),
            frozenset({"target.exit", "vocal.bark"}),
        ),
        supporting=frozenset(
            {"target.exit", "movement.approach", "vocal.bark", "context.door_exit"}
        ),
        contradictions=frozenset({"movement.withdrawal", "body.lowered"}),
    ),
    IntentPolicy(
        intent=IntentCode.ALERT_VIGILANCE,
        paths=(
            frozenset({"body.stiff", "target.external", "vocal.bark"}),
            frozenset({"movement.freeze", "target.external", "vocal.bark"}),
        ),
        supporting=frozenset(
            {
                "body.stiff",
                "movement.freeze",
                "target.external",
                "vocal.bark",
                "ears.forward",
                "weight.forward",
            }
        ),
        contradictions=frozenset(
            {"body.play_bow", "body.loose", "movement.withdrawal"}
        ),
        exclusions=frozenset(
            {"body.lowered", "tail.tucked", "ears.flat_back"}
        ),
        min_families=3,
    ),
    IntentPolicy(
        intent=IntentCode.DISCOMFORT_AVOIDANCE,
        paths=(
            # Social avoidance: seeks distance.
            frozenset({"movement.withdrawal", "ears.back"}),
            frozenset({"movement.withdrawal", "face.lip_lick"}),
            frozenset({"movement.withdrawal", "body.lowered"}),
            # Somatic / unease: may still approach the owner for help.
            frozenset({"face.lip_lick", "body.lowered", "movement.still"}),
            frozenset({"face.lip_lick", "body.lowered", "vocal.whine"}),
            frozenset({"ears.back", "face.lip_lick", "movement.still"}),
            frozenset({"movement.approach", "face.lip_lick", "body.lowered"}),
            frozenset({"movement.approach", "vocal.whine", "body.lowered"}),
        ),
        supporting=frozenset(
            {
                "movement.withdrawal",
                "movement.approach",
                "movement.still",
                "ears.back",
                "face.lip_lick",
                "face.yawn",
                "body.lowered",
                "tail.below",
                "vocal.whine",
            }
        ),
        # Play bow is the hard opposite; approaching the owner is allowed
        # (dogs often seek people when they feel unwell).
        contradictions=frozenset({"body.play_bow", "body.loose", "tail.wagging"}),
    ),
    IntentPolicy(
        intent=IntentCode.FEAR_INSECURITY,
        paths=(
            frozenset({"body.lowered", "movement.withdrawal", "tail.tucked"}),
            frozenset({"body.lowered", "movement.freeze", "ears.flat_back"}),
        ),
        supporting=frozenset(
            {
                "body.lowered",
                "movement.withdrawal",
                "movement.freeze",
                "tail.tucked",
                "ears.flat_back",
                "vocal.whine",
            }
        ),
        contradictions=frozenset({"body.loose", "body.play_bow"}),
        min_families=3,
    ),
    IntentPolicy(
        intent=IntentCode.HIGH_AROUSAL,
        paths=(
            frozenset({"movement.running", "vocal.repetitive"}),
            frozenset({"movement.running", "vocal.high_intensity"}),
        ),
        supporting=frozenset(
            {
                "movement.running",
                "vocal.repetitive",
                "vocal.high_intensity",
                "tail.fast",
            }
        ),
        contradictions=frozenset({"body.loose", "movement.still"}),
    ),
    IntentPolicy(
        intent=IntentCode.FRUSTRATION,
        paths=(
            frozenset({"target.barrier", "vocal.repetitive", "movement.approach"}),
            frozenset({"target.barrier", "vocal.repetitive", "body.stiff"}),
        ),
        supporting=frozenset(
            {
                "target.barrier",
                "vocal.repetitive",
                "movement.approach",
                "body.stiff",
            }
        ),
        contradictions=frozenset({"movement.withdrawal", "body.loose"}),
        min_families=3,
    ),
    IntentPolicy(
        intent=IntentCode.RELAX_REST,
        paths=(
            frozenset({"body.loose", "movement.still", "face.relaxed_mouth"}),
        ),
        supporting=frozenset(
            {
                "body.loose",
                "movement.still",
                "face.relaxed_mouth",
                "tail.neutral",
                "context.rest",
            }
        ),
        contradictions=frozenset(
            {"body.stiff", "vocal.repetitive", "movement.running"}
        ),
        min_families=3,
    ),
    IntentPolicy(
        intent=IntentCode.RESOURCE_TENSION,
        paths=(
            frozenset({"scene.resource", "body.stiff", "vocal.growl"}),
            frozenset({"scene.resource", "movement.freeze", "vocal.growl"}),
        ),
        supporting=frozenset(
            {
                "scene.resource",
                "body.stiff",
                "movement.freeze",
                "vocal.growl",
                "context.feeding",
            }
        ),
        contradictions=frozenset({"body.loose", "body.play_bow"}),
        min_families=3,
    ),
)


def _text(*values: object) -> str:
    return " ".join(str(value).casefold() for value in values if value)


def _contains(text: str, markers: tuple[str, ...]) -> bool:
    return any(marker in text for marker in markers)


def extract_behavior_signals(
    observation: ObservationContract,
    context_bucket: ContextBucket,
) -> dict[str, Signal]:
    signals: dict[str, Signal] = {}

    def add(key: str, family: str, ref: str, description: str) -> None:
        signals[key] = Signal(key, family, ref, description)

    body = observation.body
    if body.posture is Posture.PLAY_BOW:
        add("body.play_bow", "body", "body.posture", "Assume un inchino di gioco.")
    if body.posture is Posture.LOOSE:
        add("body.loose", "body", "body.posture", "Il corpo appare sciolto.")
    if (
        body.posture is Posture.STIFF
        or body.rigidity_candidate is TriState.YES
    ):
        add("body.stiff", "body", "body.rigidity_candidate", "Il corpo appare rigido.")
    if body.body_height is BodyHeight.LOWERED or body.posture in {
        Posture.CROUCH,
        Posture.LOWERED,
    }:
        add("body.lowered", "body", "body.body_height", "Tiene il corpo abbassato.")
    if _contains(_text(body.weight_shift), ("forward", "avanti")):
        add("weight.forward", "body", "body.weight_shift", "Il peso è spostato in avanti.")

    movement = body.approach_withdrawal_freeze
    if movement is ApproachWithdrawalFreeze.APPROACH:
        add("movement.approach", "movement", "body.approach_withdrawal_freeze", "Si avvicina.")
    if movement is ApproachWithdrawalFreeze.WITHDRAWAL:
        add("movement.withdrawal", "movement", "body.approach_withdrawal_freeze", "Si allontana.")
    if movement is ApproachWithdrawalFreeze.FREEZE:
        add("movement.freeze", "movement", "body.approach_withdrawal_freeze", "Si immobilizza.")
    if body.locomotion is Locomotion.STILL:
        add("movement.still", "movement", "body.locomotion", "Resta fermo.")
    if body.locomotion is Locomotion.RUNNING:
        add("movement.running", "movement", "body.locomotion", "Si muove rapidamente.")

    target = _text(
        body.orientation_target,
        observation.head_face.head_orientation,
        observation.head_face.gaze_target,
    )
    if _contains(
        target,
        (
            "off-screen",
            "off_screen",
            "off camera",
            "off-camera",
            "fuori campo",
            "outside",
            "esterno",
            "window",
            "finestra",
        ),
    ):
        add(
            "target.external",
            "attention",
            "body.orientation_target",
            "L’attenzione resta su qualcosa esterno o fuori inquadratura.",
        )
    if _contains(target, ("owner", "propriet", "camera", "person", "persona", "human")):
        add("target.owner", "attention", "head_face.gaze_target", "Orienta l’attenzione verso una persona.")
    if _contains(target, ("door", "porta", "gate", "cancello", "leash", "guinzaglio")):
        add("target.exit", "attention", "body.orientation_target", "Si orienta verso l’uscita.")

    scene_text = _text(
        *observation.scene.visible_objects,
        *observation.scene.spatial_relations,
    )
    if _contains(scene_text, ("food", "cibo", "bowl", "ciotola", "toy", "gioco", "bone", "osso")):
        add("scene.resource", "scene", "scene.visible_objects", "È presente una possibile risorsa.")
    if _contains(scene_text, ("barrier", "barriera", "fence", "recinto", "gate", "cancello")):
        add("target.barrier", "scene", "scene.spatial_relations", "È presente una barriera.")

    ears = observation.ears.position
    if ears in {EarPosition.BACK, EarPosition.FLAT_BACK}:
        add("ears.back", "ears", "ears.position", "Le orecchie sono orientate indietro.")
    if ears is EarPosition.FLAT_BACK:
        add("ears.flat_back", "ears", "ears.position", "Le orecchie sono appiattite indietro.")
    if ears in {EarPosition.FORWARD, EarPosition.NEUTRAL_FORWARD}:
        add("ears.forward", "ears", "ears.position", "Le orecchie sono orientate in avanti.")

    tail = observation.tail
    if tail.movement is TailMovement.WAGGING:
        add("tail.wagging", "tail", "tail.movement", "La coda si muove.")
    if tail.neutral_relative_height is TailHeight.TUCKED:
        add("tail.tucked", "tail", "tail.neutral_relative_height", "La coda è raccolta sotto il corpo.")
    if tail.neutral_relative_height is TailHeight.BELOW:
        add("tail.below", "tail", "tail.neutral_relative_height", "La coda è più bassa.")
    if tail.neutral_relative_height is TailHeight.NEUTRAL:
        add("tail.neutral", "tail", "tail.neutral_relative_height", "La coda resta in posizione neutra.")
    if _contains(_text(tail.speed_amp_qualitative), ("fast", "rapid", "veloc")):
        add("tail.fast", "tail", "tail.speed_amp_qualitative", "La coda si muove rapidamente.")

    face = observation.head_face
    if face.lip_lick_candidate is TriState.YES:
        add("face.lip_lick", "face", "head_face.lip_lick_candidate", "Si lecca il muso.")
    if face.yawn_candidate is TriState.YES:
        add("face.yawn", "face", "head_face.yawn_candidate", "Sbadiglia.")
    if _contains(_text(face.mouth_state), ("open_relaxed", "rilassat")):
        add("face.relaxed_mouth", "face", "head_face.mouth_state", "La bocca appare rilassata.")

    vocal = observation.vocalization
    types = set(vocal.type_candidates)
    for kind, key, label in (
        (VocalizationType.BARK, "vocal.bark", "Si sentono abbai."),
        (VocalizationType.GROWL, "vocal.growl", "Si sente un ringhio."),
        (VocalizationType.WHINE, "vocal.whine", "Si sente un guaito."),
        (VocalizationType.WHIMPER, "vocal.whine", "Si sente un lamento."),
    ):
        if vocal.present is TriState.YES and kind in types:
            add(key, "vocalization", "vocalization.type_candidates", label)
    if (vocal.count or 0) >= 3 or _contains(
        _text(vocal.rhythm, vocal.interval_pattern),
        ("repet", "rapid", "continuous", "continu"),
    ):
        add("vocal.repetitive", "vocalization", "vocalization.rhythm", "La vocalizzazione si ripete.")
    if _contains(_text(vocal.intensity), ("high", "forte", "intense")):
        add("vocal.high_intensity", "vocalization", "vocalization.intensity", "La vocalizzazione è intensa.")

    if (
        context_bucket is ContextBucket.DOOR_EXIT
        and observation_supports_exit(observation)
    ):
        add("context.door_exit", "context", "context_bucket", "Il momento è vicino a un’uscita.")
    if context_bucket is ContextBucket.FEEDING:
        add("context.feeding", "context", "context_bucket", "Il momento riguarda il cibo.")
    if context_bucket is ContextBucket.REST:
        add("context.rest", "context", "context_bucket", "Il momento avviene durante il riposo.")
    return signals


def _candidate(policy: IntentPolicy, signals: dict[str, Signal]) -> CandidateDecision:
    keys = set(signals)
    matched = next((path for path in policy.paths if path <= keys), frozenset())
    supporting = sorted(keys & policy.supporting)
    contradictions = sorted(keys & policy.contradictions)
    excluded_by = sorted(keys & policy.exclusions)
    families = sorted({signals[key].family for key in supporting})
    eligible = bool(matched) and len(families) >= policy.min_families and not excluded_by
    score = len(supporting) + (2 if matched else 0) - (2 * len(contradictions))
    return CandidateDecision(
        intent=policy.intent,
        matched_path=sorted(matched),
        supporting_signals=supporting,
        contradictions=contradictions,
        excluded_by=excluded_by,
        signal_families=families,
        eligible=eligible,
        score=score,
    )


def _confidence_ceiling(
    observation: ObservationContract,
    knowledge: KnowledgeContext,
    candidates: list[CandidateDecision],
    final_intent: IntentCode | None,
) -> ConfidenceBand:
    if final_intent in {None, IntentCode.INSUFFICIENT, IntentCode.AMBIGUOUS}:
        return ConfidenceBand.LOW
    selected = next((item for item in candidates if item.intent is final_intent), None)
    if selected and (selected.contradictions or selected.excluded_by):
        return ConfidenceBand.LOW
    if knowledge.coverage == "LOW":
        return ConfidenceBand.LOW
    if (
        knowledge.coverage == "MEDIUM"
        or observation.capture_quality.overall_quality != "good"
    ):
        return ConfidenceBand.MEDIUM
    return ConfidenceBand.HIGH


# Everyday, low-stakes readings: prefer a useful primary over "ambiguous".
_EVERYDAY_INTENTS = frozenset(
    {
        IntentCode.PLAY_INTERACTION,
        IntentCode.ATTENTION_REQUEST,
        IntentCode.RELAX_REST,
    }
)

# Care / wellbeing branch: never collapse these into "play vs angry".
_CARE_INTENTS = frozenset(
    {
        IntentCode.DISCOMFORT_AVOIDANCE,
        IntentCode.FEAR_INSECURITY,
    }
)

_PROMOTION_COPY: dict[IntentCode, tuple[str, str, str]] = {
    IntentCode.ALERT_VIGILANCE: (
        "{name} è molto attento a qualcosa fuori campo",
        (
            "{name} ha fissato qualcosa che non vediamo. "
            "Per ora la lettura più utile è: sta segnalando uno stimolo, non chiedendo altro."
        ),
        "«C’è qualcosa: guardalo con me.»",
    ),
    IntentCode.PLAY_INTERACTION: (
        "{name} ti sta invitando a giocare",
        (
            "Corpo sciolto, avvicinamento e coda morbida: "
            "in questo momento {name} cerca uno scambio di gioco con te."
        ),
        "«Ti va di fare qualcosa insieme?»",
    ),
    IntentCode.ATTENTION_REQUEST: (
        "{name} sta cercando la tua attenzione",
        (
            "{name} si orienta verso di te e si avvicina. "
            "Vuole un contatto o una risposta da te."
        ),
        "«Ehi, ci sei anche per me?»",
    ),
    IntentCode.OUTSIDE_REQUEST: (
        "{name} ti sta chiedendo di uscire",
        "Orientamento e movimento verso l’uscita rendono chiara una richiesta concreta.",
        "«Possiamo andare verso la porta?»",
    ),
    IntentCode.DISCOMFORT_AVOIDANCE: (
        "{name} non sembra a suo agio",
        (
            "Ci sono segnali di tensione o di possibile disagio fisico. "
            "Non è una diagnosi: per ora la cosa più utile è osservarlo "
            "con calma e non forzare gioco o contatto."
        ),
        "«Qualcosa non mi torna: lasciami spazio e guardami.»",
    ),
}


def _best_override_candidate(
    bounded_eligible: list[CandidateDecision],
) -> CandidateDecision | None:
    """Pick one useful reading without collapsing care into play."""
    if not bounded_eligible:
        return None
    if len(bounded_eligible) == 1:
        return bounded_eligible[0]

    ranked = sorted(bounded_eligible, key=lambda item: item.score, reverse=True)
    top, second = ranked[0], ranked[1]
    intents = {item.intent for item in ranked}

    # Play/attention vs unease: do not auto-pick play. Ask or keep ambiguous.
    if (
        IntentCode.DISCOMFORT_AVOIDANCE in intents
        and (
            IntentCode.PLAY_INTERACTION in intents
            or IntentCode.ATTENTION_REQUEST in intents
        )
        and top.score < second.score + 3
    ):
        discomfort = next(
            item
            for item in ranked
            if item.intent is IntentCode.DISCOMFORT_AVOIDANCE
        )
        rival = next(
            (
                item
                for item in ranked
                if item.intent
                in {
                    IntentCode.PLAY_INTERACTION,
                    IntentCode.ATTENTION_REQUEST,
                }
            ),
            None,
        )
        if rival is not None and discomfort.score >= rival.score:
            return discomfort
        return None

    if top.intent in _CARE_INTENTS and top.score >= second.score:
        return top

    if top.intent in _EVERYDAY_INTENTS and second.intent in _EVERYDAY_INTENTS:
        return top
    if top.score >= second.score + 2:
        return top
    return None


def _evidence_from_candidates(
    *,
    signals: dict[str, Signal],
    candidates: list[CandidateDecision],
) -> list[EvidenceItem]:
    # The previous evidence supported a now-rejected intent. Rebuild the
    # owner-facing explanation only from signals supporting the final options.
    evidence: list[EvidenceItem] = []
    known_refs: set[str | None] = set()
    for candidate in candidates:
        for key in candidate.supporting_signals:
            signal = signals[key]
            if signal.ref in known_refs:
                continue
            evidence.append(
                EvidenceItem(
                    source="observation",
                    ref=signal.ref,
                    description=signal.description,
                )
            )
            known_refs.add(signal.ref)
            if len(evidence) >= 3:
                return evidence[:5]
    return evidence[:5]


def _interaction_question(
    intents: set[IntentCode],
    *,
    exit_supported: bool,
) -> tuple[str, list[ContextOption]] | None:
    care_vs_social = IntentCode.DISCOMFORT_AVOIDANCE in intents and (
        IntentCode.PLAY_INTERACTION in intents
        or IntentCode.ATTENTION_REQUEST in intents
    )
    if care_vs_social:
        return (
            "Ti sembrava a disagio, oppure cercava contatto o gioco?",
            [
                ContextOption(
                    id="seemed_unwell",
                    label="Sembrava a disagio / non al meglio",
                ),
                ContextOption(
                    id="wanted_contact",
                    label="Cercava contatto o gioco",
                ),
                ContextOption(id="not_sure_care", label="Non ne sono sicuro"),
            ],
        )
    if {
        IntentCode.PLAY_INTERACTION,
        IntentCode.ATTENTION_REQUEST,
    } <= intents:
        return (
            "Subito prima, stavate già giocando o ti stava cercando?",
            [
                ContextOption(id="already_playing", label="Stavamo già giocando"),
                ContextOption(id="seeking_me", label="Mi stava cercando"),
                ContextOption(id="neither", label="Nessuna delle due"),
            ],
        )
    if exit_supported and {
        IntentCode.OUTSIDE_REQUEST,
        IntentCode.ATTENTION_REQUEST,
    } <= intents:
        return (
            "Si stava dirigendo davvero verso una porta o un cancello?",
            [
                ContextOption(id="toward_exit", label="Sì, verso l’uscita"),
                ContextOption(id="toward_me", label="No, veniva verso di me"),
                ContextOption(id="not_sure", label="Non ne sono sicuro"),
            ],
        )
    return None


def _ground_context_question(
    interpretation: InterpretationContract,
    *,
    candidates: list[CandidateDecision],
    exit_supported: bool,
) -> InterpretationContract:
    """Only retain a question that separates two supported readings."""
    if not interpretation.needs_context or interpretation.context_effect:
        return interpretation.model_copy(
            update={
                "needs_context": False,
                "context_question": None,
                "context_options": [],
            }
        )
    ranked = sorted(
        (item for item in candidates if item.eligible),
        key=lambda item: item.score,
        reverse=True,
    )
    prompt = _interaction_question(
        {item.intent for item in ranked[:2]},
        exit_supported=exit_supported,
    )
    if prompt is None:
        return interpretation.model_copy(
            update={
                "needs_context": False,
                "context_question": None,
                "context_options": [],
            }
        )
    question, options = prompt
    return interpretation.model_copy(
        update={
            "needs_context": True,
            "context_question": question,
            "context_options": options,
        }
    )


def _sync_ambiguous_result(
    interpretation: InterpretationContract,
    *,
    dog_name: str,
    signals: dict[str, Signal],
    candidates: list[CandidateDecision],
) -> InterpretationContract:
    ranked = sorted(
        (item for item in candidates if item.eligible),
        key=lambda item: item.score,
        reverse=True,
    )[:2]
    alternatives = [
        AlternativeIntent(
            intent=item.intent,
            rationale=(
                "I segnali visibili sostengono questa possibilità, "
                "ma il breve momento non basta a distinguerla con certezza."
            ),
        )
        for item in ranked
    ]
    ranked_intents = {item.intent for item in ranked}
    care_pair = IntentCode.DISCOMFORT_AVOIDANCE in ranked_intents and (
        IntentCode.PLAY_INTERACTION in ranked_intents
        or IntentCode.ATTENTION_REQUEST in ranked_intents
    )
    interaction_pair = {
        IntentCode.PLAY_INTERACTION,
        IntentCode.ATTENTION_REQUEST,
    } <= ranked_intents
    if care_pair:
        headline = f"{dog_name}: può essere disagio, non solo richiesta"
        summary = (
            f"I segnali di {dog_name} possono indicare disagio o un possibile "
            "malessere, oppure una richiesta di contatto. "
            "Osserva se è diverso dal suo solito, senza forzare gioco o contatto."
        )
        dog_voice = "«Qualcosa non mi torna: guardami con attenzione.»"
    elif interaction_pair:
        headline = f"{dog_name} sembra cercare un momento con te"
        summary = (
            f"{dog_name} si avvicina con il corpo sciolto e poi riparte. "
            "Può essere un invito al gioco oppure un modo per coinvolgerti."
        )
        dog_voice = "«Ti va di fare qualcosa insieme?»"
    else:
        headline = f"Ci sono due letture possibili per {dog_name}"
        summary = (
            "Il video sostiene più di una spiegazione e non permette ancora "
            "di sceglierne una con sicurezza."
        )
        dog_voice = "«Guardami ancora un momento.»"
    return interpretation.model_copy(
        update={
            "primary_intent": IntentCode.AMBIGUOUS,
            "confidence_band": ConfidenceBand.LOW,
            "consumer_headline": headline,
            "consumer_summary": summary,
            "dog_voice": dog_voice,
            "evidence": _evidence_from_candidates(
                signals=signals,
                candidates=ranked,
            ),
            "alternatives": alternatives,
            "needs_context": not bool(interpretation.context_effect),
        }
    )


def _is_observation_inventory(interpretation: InterpretationContract) -> bool:
    text = f"{interpretation.consumer_headline} {interpretation.consumer_summary}".casefold()
    observations = (
        "rigid",
        "abba",
        "coda",
        "orecchi",
        "sguardo",
        "peso in avanti",
        "resta ferm",
        "corpo",
    )
    meanings = (
        "sembra",
        "probabil",
        "potrebbe",
        "allerta",
        "attenzione",
        "chiede",
        "vuole",
        "a disagio",
        "insicur",
        "frustr",
        "rilassat",
    )
    return (
        sum(marker in text for marker in observations) >= 2
        and not any(marker in text for marker in meanings)
    )


def _sync_promoted_copy(
    interpretation: InterpretationContract,
    *,
    intent: IntentCode,
    dog_name: str,
    signals: dict[str, Signal],
    candidate: CandidateDecision,
) -> InterpretationContract:
    fallback = _PROMOTION_COPY.get(intent)
    if fallback is None:
        return interpretation
    headline, summary, voice = (part.format(name=dog_name) for part in fallback)
    # Rebuild owner-facing evidence from the promoted reading's signals.
    # Keeping the previous (rejected) evidence would leave technical placeholders.
    evidence = _evidence_from_candidates(
        signals=signals,
        candidates=[candidate],
    )
    return interpretation.model_copy(
        update={
            "primary_intent": intent,
            "confidence_band": interpretation.confidence_band,
            "consumer_headline": headline,
            "consumer_summary": summary,
            "dog_voice": voice,
            "evidence": evidence[:5],
            "alternatives": [
                item for item in interpretation.alternatives if item.intent is not intent
            ][:2],
            # A promoted everyday reading is already useful: do not stall on a
            # follow-up question before showing the owner what to do.
            "needs_context": False,
            "context_question": None,
            "context_options": [],
        }
    )


def apply_behavior_decision_policy(
    interpretation: InterpretationContract,
    observation: ObservationContract,
    *,
    dog_name: str,
    context_bucket: ContextBucket,
    knowledge: KnowledgeContext,
) -> tuple[InterpretationContract, BehaviorDecisionTrace]:
    signals = extract_behavior_signals(observation, context_bucket)
    candidates = [_candidate(policy, signals) for policy in _POLICIES]
    initial_intent = interpretation.primary_intent
    final = interpretation
    resolution = "ACCEPTED_REASONER"
    copy_source = "REASONER"
    eligible = sorted(
        (item for item in candidates if item.eligible),
        key=lambda item: item.score,
        reverse=True,
    )

    if initial_intent in {None, IntentCode.INSUFFICIENT}:
        alternative_intents = {item.intent for item in interpretation.alternatives}
        unique = (
            eligible[0]
            if eligible
            and (len(eligible) == 1 or eligible[0].score >= eligible[1].score + 2)
            else None
        )
        if (
            unique is not None
            and unique.intent in alternative_intents
            and unique.intent in _PROMOTION_COPY
        ):
            final = _sync_promoted_copy(
                interpretation,
                intent=unique.intent,
                dog_name=dog_name,
                signals=signals,
                candidate=unique,
            )
            resolution = "PROMOTED_BOUNDED_CANDIDATE"
            copy_source = "DECISION_FALLBACK"
        else:
            resolution = "ABSTAINED"
    else:
        selected = next(
            (item for item in candidates if item.intent is initial_intent),
            None,
        )
        if (
            not interpretation.safety_flags
            and selected is not None
            and not selected.eligible
        ):
            alternative_intents = {
                item.intent for item in interpretation.alternatives
            }
            bounded_eligible = [
                item for item in eligible if item.intent in alternative_intents
            ]
            unique = _best_override_candidate(bounded_eligible)
            if unique is not None and unique.intent in _PROMOTION_COPY:
                final = _sync_promoted_copy(
                    interpretation,
                    intent=unique.intent,
                    dog_name=dog_name,
                    signals=signals,
                    candidate=unique,
                )
                # Keep the next everyday option as a soft alternative, not as
                # the main (ambiguous) answer the owner sees first.
                if len(bounded_eligible) >= 2:
                    runner_up = next(
                        (
                            item
                            for item in bounded_eligible
                            if item.intent is not unique.intent
                        ),
                        None,
                    )
                    if runner_up is not None:
                        final = final.model_copy(
                            update={
                                "alternatives": [
                                    AlternativeIntent(
                                        intent=runner_up.intent,
                                        rationale=(
                                            "È un’altra lettura possibile, "
                                            "ma meno sostenuta di quella principale."
                                        ),
                                    ),
                                    *[
                                        item
                                        for item in final.alternatives
                                        if item.intent is not runner_up.intent
                                    ],
                                ][:2]
                            }
                        )
                resolution = "OVERRIDDEN_UNSUPPORTED"
                copy_source = "DECISION_FALLBACK"
            elif len(bounded_eligible) >= 2:
                final = _sync_ambiguous_result(
                    interpretation,
                    dog_name=dog_name,
                    signals=signals,
                    candidates=bounded_eligible,
                )
                resolution = "OVERRIDDEN_UNSUPPORTED"
                copy_source = "DECISION_FALLBACK"
            else:
                final = interpretation.model_copy(
                    update={
                        "primary_intent": IntentCode.INSUFFICIENT,
                        "confidence_band": ConfidenceBand.LOW,
                        "consumer_headline": (
                            f"Non ho ancora abbastanza elementi su {dog_name}"
                        ),
                        "consumer_summary": (
                            "Il momento è visibile, ma i segnali non sostengono "
                            "una lettura abbastanza solida."
                        ),
                        "dog_voice": "«Serve un momento un po’ più chiaro.»",
                        "alternatives": [],
                        "needs_context": False,
                        "context_question": None,
                        "context_options": [],
                    }
                )
                resolution = "OVERRIDDEN_UNSUPPORTED"
                copy_source = "DECISION_FALLBACK"
    if (
        resolution == "ACCEPTED_REASONER"
        and
        initial_intent in _PROMOTION_COPY
        and _is_observation_inventory(interpretation)
    ):
        selected = next(
            (
                item
                for item in candidates
                if item.intent is initial_intent and item.eligible
            ),
            None,
        )
        if selected is not None:
            final = _sync_promoted_copy(
                interpretation,
                intent=initial_intent,
                dog_name=dog_name,
                signals=signals,
                candidate=selected,
            )
            copy_source = "DECISION_FALLBACK"

    final = _ground_context_question(
        final,
        candidates=candidates,
        exit_supported=observation_supports_exit(observation),
    )

    ceiling = _confidence_ceiling(
        observation,
        knowledge,
        candidates,
        final.primary_intent,
    )
    rank = {
        ConfidenceBand.LOW: 0,
        ConfidenceBand.MEDIUM: 1,
        ConfidenceBand.HIGH: 2,
    }
    if rank[final.confidence_band] > rank[ceiling]:
        final = final.model_copy(update={"confidence_band": ceiling})
    if final.safety_flags:
        resolution = "SAFETY_PRESERVED"
        copy_source = "SAFETY"

    trace = BehaviorDecisionTrace(
        initial_intent=initial_intent,
        final_intent=final.primary_intent,
        resolution=resolution,
        scientific_coverage=knowledge.coverage,
        scientific_card_ids=[card.card_id for card in knowledge.cards],
        context_bucket=context_bucket,
        personal_pattern_ids=[
            item.pattern_id for item in final.personal_memory_used
        ],
        candidates=candidates,
        confidence_ceiling=ceiling,
        copy_source=copy_source,
    )
    return final, trace
