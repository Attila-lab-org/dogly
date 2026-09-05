"""Dogly Signals domain.

Signals stores observable reactions to safe sound categories for one dog.
It never models a universal dog vocabulary or command compliance.
"""

from __future__ import annotations

from app.contracts.api import SignalExperimentCreate
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.taxonomy import (
    FeedbackValue,
    SignalCategory,
    SignalExperimentStatus,
    SignalMapState,
)
from app.domains.dogs import get_owned_dog
from app.domains.models import SignalExperimentRec, SignalMapEntryRec
from app.domains.repository import InMemoryStore, new_id, now_utc

SAFE_SOUND_KEYS: dict[SignalCategory, frozenset[str]] = {
    SignalCategory.ATTENTION: frozenset({"attention-soft-01"}),
    SignalCategory.PLAY: frozenset({"play-invite-01"}),
    SignalCategory.CONTACT: frozenset({"contact-call-01"}),
    SignalCategory.CURIOSITY: frozenset({"curiosity-soft-01"}),
}

BEHAVIOR_SENTENCES = {
    "HEAD_TURN": "ha girato la testa",
    "EAR_RAISE": "ha alzato le orecchie",
    "APPROACH": "si è avvicinato",
    "PLAY_READY": "si è preparato al gioco",
    "STILL_ATTENTIVE": "è rimasto attento",
}


def result_summary(dog_name: str, behaviors: list) -> str:
    values = [behavior.value for behavior in behaviors]
    if "NO_VISIBLE_RESPONSE" in values:
        return f"{dog_name} non ha mostrato una reazione evidente."
    sentences = [BEHAVIOR_SENTENCES[value] for value in values if value in BEHAVIOR_SENTENCES]
    if len(sentences) == 1:
        return f"{dog_name} {sentences[0]}."
    return f"{dog_name} {', '.join(sentences[:-1])} e {sentences[-1]}."


def list_signal_map(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
) -> list[SignalMapEntryRec]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    ensure_signal_map(store, user_id=user_id, dog_id=dog_id)
    return [
        store.signal_map_entries[(dog_id, category.value)]
        for category in SignalCategory
    ]


def list_signal_experiments(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
) -> list[SignalExperimentRec]:
    get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    return sorted(
        [
            experiment
            for experiment in store.signal_experiments.values()
            if experiment.user_id == user_id and experiment.dog_id == dog_id
        ],
        key=lambda experiment: (experiment.created_at, experiment.id),
        reverse=True,
    )


def create_signal_experiment(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
    payload: SignalExperimentCreate,
) -> SignalExperimentRec:
    dog = get_owned_dog(store, user_id=user_id, dog_id=dog_id)
    existing = next(
        (
            item
            for item in store.signal_experiments.values()
            if item.user_id == user_id and item.client_request_id == payload.client_request_id
        ),
        None,
    )
    if existing:
        return existing
    if payload.sound_key not in SAFE_SOUND_KEYS[payload.category]:
        raise ApiError(ErrorCode.VALIDATION_FAILED, "Sound key is not allowed for this category.")

    now = now_utc()
    experiment = SignalExperimentRec(
        id=new_id(),
        dog_id=dog_id,
        user_id=user_id,
        client_request_id=payload.client_request_id,
        category=payload.category,
        sound_key=payload.sound_key,
        status=SignalExperimentStatus.COMPLETED,
        observed_behaviors=payload.observed_behaviors,
        reaction_latency_ms=payload.reaction_latency_ms,
        result_summary=result_summary(dog.name, payload.observed_behaviors),
        owner_feedback=payload.owner_feedback,
        created_at=now,
    )
    store.signal_experiments[experiment.id] = experiment
    update_signal_map(store, experiment)
    return experiment


def ensure_signal_map(
    store: InMemoryStore,
    *,
    user_id: str,
    dog_id: str,
) -> None:
    now = now_utc()
    for category in SignalCategory:
        key = (dog_id, category.value)
        if key not in store.signal_map_entries:
            store.signal_map_entries[key] = SignalMapEntryRec(
                dog_id=dog_id,
                user_id=user_id,
                category=category,
                updated_at=now,
            )


def update_signal_map(store: InMemoryStore, experiment: SignalExperimentRec) -> None:
    ensure_signal_map(store, user_id=experiment.user_id, dog_id=experiment.dog_id)
    key = (experiment.dog_id, experiment.category.value)
    entry = store.signal_map_entries[key]
    confirm_count = entry.confirm_count + int(experiment.owner_feedback == FeedbackValue.YES)
    contradict_count = entry.contradict_count + int(experiment.owner_feedback == FeedbackValue.NO)
    unknown_count = entry.unknown_count + int(experiment.owner_feedback == FeedbackValue.UNKNOWN)
    attempt_count = entry.attempt_count + 1
    state = SignalMapState.DISCOVERING
    if attempt_count >= 3 and confirm_count >= 2:
        state = SignalMapState.RECURRING
    elif attempt_count >= 2:
        state = SignalMapState.LEARNING

    store.signal_map_entries[key] = entry.model_copy(
        update={
            "attempt_count": attempt_count,
            "confirm_count": confirm_count,
            "contradict_count": contradict_count,
            "unknown_count": unknown_count,
            "state": state,
            "last_summary": experiment.result_summary,
            "updated_at": now_utc(),
        }
    )


def next_signal_category(entries: list[SignalMapEntryRec]) -> SignalCategory:
    return min(entries, key=lambda entry: (entry.attempt_count, entry.category.value)).category
