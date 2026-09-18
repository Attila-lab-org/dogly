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

from app.contracts.interpretation import EvidenceItem, InterpretationContract
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
from app.knowledge.models import KnowledgeContext

BEHAVIOR_DECISION_POLICY_VERSION = "behavior-decision/v1"


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
            {"body.stiff", "movement.withdrawal", "tail.tucked", "vocal.growl"}
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
        contradictions=frozenset({"movement.withdrawal", "target.external"}),
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
            frozenset({"movement.withdrawal", "ears.back"}),
            frozenset({"movement.withdrawal", "face.lip_lick"}),
            frozenset({"movement.withdrawal", "body.lowered"}),
        ),
        supporting=frozenset(
            {
                "movement.withdrawal",
                "ears.back",
                "face.lip_lick",
                "face.yawn",
                "body.lowered",
                "tail.below",
            }
        ),
        contradictions=frozenset({"movement.approach", "body.play_bow"}),
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

    if context_bucket is ContextBucket.DOOR_EXIT:
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


_PROMOTION_COPY: dict[IntentCode, tuple[str, str, str]] = {
    IntentCode.ALERT_VIGILANCE: (
        "{name} sembra molto attento a qualcosa fuori campo",
        (
            "{name} sembra aver concentrato l’attenzione su qualcosa che non vediamo. "
            "Non sappiamo che cosa abbia attirato la sua attenzione, quindi la lettura resta prudente."
        ),
        "«C’è qualcosa che ha attirato la mia attenzione.»",
    ),
    IntentCode.PLAY_INTERACTION: (
        "{name} sembra invitarti a giocare",
        "I segnali visibili sono compatibili con un invito all’interazione in questo momento.",
        "«Ti va di fare qualcosa insieme?»",
    ),
    IntentCode.OUTSIDE_REQUEST: (
        "{name} potrebbe volerti accompagnare verso l’uscita",
        "Orientamento e movimento rendono plausibile una richiesta legata all’uscita.",
        "«Possiamo andare verso la porta?»",
    ),
}


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
    evidence = list(interpretation.evidence)
    known_refs = {item.ref for item in evidence}
    for key in candidate.supporting_signals:
        signal = signals[key]
        if signal.ref not in known_refs:
            evidence.append(
                EvidenceItem(
                    source="observation",
                    ref=signal.ref,
                    description=signal.description,
                )
            )
            known_refs.add(signal.ref)
        if len(evidence) >= 3:
            break
    return interpretation.model_copy(
        update={
            "primary_intent": intent,
            "consumer_headline": headline,
            "consumer_summary": summary,
            "dog_voice": voice,
            "evidence": evidence[:5],
            "alternatives": [
                item for item in interpretation.alternatives if item.intent is not intent
            ][:2],
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

    if initial_intent in {None, IntentCode.INSUFFICIENT}:
        eligible = sorted(
            (item for item in candidates if item.eligible),
            key=lambda item: item.score,
            reverse=True,
        )
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
    elif (
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
