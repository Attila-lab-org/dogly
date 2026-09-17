"""Private worker handlers (Spec V1 sez. 8.2 / 7.2 / 14).

Push-based retryable task handlers behind an internal-only HTTP surface.
Semantics:
- Acquire the event; terminal completed state is a no-op on duplicate
  delivery (sez. 22: duplicate queue delivery).
- observer -> reasoner orchestration with validated contracts.
- COMPLETED commits the quota reservation; REJECTED_QUALITY (before
  meaningful AI work) and FAILED_TERMINAL refund it (sez. 7.3).
- The worker NEVER mutates Personal Patterns from generative output; pattern
  updates go through the deterministic Personal Intelligence service.
"""

from __future__ import annotations

import gzip
import json
import logging

from sqlalchemy import text

from app.api.deps import AppState
from app.contracts.errors import ApiError, ErrorCode
from app.contracts.interpretation import (
    ContextOption,
    InterpretationContract,
    OwnerContextAnswer,
    PersonalMemoryUsed,
)
from app.contracts.observation import ObservationContract
from app.contracts.taxonomy import (
    BEHAVIOR_EVENT_TRANSITIONS,
    ELIGIBLE_PATTERN_STATES,
    INTERPRETATION_POLICY_VERSION,
    TERMINAL_EVENT_STATUSES,
    AnalysisDomain,
    BehaviorEventStatus,
    ConfidenceBand,
    ContextBucket,
    IntentCode,
    RetentionState,
)
from app.domains import (
    behavior_db,
    care_db,
    consents_db,
    devices_db,
    digestive_db,
    dogs_db,
    lifestyle_db,
    owner_stories_db,
    patterns_db,
    privacy_db,
    profiles_db,
)
from app.domains import lifestyle as lifestyle_domain
from app.domains import privacy as privacy_domain
from app.domains.behavior_intelligence import build_behavior_consumer
from app.domains.billing import QuotaService
from app.domains.consents import get_consents
from app.domains.context_bucket import resolve_context_bucket
from app.domains.digestive import (
    build_inmemory_digestive_context,
    contextual_safety_flags,
)
from app.domains.digestive_intelligence import build_digestive_intelligence
from app.domains.dog_context import build_dog_context
from app.domains.intelligence_context import build_dog_intelligence_context
from app.domains.models import BehaviorEventRec
from app.domains.repository import now_utc
from app.domains.retention import (
    arm_behavior_capture_expiry,
    arm_fecal_expiry,
    cleanup_expired_raw_media,
    cleanup_expired_raw_media_db,
    schedule_behavior_raw_expiry,
    schedule_digestive_raw_expiry,
)
from app.knowledge.advice import build_advice
from app.knowledge.models import LifestyleFact
from app.knowledge.retrieval import retrieve_evidence
from app.knowledge.safety import (
    deterministic_safety_flags as behavior_safety_flags,
)
from app.knowledge.safety import merge_safety_flags
from app.providers import supabase_auth_admin
from app.providers.base import EligiblePatternSummary, ProviderRateLimitError
from app.providers.budget import BudgetExceededError
from app.providers.expo_push import send_push

MAX_TASK_ATTEMPTS = 5
logger = logging.getLogger(__name__)


class InvalidTransition(Exception):
    pass


class RetryableTaskError(Exception):
    """Transient task failure: the event is durably persisted as
    FAILED_RETRYABLE and the raised error signals the platform (Vercel
    Workflows step retry with backoff, sez. 22) to re-run the task.
    Exhausted attempts and non-retryable failures (e.g. budget errors) never
    raise this: they resolve to a normal FAILED_TERMINAL result."""

    def __init__(self, payload: dict):
        super().__init__(payload["error"])
        self.payload = payload


