"""Deterministic Processing Context Companion planner.

Collects at most three OWNER_REPORTED facts while video analysis continues.
No LLM. Never asks the owner to annotate posture, emotion, or confidence.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import BehaviorEventStatus, ContextBucket
from app.domains.context_bucket import resolve_context_bucket
from app.knowledge.models import DogContextSnapshot
from app.providers.base import EligiblePatternSummary

QUESTION_BANK_VERSION = "processing-questions/v1"
PLANNER_VERSION = "processing-planner/v1"
MAX_PROCESSING_QUESTIONS = 3
OWNER_REPORTED = "OWNER_REPORTED"
COLLECTING_STATUSES = frozenset(
    {
        BehaviorEventStatus.DRAFT,
        BehaviorEventStatus.UPLOADING,
        BehaviorEventStatus.QUEUED,
        BehaviorEventStatus.OBSERVING,
        BehaviorEventStatus.FAILED_RETRYABLE,
    }
)
PROCESSING_CONTEXT_CLOSED_KEY = "processing_context_closed"
QUESTION_SHORT_LABELS: dict[str, str] = {
    "before_moment": "Prima",
    "usual_situation": "Situazione",
    "other_dog_present": "Altri cani",
    "target_known": "Conosceva",
    "freedom_to_move": "Libertà",
    "outside_trigger": "Fuori",
    "resource_nearby": "Vicino",
    "owner_interaction": "Tu",
    "familiar_place": "Posto",
    "behavior_seen_before": "Già visto",
    "recent_change": "Cambiamenti",
    "activity_today": "Attività",
    "appetite_today": "Appetito",
    "discomfort_today": "Fastidio",
    "owner_heard_vocalization": "Vocalizzazione",
}
UNKNOWN_GENERIC_QUESTION_IDS = frozenset(
    {
        "before_moment",
        "usual_situation",
        "behavior_seen_before",
        "recent_change",
        "owner_heard_vocalization",
    }
)


class QuestionOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str


class QuestionDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    text: str
    options: list[QuestionOption]
    buckets: frozenset[str] = Field(default_factory=frozenset)
    distinguish: int = 2
    video_blind: bool = True


class PlannedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    text: str
    options: list[QuestionOption]


class ProcessingOwnerFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: str
    answer_id: str
    label: str
    provenance: str = OWNER_REPORTED


_ALL = frozenset({item.value for item in ContextBucket})

QUESTION_BANK: dict[str, QuestionDef] = {
    "before_moment": QuestionDef(
        id="before_moment",
        text="Cosa stava succedendo subito prima?",
        options=[
            QuestionOption(id="nothing_special", label="Niente di particolare"),
            QuestionOption(id="interaction_play", label="Stavamo interagendo o giocando"),
            QuestionOption(id="new_stimulus", label="È successo o comparso qualcosa"),
            QuestionOption(id="not_sure", label="Non lo so"),
        ],
        buckets=frozenset({"HOME", "UNKNOWN", "REST", "OUTDOORS"}),
        distinguish=3,
    ),
    "other_dog_present": QuestionDef(
        id="other_dog_present",
        text="C’erano altri cani vicino a {name}?",
        options=[
            QuestionOption(id="yes_close", label="Sì, vicini"),
            QuestionOption(id="yes_distance", label="Sì, ma a distanza"),
            QuestionOption(id="no", label="No"),
            QuestionOption(id="not_sure", label="Non lo so"),
        ],
        buckets=frozenset({"WALK", "OUTDOORS", "OTHER_DOG"}),
        distinguish=3,
    ),
    "target_known": QuestionDef(
        id="target_known",
        text="{name} conosceva già quella persona o quel cane?",
        options=[
            QuestionOption(id="yes", label="Sì"),
            QuestionOption(id="no", label="No"),
            QuestionOption(id="partly", label="Lo aveva già visto qualche volta"),
            QuestionOption(id="not_sure", label="Non lo so"),
        ],
        buckets=frozenset({"STRANGER", "OTHER_DOG", "WALK"}),
        distinguish=3,
    ),
    "freedom_to_move": QuestionDef(
        id="freedom_to_move",
        text="{name} poteva allontanarsi liberamente?",
        options=[
            QuestionOption(id="free", label="Sì"),
            QuestionOption(id="leashed", label="Era al guinzaglio"),
            QuestionOption(id="confined", label="Era trattenuto o in uno spazio chiuso"),
            QuestionOption(id="not_sure", label="Non lo so"),
        ],
        buckets=frozenset(
            {"OUTDOORS", "WALK", "DOOR_EXIT", "STRANGER", "OTHER_DOG"}
        ),
        distinguish=3,
    ),
    "outside_trigger": QuestionDef(
        id="outside_trigger",
        text="C’era qualcosa fuori dalla porta o dalla finestra?",
        options=[
            QuestionOption(id="person", label="Una persona"),
            QuestionOption(id="dog", label="Un cane"),
            QuestionOption(id="sound", label="Un rumore"),
            QuestionOption(id="nothing_known", label="Niente che io abbia notato"),
        ],
        buckets=frozenset({"DOOR_EXIT", "HOME"}),
        distinguish=3,
    ),
    "resource_nearby": QuestionDef(
        id="resource_nearby",
        text="C’era qualcosa di importante per {name} lì vicino?",
        options=[
            QuestionOption(id="food", label="Cibo"),
            QuestionOption(id="toy_chew", label="Gioco o masticativo"),
            QuestionOption(id="resting_place", label="Cuccia o posto dove riposa"),
            QuestionOption(id="none", label="No"),
        ],
        buckets=frozenset({"FEEDING", "OTHER_DOG", "HOME"}),
        distinguish=2,
    ),
    "owner_interaction": QuestionDef(
        id="owner_interaction",
        text="Tu cosa stavi facendo con {name} in quel momento?",
        options=[
            QuestionOption(id="playing", label="Stavamo giocando"),
            QuestionOption(id="calling", label="Lo stavo chiamando"),
            QuestionOption(id="touching_handling", label="Lo stavo toccando o gestendo"),
            QuestionOption(id="nothing", label="Non stavo interagendo"),
        ],
        buckets=frozenset({"PLAY", "HANDLING", "FEEDING", "STRANGER"}),
        distinguish=2,
    ),
    "usual_situation": QuestionDef(
        id="usual_situation",
        text="Per {name} era una situazione normale?",
        options=[
            QuestionOption(id="usual", label="Sì, abituale"),
            QuestionOption(id="unusual", label="No, insolita"),
            QuestionOption(id="first_time", label="Era la prima volta"),
            QuestionOption(id="not_sure", label="Non lo so"),
        ],
        buckets=_ALL,
        distinguish=3,
    ),
    "familiar_place": QuestionDef(
        id="familiar_place",
        text="{name} conosce già questo posto?",
        options=[
            QuestionOption(id="familiar", label="Sì, lo conosce bene"),
            QuestionOption(id="somewhat", label="Ci è già stato qualche volta"),
            QuestionOption(id="new", label="No, è nuovo"),
            QuestionOption(id="not_sure", label="Non lo so"),
        ],
        buckets=frozenset({"OUTDOORS", "WALK", "VEHICLE"}),
        distinguish=2,
    ),
    "behavior_seen_before": QuestionDef(
        id="behavior_seen_before",
        text="Ti è già capitato di vedere {name} fare così?",
        options=[
            QuestionOption(id="often", label="Sì, più volte"),
            QuestionOption(id="sometimes", label="Qualche volta"),
            QuestionOption(id="first_time", label="È la prima volta"),
            QuestionOption(id="not_sure", label="Non ricordo"),
        ],
        buckets=frozenset({"PLAY", "HOME", "UNKNOWN"}),
        distinguish=2,
        video_blind=False,
    ),
    "recent_change": QuestionDef(
        id="recent_change",
        text="È cambiato qualcosa per {name} negli ultimi giorni?",
        options=[
            QuestionOption(id="people_animals", label="Persone o animali"),
            QuestionOption(id="routine_place", label="Routine o ambiente"),
            QuestionOption(id="other_change", label="Qualcos’altro"),
            QuestionOption(id="no", label="No"),
        ],
        buckets=frozenset({"VEHICLE", "HOME", "UNKNOWN"}),
        distinguish=1,
        video_blind=False,
    ),
    "activity_today": QuestionDef(
        id="activity_today",
        text="Oggi {name} è attivo come al solito?",
        options=[
            QuestionOption(id="usual", label="Sì"),
            QuestionOption(id="less", label="Meno del solito"),
            QuestionOption(id="more", label="Più del solito"),
            QuestionOption(id="not_sure", label="Non lo so"),
        ],
        buckets=frozenset({"REST", "HOME", "HANDLING"}),
        distinguish=1,
        video_blind=False,
    ),
    "appetite_today": QuestionDef(
        id="appetite_today",
        text="Oggi ha mangiato come al solito?",
        options=[
            QuestionOption(id="usual", label="Sì"),
            QuestionOption(id="less", label="Ha mangiato meno"),
            QuestionOption(id="more", label="Ha mangiato più del solito"),
            QuestionOption(id="not_yet_or_unsure", label="Non ancora / non lo so"),
        ],
        buckets=frozenset({"FEEDING"}),
        distinguish=1,
        video_blind=False,
    ),
    "discomfort_today": QuestionDef(
        id="discomfort_today",
        text="Oggi hai notato qualche fastidio fisico in {name}?",
        options=[
            QuestionOption(id="no", label="No"),
            QuestionOption(id="possible", label="Forse sì"),
            QuestionOption(id="known_issue", label="Sì, c’è già qualcosa che sto seguendo"),
            QuestionOption(id="not_sure", label="Non lo so"),
        ],
        buckets=frozenset({"HANDLING", "REST"}),
        distinguish=2,
        video_blind=False,
    ),
    "owner_heard_vocalization": QuestionDef(
        id="owner_heard_vocalization",
        text="Hai sentito {name} vocalizzare in quel momento?",
        options=[
            QuestionOption(id="bark", label="Abbaiava"),
            QuestionOption(id="growl", label="Ringhiava"),
            QuestionOption(id="whine", label="Guaiava o piagnucolava"),
            QuestionOption(id="none", label="No"),
        ],
        buckets=_ALL,
        distinguish=2,
        video_blind=True,
    ),
}

BUCKET_SEEDS: dict[str, tuple[str, ...]] = {
    "HOME": ("before_moment", "usual_situation", "outside_trigger"),
    "OUTDOORS": ("familiar_place", "other_dog_present", "freedom_to_move"),
    "WALK": ("other_dog_present", "target_known", "freedom_to_move"),
    "PLAY": ("owner_interaction", "usual_situation", "behavior_seen_before"),
    "FEEDING": ("resource_nearby", "owner_interaction", "appetite_today"),
    "DOOR_EXIT": ("outside_trigger", "usual_situation", "freedom_to_move"),
    "REST": ("before_moment", "activity_today", "discomfort_today"),
    "STRANGER": ("target_known", "freedom_to_move", "owner_interaction"),
    "OTHER_DOG": ("target_known", "freedom_to_move", "resource_nearby"),
    "VEHICLE": ("familiar_place", "usual_situation", "recent_change"),
    "HANDLING": ("owner_interaction", "discomfort_today", "usual_situation"),
    "UNKNOWN": ("before_moment", "usual_situation"),
}


def is_collecting_status(status: BehaviorEventStatus | str | None) -> bool:
    if status is None:
        return False
    value = status.value if isinstance(status, BehaviorEventStatus) else str(status)
    try:
        return BehaviorEventStatus(value) in COLLECTING_STATUSES
    except ValueError:
        return False


def is_collection_open(event: Any) -> bool:
    """Collection stays closed after the OBSERVING → INTERPRETING snapshot."""
    interp = getattr(event, "interpretation_json", None) or {}
    if isinstance(interp, dict) and interp.get(PROCESSING_CONTEXT_CLOSED_KEY):
        return False
    return is_collecting_status(getattr(event, "status", None))


def question_short_label(question_id: str) -> str:
    return QUESTION_SHORT_LABELS.get(question_id, "Contesto")


def snapshot_from_event(event: Any) -> list[dict[str, Any]] | None:
    interp = getattr(event, "interpretation_json", None) or {}
    if not isinstance(interp, dict) or not interp.get(PROCESSING_CONTEXT_CLOSED_KEY):
        return None
    value = interp.get("processing_owner_context")
    return list(value) if isinstance(value, list) else []


def merge_closed_snapshot(
    interp: dict[str, Any] | None, snapshot: list[dict[str, Any]]
) -> dict[str, Any]:
    merged = dict(interp or {})
    merged[PROCESSING_CONTEXT_CLOSED_KEY] = True
    merged["processing_owner_context"] = snapshot
    return merged


def accepted_answers_from_rows(rows: Iterable[Any]) -> list[dict[str, str]]:
    return [
        {
            "question_id": fact.question_id,
            "answer_id": fact.answer_id,
            "title": question_short_label(fact.question_id),
            "label": fact.label,
        }
        for fact in owner_facts_for_reasoner(rows)
    ]


def accepted_answers_for_event(event: Any, rows: Iterable[Any]) -> list[dict[str, str]]:
    snapshot = snapshot_from_event(event)
    if snapshot is None:
        return accepted_answers_from_rows(rows)
    return [
        {
            "question_id": str(item.get("question_id") or ""),
            "answer_id": str(item.get("answer_id") or ""),
            "title": question_short_label(str(item.get("question_id") or "")),
            "label": str(item.get("label") or ""),
        }
        for item in snapshot
        if item.get("question_id") and item.get("answer_id")
    ]


def answer_is_in_snapshot(snapshot: list[dict[str, Any]] | None, question_id: str) -> bool:
    return any(item.get("question_id") == question_id for item in snapshot or [])


def _as_bucket(context_bucket: ContextBucket | str | None) -> ContextBucket:
    if context_bucket is None:
        return ContextBucket.UNKNOWN
    if isinstance(context_bucket, ContextBucket):
        return context_bucket
    try:
        return ContextBucket(str(context_bucket))
    except ValueError:
        return ContextBucket.UNKNOWN


def _observation_contract(observation: dict[str, Any] | ObservationContract | None):
    if observation is None:
        return None
    if isinstance(observation, ObservationContract):
        return observation
    from pydantic import ValidationError

    try:
        return ObservationContract.model_validate(observation)
    except ValidationError:
        return None


def resolve_question(question_id: str, answer_id: str | None = None) -> QuestionDef:
    question = QUESTION_BANK.get(question_id)
    if question is None:
        raise ValueError("unknown_question")
    if answer_id is not None and answer_id not in {item.id for item in question.options}:
        raise ValueError("unknown_answer")
    return question


def render_question(question: QuestionDef, dog_name: str) -> PlannedQuestion:
    name = dog_name.strip() or "il cane"
    return PlannedQuestion(
        id=question.id,
        text=question.text.format(name=name),
        options=list(question.options),
    )


def owner_facts_for_reasoner(
    rows: Iterable[Any],
) -> list[ProcessingOwnerFact]:
    facts: list[ProcessingOwnerFact] = []
    for row in rows:
        skipped = bool(getattr(row, "skipped", False) or (isinstance(row, dict) and row.get("skipped")))
        question_id = getattr(row, "question_id", None) or (row.get("question_id") if isinstance(row, dict) else None)
        answer_id = getattr(row, "answer_id", None) or (row.get("answer_id") if isinstance(row, dict) else None)
        if skipped or not question_id or not answer_id:
            continue
        question = QUESTION_BANK.get(str(question_id))
        if question is None:
            continue
        label = next(
            (option.label for option in question.options if option.id == answer_id),
            str(answer_id),
        )
        facts.append(
            ProcessingOwnerFact(
                question_id=str(question_id),
                answer_id=str(answer_id),
                label=label,
            )
        )
    return facts


def _owner_off(dog_context: DogContextSnapshot | None) -> bool:
    if dog_context is None:
        return False
    for fact in dog_context.today_vs_usual:
        if str(fact.value).lower() in {"off", "unusual", "not_usual"}:
            return True
    return False


def _has_recent_change(dog_context: DogContextSnapshot | None) -> bool:
    if dog_context is None:
        return False
    return any(str(item.value).strip() for item in dog_context.recent_changes)


def _has_personal_memory(memory: list[EligiblePatternSummary] | None) -> bool:
    for item in memory or []:
        if str(item.state).upper() in {"ESTABLISHED", "STRONG", "CONFIRMED"}:
            return True
    return False


def _audio_missing(has_audio: bool, observation: dict[str, Any] | None) -> bool:
    if not has_audio:
        return True
    quality = (observation or {}).get("capture_quality") or {}
    return str(quality.get("audio_quality") or "").lower() in {
        "degraded",
        "insufficient",
        "none",
        "missing",
    }


def _quality_insufficient(observation: dict[str, Any] | None) -> bool:
    if not observation:
        return False
    quality = observation.get("capture_quality") or {}
    if str(quality.get("overall_quality") or "").lower() == "insufficient":
        return True
    fraction = quality.get("dog_visible_fraction")
    return isinstance(fraction, (int, float)) and fraction <= 0.0


def _score(
    question: QuestionDef,
    *,
    bucket: str,
    seeds: tuple[str, ...],
    has_audio: bool,
    observation: dict[str, Any] | None,
    owner_off: bool,
    recent_known: bool,
    memory_known: bool,
) -> int | None:
    if question.id in {"behavior_seen_before"} and memory_known:
        return None
    if question.id == "recent_change" and recent_known:
        return None
    if question.id == "other_dog_present" and bucket == "OTHER_DOG":
        return None
    if question.id == "owner_heard_vocalization" and not _audio_missing(
        has_audio, observation
    ):
        return None
    if question.id == "appetite_today" and bucket != "FEEDING" and not owner_off:
        return None
    if question.id == "activity_today" and bucket not in {"REST"} and not owner_off:
        return None
    if question.id == "discomfort_today" and bucket not in {"HANDLING", "REST"} and not owner_off:
        return None
    if question.id == "weather" or question.id == "temperature":
        return None
    if bucket == "UNKNOWN" and question.id not in UNKNOWN_GENERIC_QUESTION_IDS:
        return None

    score = 0
    score += question.distinguish
    if question.id in seeds:
        score += 2
    elif bucket in question.buckets:
        score += 1
    elif question.id not in {"owner_heard_vocalization", "usual_situation"}:
        score -= 3
    if bucket != "UNKNOWN" and question.id in {
        "freedom_to_move",
        "target_known",
        "discomfort_today",
    }:
        score += 2
    if question.video_blind:
        score += 1
    if not memory_known and question.id == "behavior_seen_before":
        score += 1
    if not recent_known and question.id == "recent_change":
        score += 1
    if owner_off and question.id in {"activity_today", "discomfort_today", "appetite_today"}:
        score += 2
    if question.id == "appetite_today" and bucket == "FEEDING":
        score += 3
    if question.id == "owner_heard_vocalization" and _audio_missing(has_audio, observation):
        score += 4
    if score <= 0:
        return None
    return score


def plan_next_question(
    *,
    dog_name: str,
    context_bucket: ContextBucket | str | None,
    has_audio: bool,
    occupied_question_ids: Iterable[str],
    dog_context: DogContextSnapshot | None = None,
    eligible_memory: list[EligiblePatternSummary] | None = None,
    observation: dict[str, Any] | ObservationContract | None = None,
    lifestyle: dict[str, Any] | None = None,
) -> PlannedQuestion | None:
    occupied = set(occupied_question_ids)
    if len(occupied) >= MAX_PROCESSING_QUESTIONS:
        return None
    if _quality_insufficient(observation):
        return None

    bucket = resolve_context_bucket(
        _as_bucket(context_bucket),
        observation=_observation_contract(observation),
        lifestyle=lifestyle,
        dog_context=dog_context,
    ).value
    seeds = BUCKET_SEEDS.get(bucket, BUCKET_SEEDS["UNKNOWN"])
    owner_off = _owner_off(dog_context)
    recent_known = _has_recent_change(dog_context)
    memory_known = _has_personal_memory(eligible_memory)

    ranked: list[tuple[int, int, QuestionDef]] = []
    order = {qid: index for index, qid in enumerate(QUESTION_BANK)}
    for question in QUESTION_BANK.values():
        if question.id in occupied:
            continue
        score = _score(
            question,
            bucket=bucket,
            seeds=seeds,
            has_audio=has_audio,
            observation=observation,
            owner_off=owner_off,
            recent_known=recent_known,
            memory_known=memory_known,
        )
        if score is None:
            continue
        ranked.append((score, -order[question.id], question))
    if not ranked:
        return None
    ranked.sort(reverse=True)
    return render_question(ranked[0][2], dog_name)