async def _claim_analysis_job(state: AppState, *, event_id: str) -> bool:
    """Claim a PENDING/RETRYING job. False means another worker already holds it."""
    if state.engine is None:
        claimed = False
        found = False
        for job in state.store.analysis_jobs.values():
            if job.event_id != event_id or job.job_type not in {
                "behavior_analysis",
                "digestive_analysis",
            }:
                continue
            found = True
            if job.status in {"queued", "PENDING", "RETRYING", "pending"}:
                job.status = "RUNNING"
                job.attempt_count += 1
                job.updated_at = now_utc()
                claimed = True
            elif job.status == "RUNNING":
                claimed = False
            else:
                claimed = True
        return claimed or not found
    async with state.engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update internal.analysis_jobs
                    set status = 'RUNNING',
                        attempt_count = attempt_count + 1,
                        started_at = coalesce(started_at, now()),
                        completed_at = null,
                        last_error_code = null,
                        updated_at = now()
                    where event_id = :event_id
                      and (
                        status in ('PENDING', 'RETRYING')
                        or (
                          status = 'RUNNING'
                          and updated_at < now() - interval '10 minutes'
                        )
                      )
                    returning id
                    """
                ),
                {"event_id": event_id},
            )
        ).mappings().first()
        if row:
            return True
        existing = (
            await conn.execute(
                text(
                    """
                    select status from internal.analysis_jobs
                    where event_id = :event_id
                    """
                ),
                {"event_id": event_id},
            )
        ).mappings().first()
        return not (existing and str(existing["status"]) == "RUNNING")


async def _set_analysis_job_status(
    state: AppState,
    *,
    event_id: str,
    status: str,
    error_code: str | None = None,
) -> None:
    if state.engine is None:
        for job in state.store.analysis_jobs.values():
            if job.event_id != event_id or job.job_type not in {
                "behavior_analysis",
                "digestive_analysis",
            }:
                continue
            job.status = status
            job.last_error_code = error_code
            job.updated_at = now_utc()
        return
    if status == "RUNNING":
        assignments = """
            status = 'RUNNING',
            started_at = coalesce(started_at, now()),
            completed_at = null,
            last_error_code = null,
            updated_at = now()
        """
    elif status == "RETRYING":
        assignments = """
            status = 'RETRYING',
            last_error_code = :error_code,
            completed_at = null,
            updated_at = now()
        """
    else:
        assignments = """
            status = :status,
            last_error_code = :error_code,
            completed_at = now(),
            updated_at = now()
        """
    async with state.engine.begin() as conn:
        await conn.execute(
            text(
                f"""
                update internal.analysis_jobs
                set {assignments}
                where event_id = :event_id
                """
            ),
            {
                "event_id": event_id,
                "status": status,
                "error_code": error_code,
            },
        )


def transition(event: BehaviorEventRec, to: BehaviorEventStatus) -> None:
    """Enforce the behavior state machine (sez. 7.2 / Appendix A)."""
    allowed = BEHAVIOR_EVENT_TRANSITIONS.get(event.status, frozenset())
    if to not in allowed:
        raise InvalidTransition(f"{event.status} -> {to} is not an allowed transition")
    event.status = to


async def _eligible_memory(state: AppState, dog_id: str) -> list[EligiblePatternSummary]:
    """Only eligible pattern summaries reach the reasoner (sez. 16.1/17.2);
    never the unfiltered history."""
    if state.engine is not None:
        return await patterns_db.list_eligible_for_reasoner(state.engine, dog_id=dog_id)
    return [
        EligiblePatternSummary(
            pattern_id=p.id,
            state=p.state.value,
            title=p.title,
            support_summary=f"support={p.support_count} confirm={p.confirm_count}",
        )
        for p in state.store.patterns.values()
        if p.dog_id == dog_id and p.state in ELIGIBLE_PATTERN_STATES
    ]


async def _dog_context(state: AppState, event: BehaviorEventRec):
    if state.engine is not None:
        dog = await dogs_db.get_owned_dog(
            state.engine, user_id=event.user_id, dog_id=event.dog_id
        )
        lifestyle = await lifestyle_db.get_lifestyle(
            state.engine, event.user_id, event.dog_id
        )
        stories = await owner_stories_db.list_confirmed(
            state.engine, user_id=event.user_id, dog_id=event.dog_id
        )
    else:
        dog = state.store.dogs[event.dog_id]
        lifestyle = lifestyle_domain.get_lifestyle(
            state.store, event.user_id, event.dog_id
        )
        stories = [
            row
            for row in state.store.owner_reported_observations.values()
            if row.get("dog_id") == event.dog_id
            and row.get("user_id") == event.user_id
            and row.get("status") == "CONFIRMED"
        ]
    dump = lifestyle.model_dump()
    owner_display_name = await _owner_display_name(state, event.user_id)
    context = build_dog_context(
        dog, dump, owner_display_name=owner_display_name
    )
    routine = dict(context.routine)
    extras: dict[str, list] = {
        "preferences": list(context.preferences),
        "health_context": list(context.health_context),
        "recent_changes": list(context.recent_changes),
        "owner_reported": list(context.owner_reported),
    }
    for story in stories:
        facts = story.get("facts") or []
        if isinstance(facts, str):
            facts = json.loads(facts)
        confirmed_at = story.get("confirmed_at")
        for fact in facts:
            if not isinstance(fact, dict):
                continue
            statement = str(fact.get("statement") or "").strip()
            if not statement:
                continue
            category = str(fact.get("category") or "GENERAL")
            item = LifestyleFact(
                key=f"owner_{category.lower()}",
                value=statement,
                provenance="OWNER_CONFIRMED",
                last_confirmed_at=confirmed_at,
            )
            if category == "PREFERENCE":
                extras["preferences"].append(item)
            elif category in {"HEALTH", "DIET"}:
                extras["health_context"].append(item)
            elif category == "ROUTINE":
                fact_id = str(fact.get("id") or len(routine))
                routine[f"owner_{fact_id}"] = item
            else:
                extras["owner_reported"].append(item)
    return dog, context.model_copy(update={**extras, "routine": routine}), dump


async def notify_analysis_failure(
    state: AppState,
    *,
    user_id: str,
    event_id: str,
    domain: str,
) -> None:
    """Push on terminal analysis failure. Never raise — delivery is best-effort."""
    try:
        tokens = await _notification_tokens(state, user_id)
        if domain == "DIGESTIVE":
            href = f"/digestive/processing/{event_id}"
            body = (
                "Non siamo riusciti ad analizzare la foto. "
                "Nessun addebito: puoi riprovare quando vuoi."
            )
        else:
            href = f"/behavior/processing/{event_id}"
            body = (
                "Non siamo riusciti ad analizzare il video. "
                "Nessun addebito: puoi riprovare quando vuoi."
            )
        await send_push(
            tokens,
            title="Analisi non riuscita",
            body=body,
            data={"href": href, "event_id": event_id},
        )
    except Exception:
        logger.exception("Could not send analysis failure notification")


async def notify_analysis_quality_rejected(
    state: AppState,
    *,
    user_id: str,
    event_id: str,
    domain: str,
) -> None:
    """Tell users who left the processing screen that a new capture is needed."""
    try:
        tokens = await _notification_tokens(state, user_id)
        if domain == "DIGESTIVE":
            href = f"/digestive/processing/{event_id}"
            body = (
                "La foto non è abbastanza chiara per un risultato affidabile. "
                "L'analisi non è stata conteggiata: puoi rifarla."
            )
        else:
            href = f"/behavior/processing/{event_id}"
            body = (
                "Nel video non riesco a osservare bene il cane. "
                "L'analisi non è stata conteggiata: puoi registrarlo di nuovo."
            )
        await send_push(
            tokens,
            title="Serve una nuova acquisizione",
            body=body,
            data={"href": href, "event_id": event_id},
        )
    except Exception:
        logger.exception("Could not send quality-rejected notification")


async def _notification_tokens(state: AppState, user_id: str) -> list[str]:
    if state.engine is not None:
        return await devices_db.list_notification_tokens(state.engine, user_id)
    if not get_consents(state.store, user_id).notifications:
        return []
    return [
        device.push_token
        for device in state.store.devices.values()
        if device.user_id == user_id
    ]


async def _arm_behavior_raw_ttl(state: AppState, event: BehaviorEventRec) -> None:
    consents = (
        await consents_db.get_consents(state.engine, event.user_id)
        if state.engine is not None
        else get_consents(state.store, event.user_id)
    )
    if consents.media_retention:
        if state.engine is not None:
            async with state.engine.begin() as conn:
                await conn.execute(
                    text(
                        """
                        update public.behavior_captures
                        set retention_state = 'USER_KEPT', expires_at = null
                        where id = :capture_id
                        """
                    ),
                    {"capture_id": event.capture_id},
                )
            return
        capture = state.store.captures.get(event.capture_id)
        if capture is not None:
            capture.retention_state = RetentionState.USER_KEPT
            capture.expires_at = None
        return
    if state.engine is not None:
        await arm_behavior_capture_expiry(state.engine, event.capture_id)
        return
    capture = state.store.captures.get(event.capture_id)
    if capture is not None:
        schedule_behavior_raw_expiry(capture, state.settings)


def _ground_personal_memory(
    interpretation: InterpretationContract,
    eligible_memory: list[EligiblePatternSummary],
) -> InterpretationContract:
    """Accept only pattern IDs supplied to the model and restore server truth."""
    eligible_by_id = {item.pattern_id: item for item in eligible_memory}
    grounded: list[PersonalMemoryUsed] = []
    seen: set[str] = set()
    for claimed in interpretation.personal_memory_used:
        source = eligible_by_id.get(claimed.pattern_id)
        if source is None or source.pattern_id in seen:
            continue
        seen.add(source.pattern_id)
        grounded.append(
            PersonalMemoryUsed(
                pattern_id=source.pattern_id,
                state=source.state,
                support_summary=source.support_summary,
            )
        )
    return interpretation.model_copy(update={"personal_memory_used": grounded})


def _enforce_capture_modalities(
    observation: ObservationContract,
    *,
    has_audio: bool,
) -> ObservationContract:
    """Muted captures cannot create audible evidence or audio safety flags."""
    if has_audio:
        return observation
    raw = observation.model_dump(mode="json")
    raw["capture_quality"]["audio_quality"] = "absent"
    raw["vocalization"] = {
        "present": "no",
        "type_candidates": [],
        "count": 0,
        "relative_pitch": "unknown",
        "intensity": "unknown",
        "rhythm": "unknown",
        "interval_pattern": "unknown",
        "timing": "unknown",
    }
    return ObservationContract.model_validate(raw)


def _calibrated_confidence(
    interpretation: InterpretationContract,
    observation: ObservationContract,
    knowledge_coverage: str,
) -> ConfidenceBand:
    if (
        knowledge_coverage == "LOW"
        or interpretation.primary_intent in {None, IntentCode.INSUFFICIENT}
    ):
        return ConfidenceBand.LOW
    if (
        observation.capture_quality.overall_quality != "good"
        and interpretation.confidence_band == ConfidenceBand.HIGH
    ):
        return ConfidenceBand.MEDIUM
    return interpretation.confidence_band


async def _fail(state: AppState, event: BehaviorEventRec, code: ErrorCode, retryable: bool) -> dict:
    event.last_error_code = code.value
    quota = QuotaService(state.store, engine=state.engine)
    if retryable and event.attempt_count < MAX_TASK_ATTEMPTS:
        transition(event, BehaviorEventStatus.FAILED_RETRYABLE)
        if state.engine is not None:
            await behavior_db.save_event_state(state.engine, event)
        await _set_analysis_job_status(
            state,
            event_id=event.id,
            status="RETRYING",
            error_code=code.value,
        )
        # The transient failure MUST propagate: only a raised error makes the
        # workflow step fail so the platform retries with backoff (sez. 22).
        raise RetryableTaskError(
            {"event_id": event.id, "status": event.status.value, "error": code.value}
        )
    # Terminal: refund the reservation once (sez. 7.3 / 22).
    if event.status in (
        BehaviorEventStatus.QUEUED,
        BehaviorEventStatus.OBSERVING,
        BehaviorEventStatus.INTERPRETING,
        BehaviorEventStatus.FAILED_RETRYABLE,
    ):
        transition(event, BehaviorEventStatus.FAILED_TERMINAL)
    else:
        raise InvalidTransition(f"cannot fail terminally from {event.status}")
    if not event.quota_refunded and not event.quota_committed:
        await quota.refund(event.user_id, AnalysisDomain.BEHAVIOR, reference_id=event.id)
        event.quota_refunded = True
    event.completed_at = now_utc()
    await _arm_behavior_raw_ttl(state, event)
    if state.engine is not None:
        await behavior_db.save_event_state(state.engine, event)
    await _set_analysis_job_status(
        state,
        event_id=event.id,
        status="FAILED",
        error_code=code.value,
    )
    await notify_analysis_failure(
        state,
        user_id=event.user_id,
        event_id=event.id,
        domain="BEHAVIOR",
    )
    return {"event_id": event.id, "status": event.status.value, "error": code.value}


async def fail_stuck_analysis(
    state: AppState,
    *,
    event_id: str,
    domain: str,
) -> bool:
    """Force a stuck event to FAILED_TERMINAL, refund quota, notify the owner."""
    quota = QuotaService(state.store, engine=state.engine)
    if domain == "BEHAVIOR":
        if state.engine is not None:
            event = await behavior_db.load_event(state.engine, event_id=event_id)
            if event is not None:
                state.store.behavior_events[event.id] = event
        else:
            event = state.store.behavior_events.get(event_id)
        if event is None or event.status in TERMINAL_EVENT_STATUSES:
            return False
        await _fail(state, event, ErrorCode.PROCESSING_TIMEOUT, retryable=False)
        return True

    if state.engine is not None:
        event = await digestive_db.load_fecal_event(state.engine, event_id=event_id)
        if event is not None:
            state.store.fecal_events[event.id] = event
    else:
        event = state.store.fecal_events.get(event_id)
    if event is None or event.status in (
        "COMPLETED",
        "REJECTED_QUALITY",
        "FAILED_TERMINAL",
    ):
        return False
    event.status = "FAILED_TERMINAL"
    event.last_error_code = ErrorCode.PROCESSING_TIMEOUT.value
    if not event.quota_refunded and not event.quota_committed:
        await quota.refund(
            event.user_id,
            AnalysisDomain.DIGESTIVE,
            reference_id=event.id,
        )
        event.quota_refunded = True
    event.completed_at = now_utc()
    schedule_digestive_raw_expiry(event, state.settings)
    if state.engine is not None:
        await digestive_db.save_fecal_state(state.engine, event)
        await arm_fecal_expiry(state.engine, event.id)
    await _set_analysis_job_status(
        state,
        event_id=event.id,
        status="FAILED",
        error_code=ErrorCode.PROCESSING_TIMEOUT.value,
    )
    await notify_analysis_failure(
        state,
        user_id=event.user_id,
        event_id=event.id,
        domain="DIGESTIVE",
    )
    return True


async def process_behavior_event(state: AppState, *, event_id: str) -> dict:
    """Behavior analysis handler: QUEUED -> OBSERVING -> INTERPRETING ->
    COMPLETED / REJECTED_QUALITY / FAILED_* (sez. 7.2). Idempotent."""
    if state.engine is not None:
        event = await behavior_db.load_event(state.engine, event_id=event_id)
        if event is None:
            return {"event_id": event_id, "status": "ignored_unknown_event"}
        # Mirror into memory for helpers that still read store (TTL arming).
        state.store.behavior_events[event.id] = event
        capture = await behavior_db.load_capture(state.engine, capture_id=event.capture_id)
        if capture is None:
            return {"event_id": event_id, "status": "ignored_unknown_capture"}
        state.store.captures[capture.id] = capture
    else:
        event = state.store.behavior_events.get(event_id)
        if event is None:
            return {"event_id": event_id, "status": "ignored_unknown_event"}
        capture = state.store.captures[event.capture_id]

    if event.status in TERMINAL_EVENT_STATUSES:
        await _set_analysis_job_status(
            state,
            event_id=event.id,
            status=(
                "FAILED"
                if event.status == BehaviorEventStatus.FAILED_TERMINAL
                else "COMPLETED"
            ),
            error_code=event.last_error_code,
        )
        return {"event_id": event.id, "status": event.status.value, "noop": True}

    if not await _claim_analysis_job(state, event_id=event.id):
        return {"event_id": event.id, "status": "already_running", "noop": True}

    await _set_analysis_job_status(
        state,
        event_id=event.id,
        status="RUNNING",
    )
    event.attempt_count += 1
    quota = QuotaService(state.store, engine=state.engine)

    observation: ObservationContract | None = None
    if (
        event.status
        in {
            BehaviorEventStatus.INTERPRETING,
            BehaviorEventStatus.FAILED_RETRYABLE,
        }
        and event.observation_json
    ):
        # Resume after a crash between observer and reasoner without paying for
        # the same video observation twice.
        observation = ObservationContract.model_validate(event.observation_json)
        if event.status == BehaviorEventStatus.FAILED_RETRYABLE:
            transition(event, BehaviorEventStatus.OBSERVING)
            transition(event, BehaviorEventStatus.INTERPRETING)
            if state.engine is not None:
                await behavior_db.save_event_state(state.engine, event)
    else:
        # QUEUED/FAILED_RETRYABLE enter OBSERVING. An OBSERVING redelivery
        # resumes in place; old INTERPRETING rows without an observation restart.
        if event.status != BehaviorEventStatus.OBSERVING:
            if event.status == BehaviorEventStatus.INTERPRETING:
                event.status = BehaviorEventStatus.OBSERVING
            else:
                transition(event, BehaviorEventStatus.OBSERVING)
        if state.engine is not None:
            await behavior_db.save_event_state(state.engine, event)
        try:
            video_ref = capture.storage_path
            # Real observers need an HTTPS media URI; mint a short-lived signed read URL.
            create_read = getattr(state.storage, "create_signed_read_url", None)
            if callable(create_read) and state.settings.observer_provider != "mock":
                from app.domains.behavior import BEHAVIOR_BUCKET

                video_ref = await create_read(
                    bucket=BEHAVIOR_BUCKET,
                    path=capture.storage_path,
                    ttl_seconds=min(state.settings.storage_signed_url_ttl_seconds, 600),
                )
            observe_kwargs: dict = {
                "video_ref": video_ref,
                "content_type": capture.content_type,
                "policy_version": INTERPRETATION_POLICY_VERSION,
                "duration_ms": capture.duration_ms,
            }
            if state.settings.morphology_observer_context_v1:
                if state.engine is not None:
                    observer_dog = await dogs_db.get_owned_dog(
                        state.engine, user_id=event.user_id, dog_id=event.dog_id
                    )
                else:
                    observer_dog = state.store.dogs[event.dog_id]
                morphology = build_dog_intelligence_context(
                    observer_dog,
                    domain="behavior",
                    settings=state.settings,
                ).observer_payload()
                if morphology:
                    observe_kwargs["morphology_context"] = morphology
            observation, obs_usage = await state.observer.observe(**observe_kwargs)
        except TimeoutError:
            return await _fail(state, event, ErrorCode.PROVIDER_TIMEOUT, retryable=True)
        except BudgetExceededError:
            return await _fail(
                state,
                event,
                ErrorCode.AI_BUDGET_EXCEEDED,
                retryable=False,
            )
        except ProviderRateLimitError:
            # Provider quota/rate exhaustion is not helped by rapid workflow
            # retries: stop after one call and refund the user's reservation.
            return await _fail(
                state,
                event,
                ErrorCode.RATE_LIMITED,
                retryable=False,
            )
        except Exception:
            logger.exception(
                "Behavior observer failed for event %s on attempt %s",
                event.id,
                event.attempt_count,
            )
            return await _fail(state, event, ErrorCode.PROCESSING_FAILED, retryable=True)
        await state.cost_meter.record(
            usage=obs_usage,
            operation="observer.observe",
            domain=AnalysisDomain.BEHAVIOR,
            event_id=event.id,
            user_id=event.user_id,
        )
        event.observation_json = observation.model_dump(mode="json")

    observation = _enforce_capture_modalities(
        observation,
        has_audio=capture.has_audio,
    )
    event.observation_json = observation.model_dump(mode="json")
    # Server/provider quality gate (sez. 13): dog not observable -> reject
    # before meaningful AI work and refund the reservation (sez. 7.3).
    quality = observation.capture_quality
    if quality.overall_quality == "insufficient" or (quality.dog_visible_fraction or 0.0) <= 0.0:
        transition(event, BehaviorEventStatus.REJECTED_QUALITY)
        if not event.quota_refunded and not event.quota_committed:
            await quota.refund(event.user_id, AnalysisDomain.BEHAVIOR, reference_id=event.id)
            event.quota_refunded = True
        event.completed_at = now_utc()
        await _arm_behavior_raw_ttl(state, event)
        if state.engine is not None:
            await behavior_db.save_event_state(state.engine, event)
        await _set_analysis_job_status(
            state,
            event_id=event.id,
            status="COMPLETED",
        )
        await notify_analysis_quality_rejected(
            state,
            user_id=event.user_id,
            event_id=event.id,
            domain="BEHAVIOR",
        )
        return {"event_id": event.id, "status": event.status.value}

    # Persist the observer checkpoint before entering the paid reasoner step.
    if event.status != BehaviorEventStatus.INTERPRETING:
        transition(event, BehaviorEventStatus.INTERPRETING)
        if state.engine is not None:
            await behavior_db.save_event_state(state.engine, event)
    try:
        dog, dog_context, lifestyle_dump = await _dog_context(state, event)
        context_bucket = resolve_context_bucket(
            capture.context_bucket,
            observation=observation,
            lifestyle=lifestyle_dump,
            dog_context=dog_context,
        )
        capture.context_bucket = context_bucket
        knowledge_context = retrieve_evidence(
            observation, context_bucket, dog_context
        )
        intelligence = build_dog_intelligence_context(
            dog,
            dog_context,
            domain="behavior",
            settings=state.settings,
        )
        # Sicurezza deterministica PRIMA dell'LLM (stesse regole SAFE_*_001 del
        # retrieval, fonte unica in knowledge.safety): il reasoner le riceve
        # come vincoli stabiliti e il merge finale le rende effettive anche se
        # l'LLM non emette flag (gate urgente Advice Engine, sez. 16.3/19.3).
        det_flags = behavior_safety_flags(observation, dog_context)
        eligible_memory = await _eligible_memory(state, event.dog_id)
        from app.domains import processing_context_store
        from app.domains.processing_context import owner_facts_for_reasoner

        if state.engine is not None:
            processing_rows = await processing_context_store.list_answers_db(
                state.engine, event_id=event.id, user_id=event.user_id
            )
        else:
            processing_rows = processing_context_store.list_answers(
                state.store, event_id=event.id, user_id=event.user_id
            )
        processing_owner_context = [
            item.model_dump(mode="json")
            for item in owner_facts_for_reasoner(processing_rows)
        ]
        interpret_kwargs: dict = {
            "observation": observation,
            "context_bucket": context_bucket,
            "policy_version": INTERPRETATION_POLICY_VERSION,
            "eligible_memory": eligible_memory,
            "knowledge_context": knowledge_context,
            "dog_context": dog_context,
            "dog_name": dog.name,
            "owner_context_answer": None,
            "deterministic_safety_flags": det_flags,
            "processing_owner_context": processing_owner_context,
        }
        if any(intelligence.flags.values()):
            interpret_kwargs["intelligence_context"] = intelligence.reasoner_payload()
        interpretation, rea_usage = await state.reasoner.interpret(**interpret_kwargs)
        interpretation = _ground_personal_memory(
            interpretation,
            eligible_memory,
        )
        interpretation = interpretation.model_copy(
            update={
                "safety_flags": merge_safety_flags(
                    interpretation.safety_flags, det_flags
                ),
                "context_effect": None,
            }
        )
        confidence = _calibrated_confidence(
            interpretation,
            observation,
            knowledge_context.coverage,
        )
        if confidence != interpretation.confidence_band:
            interpretation = interpretation.model_copy(
                update={"confidence_band": confidence}
            )
    except TimeoutError:
        return await _fail(state, event, ErrorCode.PROVIDER_TIMEOUT, retryable=True)
    except BudgetExceededError:
        # Budget exhaustion is operational, not transient (sez. 25):
        # always a NON-retryable terminal failure — retrying would burn
        # budget. Never raises RetryableTaskError.
        return await _fail(state, event, ErrorCode.AI_BUDGET_EXCEEDED, retryable=False)
    except Exception:
        # follow the one-repair-then-terminal path (sez. 22), never crash the worker.
        logger.exception(
            "Behavior reasoner failed for event %s on attempt %s",
            event.id,
            event.attempt_count,
        )
        return await _fail(state, event, ErrorCode.PROVIDER_SCHEMA_INVALID, retryable=True)
    await state.cost_meter.record(
        usage=rea_usage,
        operation="reasoner.interpret",
        domain=AnalysisDomain.BEHAVIOR,
        event_id=event.id,
        user_id=event.user_id,
    )

    # INTERPRETING -> COMPLETED: persist event + finalize quota (sez. 7.2).
    transition(event, BehaviorEventStatus.COMPLETED)
    try:
        advice = build_advice(
            interpretation, dog_context, knowledge_context, observation=observation
        )
    except Exception:  # noqa: BLE001 -- advice failure must not discard interpretation
        advice = None
    interpretation_json = interpretation.model_dump(mode="json")
    interpretation_json["knowledge_audit"] = {
        "registry_version": knowledge_context.registry_version,
        "coverage": knowledge_context.coverage,
        "card_ids": [card.card_id for card in knowledge_context.cards],
    }
    interpretation_json["intelligence_audit"] = intelligence.audit()
    interpretation_json["advice"] = (
        advice.model_dump(mode="json") if advice is not None else None
    )
    consumer = build_behavior_consumer(
        interpretation,
        dog_name=dog.name,
        dog_context=dog_context,
        advice=advice,
    )
    interpretation_json["consumer"] = consumer.model_dump(mode="json")
    interpretation_json["context_bucket"] = (
        capture.context_bucket.value
        if hasattr(capture.context_bucket, "value")
        else capture.context_bucket
    )
    interpretation_json["processing_owner_context"] = processing_owner_context
    event.interpretation_json = interpretation_json
    event.primary_intent = interpretation.primary_intent
    event.confidence_band = interpretation.confidence_band
    event.summary = interpretation.consumer_summary
    event.policy_version = interpretation.policy_version
    event.taxonomy_version = interpretation.taxonomy_version
    event.knowledge_version = knowledge_context.registry_version
    event.knowledge_card_ids = [
        card.card_id for card in knowledge_context.cards
    ]
    event.advice_code = advice.code if advice is not None else None
    event.advice_json = advice.model_dump(mode="json") if advice is not None else None
    event.completed_at = now_utc()
    event.last_error_code = None
    if not event.quota_committed and not event.quota_refunded:
        await quota.commit(event.user_id, AnalysisDomain.BEHAVIOR, reference_id=event.id)
        event.quota_committed = True
    await _arm_behavior_raw_ttl(state, event)
    if state.engine is not None:
        await behavior_db.save_event_state(state.engine, event)
    await _set_analysis_job_status(
        state,
        event_id=event.id,
        status="COMPLETED",
    )
    try:
        from app.domains.personal_engine import on_behavior_completed

        await on_behavior_completed(state, event)
    except Exception:
        logger.exception("Personal Engine failed after completion")
    try:
        await state.queue.enqueue(
            task_type="behavior_result_notification",
            payload={"event_id": event.id},
        )
    except Exception:
        logger.exception("Could not enqueue behavior result notification")
    return {"event_id": event.id, "status": event.status.value}


async def refine_behavior_event_context(
    state: AppState,
    *,
    event: BehaviorEventRec,
    answer_id: str | None = None,
    legacy_context_bucket: ContextBucket | None = None,
    context_bucket: ContextBucket | None = None,
) -> BehaviorEventRec:
    """Refine reasoning with the exact answer shown to and selected by the owner.

    The video observation is reused, so Gemini and the user's analysis quota
    are not charged again. Older clients may still send a context bucket, but
    new clients resolve a server-stored option id to the exact visible answer.
    """
    if event.status != BehaviorEventStatus.COMPLETED or not event.observation_json:
        raise ApiError(
            ErrorCode.VALIDATION_FAILED,
            "Context can only refine a completed behavior event.",
        )
    interp = event.interpretation_json or {}
    if answer_id is not None:
        previous = interp.get("context_response")
        if isinstance(previous, dict):
            if previous.get("answer_id") == answer_id:
                # A network retry must not trigger or bill a second reasoner call.
                return event
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "Hai già risposto a questa domanda.",
            )
    if state.engine is not None:
        capture = await behavior_db.load_capture(
            state.engine, capture_id=event.capture_id
        )
    else:
        capture = state.store.captures.get(event.capture_id)
    if capture is None or capture.user_id != event.user_id:
        raise ApiError(ErrorCode.NOT_FOUND, "Capture not found")

    legacy_context_bucket = legacy_context_bucket or context_bucket
    owner_answer: OwnerContextAnswer | None = None
    if answer_id is not None:
        try:
            options = [
                ContextOption.model_validate(item)
                for item in interp.get("context_options", [])
            ]
        except Exception as exc:
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "Questa domanda non è più disponibile. Riapri il risultato.",
            ) from exc
        selected = next((item for item in options if item.id == answer_id), None)
        question = interp.get("context_question")
        if selected is None or not isinstance(question, str) or not question:
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "La risposta scelta non appartiene a questa domanda.",
            )
        owner_answer = OwnerContextAnswer(
            question=question,
            answer_id=selected.id,
            label=selected.label,
        )
        raw_bucket = interp.get("context_bucket") or capture.context_bucket
        try:
            context_bucket = ContextBucket(
                raw_bucket.value if hasattr(raw_bucket, "value") else raw_bucket
            )
        except (TypeError, ValueError):
            context_bucket = ContextBucket.UNKNOWN
    else:
        context_bucket = legacy_context_bucket or ContextBucket.UNKNOWN
        if context_bucket == ContextBucket.UNKNOWN:
            raise ApiError(
                ErrorCode.VALIDATION_FAILED,
                "A concrete context answer is required.",
            )

    observation = ObservationContract.model_validate(event.observation_json)
    dog, dog_context, _lifestyle_dump = await _dog_context(state, event)
    knowledge_context = retrieve_evidence(
        observation, context_bucket, dog_context
    )
    intelligence = build_dog_intelligence_context(
        dog,
        dog_context,
        domain="behavior",
        settings=state.settings,
    )
    deterministic_flags = behavior_safety_flags(observation, dog_context)

    from app.domains import processing_context_store as _proc_store
    from app.domains.processing_context import owner_facts_for_reasoner as _owner_facts

    if state.engine is not None:
        refine_rows = await _proc_store.list_answers_db(
            state.engine, event_id=event.id, user_id=event.user_id
        )
    else:
        refine_rows = _proc_store.list_answers(
            state.store, event_id=event.id, user_id=event.user_id
        )
    refine_kwargs: dict = {
        "observation": observation,
        "context_bucket": context_bucket,
        "policy_version": INTERPRETATION_POLICY_VERSION,
        "eligible_memory": await _eligible_memory(state, event.dog_id),
        "knowledge_context": knowledge_context,
        "dog_context": dog_context,
        "dog_name": dog.name,
        "owner_context_answer": owner_answer,
        "deterministic_safety_flags": deterministic_flags,
        "operation": "reasoner.refine_context",
        "processing_owner_context": [
            item.model_dump(mode="json") for item in _owner_facts(refine_rows)
        ],
    }
    if any(intelligence.flags.values()):
        refine_kwargs["intelligence_context"] = intelligence.reasoner_payload()

    try:
        interpretation, usage = await state.reasoner.interpret(**refine_kwargs)
    except TimeoutError as exc:
        raise ApiError(
            ErrorCode.PROVIDER_TIMEOUT,
            "The context refinement timed out.",
            retryable=True,
        ) from exc
    except BudgetExceededError as exc:
        raise ApiError(
            ErrorCode.AI_BUDGET_EXCEEDED,
            "Context refinement is temporarily unavailable.",
        ) from exc

    refinement_update = {
        "safety_flags": merge_safety_flags(
            interpretation.safety_flags, deterministic_flags
        ),
        "context_bucket": context_bucket,
    }
    if owner_answer is not None:
        refinement_update.update(
            {
                "needs_context": False,
                "context_question": None,
                "context_options": [],
                "context_effect": interpretation.context_effect
                or f"Ho aggiornato la lettura con la tua risposta: {owner_answer.label}.",
            }
        )
    interpretation = interpretation.model_copy(update=refinement_update)
    if (
        knowledge_context.coverage == "LOW"
        and interpretation.confidence_band != ConfidenceBand.LOW
    ):
        interpretation = interpretation.model_copy(
            update={"confidence_band": ConfidenceBand.LOW}
        )

    await state.cost_meter.record(
        usage=usage,
        operation="reasoner.refine_context",
        domain=AnalysisDomain.BEHAVIOR,
        event_id=event.id,
        user_id=event.user_id,
    )
    try:
        advice = build_advice(
            interpretation, dog_context, knowledge_context, observation=observation
        )
    except Exception:  # noqa: BLE001 -- advice cannot discard a valid refinement
        advice = None
    consumer = build_behavior_consumer(
        interpretation,
        dog_name=dog.name,
        dog_context=dog_context,
        advice=advice,
    )
    interpretation_json = interpretation.model_dump(mode="json")
    interpretation_json["knowledge_audit"] = {
        "registry_version": knowledge_context.registry_version,
        "coverage": knowledge_context.coverage,
        "card_ids": [card.card_id for card in knowledge_context.cards],
    }
    interpretation_json["intelligence_audit"] = intelligence.audit()
    interpretation_json["advice"] = (
        advice.model_dump(mode="json") if advice is not None else None
    )
    interpretation_json["consumer"] = consumer.model_dump(mode="json")
    if owner_answer is not None:
        interpretation_json["context_response"] = owner_answer.model_dump(
            mode="json"
        )

    capture.context_bucket = context_bucket
    event.interpretation_json = interpretation_json
    event.primary_intent = interpretation.primary_intent
    event.confidence_band = interpretation.confidence_band
    event.summary = interpretation.consumer_summary
    event.policy_version = interpretation.policy_version
    event.taxonomy_version = interpretation.taxonomy_version
    event.knowledge_version = knowledge_context.registry_version
    event.knowledge_card_ids = [
        card.card_id for card in knowledge_context.cards
    ]
    event.advice_code = advice.code if advice is not None else None
    event.advice_json = (
        advice.model_dump(mode="json") if advice is not None else None
    )

    if state.engine is not None:
        await behavior_db.update_capture_context(
            state.engine,
            user_id=event.user_id,
            event_id=event.id,
            context_bucket=context_bucket.value,
        )
        await behavior_db.save_event_state(state.engine, event)
    else:
        state.store.captures[capture.id] = capture
        state.store.behavior_events[event.id] = event
    return event


async def process_digestive_event(state: AppState, *, event_id: str) -> dict:
    """Digestive analysis handler (sez. 19). Observation is separate from the
    deterministic safety layer; completed events are a no-op on redelivery."""
    if state.engine is not None:
        event = await digestive_db.load_fecal_event(state.engine, event_id=event_id)
        if event is not None:
            state.store.fecal_events[event.id] = event
    else:
        event = state.store.fecal_events.get(event_id)
    if event is None:
        return {"event_id": event_id, "status": "ignored_unknown_event"}
    if event.status in ("COMPLETED", "REJECTED_QUALITY", "FAILED_TERMINAL"):
        await _set_analysis_job_status(
            state,
            event_id=event.id,
            status="FAILED" if event.status == "FAILED_TERMINAL" else "COMPLETED",
            error_code=event.last_error_code,
        )
        return {"event_id": event.id, "status": event.status, "noop": True}

    if not await _claim_analysis_job(state, event_id=event.id):
        return {"event_id": event.id, "status": "already_running", "noop": True}

    await _set_analysis_job_status(
        state,
        event_id=event.id,
        status="RUNNING",
    )
    quota = QuotaService(state.store, engine=state.engine)
    event.attempt_count += 1
    event.status = "OBSERVING"
    if state.engine is not None:
        await digestive_db.save_fecal_state(state.engine, event)
    try:
        image_ref = event.image_path
        create_read = getattr(state.storage, "create_signed_read_url", None)
        if callable(create_read) and state.settings.digestive_vision_provider != "mock":
            from app.domains.digestive import DIGESTIVE_BUCKET

            image_ref = await create_read(
                bucket=DIGESTIVE_BUCKET,
                path=event.image_path,
                ttl_seconds=min(state.settings.storage_signed_url_ttl_seconds, 600),
            )
        observation, usage = await state.digestive_vision.observe_stool(image_ref=image_ref)
    except TimeoutError:
        event.last_error_code = ErrorCode.PROVIDER_TIMEOUT.value
        if event.attempt_count < MAX_TASK_ATTEMPTS:
            event.status = "FAILED_RETRYABLE"
            if state.engine is not None:
                await digestive_db.save_fecal_state(state.engine, event)
            await _set_analysis_job_status(
                state,
                event_id=event.id,
                status="RETRYING",
                error_code=ErrorCode.PROVIDER_TIMEOUT.value,
            )
            # Transient failure must propagate so the workflow step fails and
            # the platform retries with backoff (sez. 22).
            raise RetryableTaskError(
                {
                    "event_id": event.id,
                    "status": event.status,
                    "error": ErrorCode.PROVIDER_TIMEOUT.value,
                }
            )
        event.status = "FAILED_TERMINAL"
        if not event.quota_refunded and not event.quota_committed:
            await quota.refund(
                event.user_id,
                AnalysisDomain.DIGESTIVE,
                reference_id=event.id,
            )
            event.quota_refunded = True
        event.completed_at = now_utc()
        schedule_digestive_raw_expiry(event, state.settings)
        if state.engine is not None:
            await digestive_db.save_fecal_state(state.engine, event)
            await arm_fecal_expiry(state.engine, event.id)
        await _set_analysis_job_status(
            state,
            event_id=event.id,
            status="FAILED",
            error_code=ErrorCode.PROVIDER_TIMEOUT.value,
        )
        await notify_analysis_failure(
            state,
            user_id=event.user_id,
            event_id=event.id,
            domain="DIGESTIVE",
        )
        return {"event_id": event.id, "status": event.status, "error": ErrorCode.PROVIDER_TIMEOUT.value}
    except BudgetExceededError:
        event.status = "FAILED_TERMINAL"
        event.last_error_code = ErrorCode.AI_BUDGET_EXCEEDED.value
        if not event.quota_refunded and not event.quota_committed:
            await quota.refund(
                event.user_id,
                AnalysisDomain.DIGESTIVE,
                reference_id=event.id,
            )
            event.quota_refunded = True
        event.completed_at = now_utc()
        schedule_digestive_raw_expiry(event, state.settings)
        if state.engine is not None:
            await digestive_db.save_fecal_state(state.engine, event)
            await arm_fecal_expiry(state.engine, event.id)
        await _set_analysis_job_status(
            state,
            event_id=event.id,
            status="FAILED",
            error_code=ErrorCode.AI_BUDGET_EXCEEDED.value,
        )
        await notify_analysis_failure(
            state,
            user_id=event.user_id,
            event_id=event.id,
            domain="DIGESTIVE",
        )
        return {
            "event_id": event.id,
            "status": event.status,
            "error": ErrorCode.AI_BUDGET_EXCEEDED.value,
        }
    except Exception:
        logger.exception(
            "Digestive observer failed for event %s on attempt %s",
            event.id,
            event.attempt_count,
        )
        event.status = "FAILED_TERMINAL"
        event.last_error_code = ErrorCode.PROCESSING_FAILED.value
        if not event.quota_refunded and not event.quota_committed:
            await quota.refund(event.user_id, AnalysisDomain.DIGESTIVE, reference_id=event.id)
            event.quota_refunded = True
        event.completed_at = now_utc()
        schedule_digestive_raw_expiry(event, state.settings)
        if state.engine is not None:
            await digestive_db.save_fecal_state(state.engine, event)
            await arm_fecal_expiry(state.engine, event.id)
        await _set_analysis_job_status(
            state,
            event_id=event.id,
            status="FAILED",
            error_code=ErrorCode.PROCESSING_FAILED.value,
        )
        await notify_analysis_failure(
            state,
            user_id=event.user_id,
            event_id=event.id,
            domain="DIGESTIVE",
        )
        return {
            "event_id": event.id,
            "status": event.status,
            "error": ErrorCode.PROCESSING_FAILED.value,
        }
    await state.cost_meter.record(
        usage=usage,
        operation="digestive_vision.observe_stool",
        domain=AnalysisDomain.DIGESTIVE,
        event_id=event.id,
        user_id=event.user_id,
    )
    event.last_error_code = None

    obs_json = observation.model_dump(mode="json")
    event.observation_json = obs_json
    if observation.image_quality == "insufficient":
        event.status = "REJECTED_QUALITY"
        if not event.quota_refunded and not event.quota_committed:
            await quota.refund(event.user_id, AnalysisDomain.DIGESTIVE, reference_id=event.id)
            event.quota_refunded = True
        event.completed_at = now_utc()
        schedule_digestive_raw_expiry(event, state.settings)
        if state.engine is not None:
            await digestive_db.save_fecal_state(state.engine, event)
            await arm_fecal_expiry(state.engine, event.id)
        await _set_analysis_job_status(
            state,
            event_id=event.id,
            status="COMPLETED",
        )
        await notify_analysis_quality_rejected(
            state,
            user_id=event.user_id,
            event_id=event.id,
            domain="DIGESTIVE",
        )
        return {"event_id": event.id, "status": event.status}

    event.fecal_score_estimate = observation.fecal_score_estimate
    event.consistency = observation.consistency.value
    event.color = observation.color
    event.confidence_band = observation.confidence_band
    if state.engine is not None:
        digestive_context = await digestive_db.load_digestive_context(
            state.engine, event=event
        )
    else:
        digestive_context = build_inmemory_digestive_context(
            state.store, event=event
        )
    # Includes owner-confirmed context; generated text cannot add or downgrade.
    event.safety_flags = contextual_safety_flags(obs_json, digestive_context)
    intelligence = build_digestive_intelligence(
        obs_json,
        digestive_context,
        longitudinal=state.settings.digestive_longitudinal_v3,
    )
    event.intelligence_json = intelligence.model_dump(mode="json")
    event.summary = intelligence.consumer_summary
    event.status = "COMPLETED"
    event.completed_at = now_utc()
    if not event.quota_committed and not event.quota_refunded:
        await quota.commit(event.user_id, AnalysisDomain.DIGESTIVE, reference_id=event.id)
        event.quota_committed = True
    schedule_digestive_raw_expiry(event, state.settings)
    if state.engine is not None:
        await digestive_db.save_fecal_state(state.engine, event)
        await digestive_db.refresh_digestive_baseline(
            state.engine, dog_id=event.dog_id
        )
        await arm_fecal_expiry(state.engine, event.id)
    await _set_analysis_job_status(
        state,
        event_id=event.id,
        status="COMPLETED",
    )
    try:
        await state.queue.enqueue(
            task_type="digestive_result_notification",
            payload={"event_id": event.id},
        )
    except Exception:
        logger.exception("Could not enqueue digestive result notification")
    return {"event_id": event.id, "status": event.status}


async def process_media_retention_cleanup(state: AppState, *, event_id: str | None = None) -> dict:
    """Periodic cleanup of expired temporary raw media (IDs-only task).

    Also purges stale idempotency rows older than 7 days (FIX 1.4): a crash
    before record() leaves status_code=0 rows that the per-claim TTL reclaims
    on the next retry, and this sweep drops the long-tail completed cache.
    """
    del event_id  # unused; cleanup scans the store
    if state.engine is not None:
        result = await cleanup_expired_raw_media_db(state.engine, storage=state.storage)
        try:
            from app.domains import idempotency_db

            result["purged_idempotency_rows"] = await idempotency_db.purge_expired(
                state.engine
            )
        except Exception:
            logger.warning("idempotency purge failed", exc_info=True)
            result["purged_idempotency_rows"] = 0
        return result
    return await cleanup_expired_raw_media(state.store, storage=state.storage)


async def _owner_display_name(state: AppState, user_id: str) -> str | None:
    try:
        if state.engine is not None:
            profile = await profiles_db.get_or_create_profile(state.engine, user_id)
        else:
            profile = state.store.ensure_profile(user_id)
        name = getattr(profile, "display_name", None)
        if isinstance(name, str) and name.strip():
            return name.strip()
    except Exception:
        logger.exception("Could not load owner display name")
    return None


async def _dog_display_name(
    state: AppState, *, user_id: str, dog_id: str
) -> str:
    try:
        if state.engine is not None:
            dog = await dogs_db.get_owned_dog(
                state.engine, user_id=user_id, dog_id=dog_id
            )
        else:
            dog = state.store.get_dog(dog_id)
        if dog is not None and dog.name:
            return dog.name
    except Exception:
        logger.exception("Could not load dog name for notification")
    return "il tuo cane"


async def process_behavior_result_notification(
    state: AppState, *, event_id: str
) -> dict:
    event = (
        await behavior_db.load_event(state.engine, event_id=event_id)
        if state.engine is not None
        else state.store.behavior_events.get(event_id)
    )
    if event is None or event.status != BehaviorEventStatus.COMPLETED:
        return {"event_id": event_id, "status": "ignored"}
    dog_name = await _dog_display_name(
        state, user_id=event.user_id, dog_id=event.dog_id
    )
    tokens = await _notification_tokens(state, event.user_id)
    sent = await send_push(
        tokens,
        title=f"Il risultato di {dog_name} è pronto",
        body=f"Ho finito di osservare {dog_name}: apri per scoprire cosa potrebbe stare comunicando.",
        data={"href": f"/behavior/result/{event.id}", "event_id": event.id},
    )
    return {"event_id": event.id, "status": "sent", "devices": sent}


async def process_digestive_result_notification(
    state: AppState, *, event_id: str
) -> dict:
    event = (
        await digestive_db.load_fecal_event(state.engine, event_id=event_id)
        if state.engine is not None
        else state.store.fecal_events.get(event_id)
    )
    if event is None or event.status != "COMPLETED":
        return {"event_id": event_id, "status": "ignored"}
    tokens = await _notification_tokens(state, event.user_id)
    sent = await send_push(
        tokens,
        title="Analisi digestiva pronta",
        body="Il risultato dell'analisi di Dogly è disponibile.",
        data={"href": f"/digestive/result/{event.id}", "event_id": event.id},
    )
    return {"event_id": event.id, "status": "sent", "devices": sent}


async def process_care_reminder_dispatch(
    state: AppState, *, event_id: str | None = None
) -> dict:
    del event_id
    if state.engine is not None:
        due = await care_db.list_due_reminders(state.engine)
    else:
        now = now_utc()
        due = [
            item
            for item in state.store.care_events.values()
            if item.status.value == "SCHEDULED"
            and item.reminder_enabled
            and item.reminder_sent_at is None
            and item.scheduled_at.timestamp()
            - item.reminder_minutes_before * 60
            <= now.timestamp()
            and item.scheduled_at.timestamp() >= now.timestamp() - 86400
        ][:100]
    sent = 0
    for item in due:
        tokens = await _notification_tokens(state, item.user_id)
        delivered = await send_push(
            tokens,
            title="Promemoria Dogly",
            body=item.title,
            data={"href": f"/care/{item.id}", "event_id": item.id},
        )
        if delivered:
            if state.engine is not None:
                await care_db.mark_reminder_sent(state.engine, event_id=item.id)
            else:
                item.reminder_sent_at = now_utc()
            sent += delivered
    return {"status": "completed", "events_due": len(due), "devices_sent": sent}


async def process_privacy_export(state: AppState, *, event_id: str) -> dict:
    """Build a gzip JSON export artifact and complete the export job."""
    job = (
        await privacy_db.claim_export_job(state.engine, event_id)
        if state.engine is not None
        else privacy_domain.claim_export_job(state.store, event_id)
    )
    if job is None:
        return {"event_id": event_id, "status": "ignored_unclaimable_job", "noop": True}
    try:
        payload = (
            await privacy_db.collect_export_payload(state.engine, job.user_id or "")
            if state.engine is not None
            else privacy_domain.collect_export_payload(state.store, job.user_id or "")
        )
        data = gzip.compress(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
        path = f"users/{job.user_id}/exports/{job.id}.json.gz"
        await state.storage.upload_bytes(
            bucket="exports",
            path=path,
            data=data,
            content_type="application/gzip",
        )
        if state.engine is not None:
            expires_at = await privacy_db.export_expires_at(state.engine)
            await privacy_db.complete_export_job(
                state.engine,
                job.id,
                storage_path=path,
                expires_at=expires_at,
            )
        else:
            from datetime import UTC, datetime, timedelta

            privacy_domain.complete_export_job(
                state.store,
                job.id,
                storage_path=path,
                expires_at=datetime.now(UTC) + timedelta(days=7),
            )
        return {"event_id": job.id, "status": "COMPLETED", "storage_path": path}
    except Exception as exc:
        if state.engine is not None:
            await privacy_db.fail_export_job(state.engine, job.id, str(exc))
        else:
            privacy_domain.fail_export_job(state.store, job.id, str(exc))
        raise


def _purge_memory_account(state: AppState, user_id: str) -> dict[str, int]:
    dog_ids = {dog.id for dog in state.store.dogs.values() if dog.owner_id == user_id}
    counts = {
        "profiles": int(user_id in state.store.profiles),
        "dogs": len(dog_ids),
        "behavior_captures": sum(1 for rec in state.store.captures.values() if rec.user_id == user_id),
        "behavior_events": sum(1 for rec in state.store.behavior_events.values() if rec.user_id == user_id),
        "fecal_events": sum(1 for rec in state.store.fecal_events.values() if rec.user_id == user_id),
        "food_products": sum(1 for rec in state.store.food_products.values() if rec.owner_id == user_id),
        "feeding_periods": sum(1 for rec in state.store.feeding_periods.values() if rec.dog_id in dog_ids),
        "owner_reported_observations": sum(
            1
            for rec in state.store.owner_reported_observations.values()
            if rec["user_id"] == user_id
        ),
    }
    state.store.profiles.pop(user_id, None)
    for collection, predicate in (
        (state.store.dogs, lambda rec: rec.owner_id == user_id),
        (state.store.captures, lambda rec: rec.user_id == user_id),
        (state.store.behavior_events, lambda rec: rec.user_id == user_id),
        (state.store.fecal_events, lambda rec: rec.user_id == user_id),
        (state.store.food_products, lambda rec: rec.owner_id == user_id),
        (state.store.feeding_periods, lambda rec: rec.dog_id in dog_ids),
        (
            state.store.owner_reported_observations,
            lambda rec: rec["user_id"] == user_id,
        ),
        (state.store.subscriptions, lambda rec: rec.user_id == user_id),
        (state.store.devices, lambda rec: rec.user_id == user_id),
    ):
        for rec_id, rec in list(collection.items()):
            if predicate(rec):
                collection.pop(rec_id, None)
    return counts


async def process_account_deletion(state: AppState, *, event_id: str) -> dict:
    """Purge account storage/data and complete the deletion job with count evidence."""
    job = (
        await privacy_db.claim_deletion_job(state.engine, event_id)
        if state.engine is not None
        else privacy_domain.claim_deletion_job(state.store, event_id)
    )
    if job is None:
        return {"event_id": event_id, "status": "ignored_unclaimable_job", "noop": True}
    try:
        user_id = job.user_id or ""
        paths = (
            await privacy_db.list_storage_paths_for_user(state.engine, user_id)
            if state.engine is not None
            else privacy_domain.list_storage_paths_for_user(state.store, user_id)
        )
        deleted_objects = 0
        for item in paths:
            await state.storage.delete_object(bucket=item["bucket"], path=item["path"])
            deleted_objects += 1
        if state.engine is not None:
            counts = await privacy_db.count_user_rows(state.engine, user_id)
            await supabase_auth_admin.delete_user(state.settings, user_id)
            evidence = {"storage_objects_deleted": deleted_objects, "rows_deleted": counts}
            await privacy_db.complete_deletion_job(state.engine, job.id, evidence)
        else:
            counts = _purge_memory_account(state, user_id)
            evidence = {"storage_objects_deleted": deleted_objects, "rows_deleted": counts}
            privacy_domain.complete_deletion_job(state.store, job.id)
        return {"event_id": job.id, "status": "COMPLETED", **evidence}
    except Exception as exc:
        if state.engine is not None:
            await privacy_db.fail_deletion_job(state.engine, job.id, str(exc))
        else:
            privacy_domain.fail_deletion_job(state.store, job.id, str(exc))
        raise
