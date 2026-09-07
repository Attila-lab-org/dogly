"""PostgreSQL privacy workflow helpers for export and account deletion."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domains.models import AnalysisJobRec
from app.domains.repository import now_utc


def _uuid(value: Any) -> str:
    return str(value)


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _plain(value: Any) -> Any:
    json.dumps(value, default=_json_default)
    return json.loads(json.dumps(value, default=_json_default))


def _job_from_row(row: Any, *, job_type: str, status: str | None = None) -> AnalysisJobRec:
    data = dict(row)
    return AnalysisJobRec(
        id=_uuid(data["id"]),
        job_type=job_type,
        user_id=_uuid(data["user_id"]) if data.get("user_id") is not None else None,
        status=status or str(data.get("status", "queued")).lower(),
        attempt_count=int(data.get("attempt_count") or 0),
        last_error_code=data.get("last_error") or data.get("last_error_code"),
        created_at=data.get("requested_at") or data.get("created_at") or now_utc(),
        updated_at=data.get("completed_at") or data.get("requested_at") or data.get("updated_at") or now_utc(),
    )


async def start_export(engine: AsyncEngine, user_id: str) -> AnalysisJobRec:
    """Create or reuse a queued export job for a user."""
    try:
        async with engine.connect() as conn:
            job_id = (
                await conn.execute(
                    text("select internal.begin_export(:uid) as id"),
                    {"uid": user_id},
                )
            ).scalar_one()
        return AnalysisJobRec(
            id=_uuid(job_id),
            job_type="privacy_export",
            user_id=user_id,
            status="queued",
            created_at=now_utc(),
            updated_at=now_utc(),
        )
    except SQLAlchemyError:
        pass

    async with engine.begin() as conn:
        existing = (
            await conn.execute(
                text(
                    """
                    select *
                    from internal.export_jobs
                    where user_id = :uid and status in ('PENDING', 'RUNNING')
                    order by requested_at desc
                    limit 1
                    """
                ),
                {"uid": user_id},
            )
        ).mappings().first()
        if existing:
            return _job_from_row(existing, job_type="privacy_export", status="queued")
        row = (
            await conn.execute(
                text(
                    """
                    insert into internal.export_jobs (user_id, status)
                    values (:uid, 'PENDING')
                    returning *
                    """
                ),
                {"uid": user_id},
            )
        ).mappings().one()
    return _job_from_row(row, job_type="privacy_export", status="queued")


async def start_account_deletion(engine: AsyncEngine, user_id: str) -> AnalysisJobRec:
    async with engine.connect() as conn:
        job_id = (
            await conn.execute(
                text("select internal.begin_account_deletion(:uid) as id"),
                {"uid": user_id},
            )
        ).scalar_one()
    return AnalysisJobRec(
        id=_uuid(job_id),
        job_type="account_deletion",
        user_id=user_id,
        status="pending",
        created_at=now_utc(),
        updated_at=now_utc(),
    )


async def claim_export_job(engine: AsyncEngine, job_id: str) -> AnalysisJobRec | None:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update internal.export_jobs
                    set status = 'RUNNING'
                    where id = (
                      select id from internal.export_jobs
                      where id = :id and status in ('PENDING', 'FAILED')
                      for update skip locked
                    )
                    returning *
                    """
                ),
                {"id": job_id},
            )
        ).mappings().first()
    return _job_from_row(row, job_type="privacy_export", status="running") if row else None


async def complete_export_job(
    engine: AsyncEngine, job_id: str, *, storage_path: str, expires_at: datetime
) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                update internal.export_jobs
                set status = 'COMPLETED',
                    storage_path = :storage_path,
                    expires_at = :expires_at,
                    completed_at = now(),
                    last_error = null
                where id = :id
                """
            ),
            {"id": job_id, "storage_path": storage_path, "expires_at": expires_at},
        )


async def fail_export_job(engine: AsyncEngine, job_id: str, error: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("update internal.export_jobs set status = 'FAILED', last_error = :error where id = :id"),
            {"id": job_id, "error": error[:500]},
        )


async def claim_deletion_job(engine: AsyncEngine, job_id: str) -> AnalysisJobRec | None:
    async with engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    update internal.deletion_jobs
                    set status = 'RUNNING', attempt_count = attempt_count + 1
                    where id = (
                      select id from internal.deletion_jobs
                      where id = :id and scope = 'ACCOUNT' and status in ('PENDING', 'FAILED')
                      for update skip locked
                    )
                    returning *
                    """
                ),
                {"id": job_id},
            )
        ).mappings().first()
    return _job_from_row(row, job_type="account_deletion", status="running") if row else None


async def complete_deletion_job(engine: AsyncEngine, job_id: str, evidence: dict[str, Any]) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("select internal.complete_deletion_job(:id, CAST(:evidence AS jsonb))"),
            {"id": job_id, "evidence": json.dumps(evidence, default=_json_default)},
        )


async def fail_deletion_job(engine: AsyncEngine, job_id: str, error: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("update internal.deletion_jobs set status = 'FAILED', last_error = :error where id = :id"),
            {"id": job_id, "error": error[:500]},
        )


async def get_export_job(engine: AsyncEngine, *, user_id: str, job_id: str) -> AnalysisJobRec:
    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select *
                    from internal.export_jobs
                    where id = :id and user_id = :uid
                    """
                ),
                {"id": job_id, "uid": user_id},
            )
        ).mappings().first()
    if not row:
        from app.contracts.errors import ApiError, ErrorCode

        raise ApiError(ErrorCode.NOT_FOUND, "Export not found.")
    status = str(row.get("status", "PENDING")).upper()
    mapped = {
        "PENDING": "queued",
        "RUNNING": "running",
        "COMPLETED": "completed",
        "FAILED": "failed",
    }.get(status, status.lower())
    job = _job_from_row(row, job_type="privacy_export", status=mapped)
    job.storage_path = row.get("storage_path")
    job.expires_at = row.get("expires_at")
    return job


async def export_expires_at(engine: AsyncEngine) -> datetime:
    async with engine.connect() as conn:
        return (
            await conn.execute(text("select internal.media_expiry_at('EXPORT')"))
        ).scalar_one()


async def collect_export_payload(engine: AsyncEngine, user_id: str) -> dict[str, Any]:
    """Collect user data for export without raw media bytes."""
    queries = {
        "profiles": "select user_id, locale, timezone, created_at, deleted_at from public.profiles where user_id = :uid",
        "dogs": "select * from public.dogs where owner_id = :uid order by created_at, id",
        "behavior_events": """
            select id, capture_id, dog_id, status, primary_intent, confidence_band, summary,
                   context_bucket, policy_version, taxonomy_version, knowledge_version,
                   knowledge_card_ids, advice_code, advice_json, created_at, completed_at
            from public.behavior_events
            where user_id = :uid
            order by created_at, id
        """,
        "behavior_captures": """
            select id, dog_id, client_request_id, duration_ms, has_audio, bytes,
                   content_type, context_bucket, upload_completed,
                   retention_state, expires_at, created_at
            from public.behavior_captures
            where user_id = :uid
            order by created_at, id
        """,
        "behavior_feedback": "select * from public.behavior_feedback where user_id = :uid order by created_at",
        "behavior_observations": """
            select o.*
            from internal.behavior_observations o
            join public.behavior_events e on e.id = o.event_id
            where e.user_id = :uid
            order by o.created_at, o.event_id
        """,
        "behavior_interpretations": """
            select i.*
            from internal.behavior_interpretations i
            join public.behavior_events e on e.id = i.event_id
            where e.user_id = :uid
            order by i.created_at, i.event_id
        """,
        "behavior_outcomes": """
            select o.*
            from internal.behavior_outcomes o
            join public.behavior_events e on e.id = o.event_id
            where e.user_id = :uid
            order by o.observed_at, o.id
        """,
        "personal_patterns": """
            select p.*
            from public.personal_patterns p
            join public.dogs d on d.id = p.dog_id
            where d.owner_id = :uid
            order by p.last_seen nulls last, p.id
        """,
        "pattern_event_links": """
            select l.*
            from internal.pattern_event_links l
            join public.personal_patterns p on p.id = l.pattern_id
            join public.dogs d on d.id = p.dog_id
            where d.owner_id = :uid
            order by l.created_at, l.pattern_id, l.event_id
        """,
        "fecal_events": """
            select id, dog_id, client_request_id, image_quality, fecal_score_estimate,
                   consistency, shape, color, mucus_candidate, blood_candidate,
                   melena_candidate, foreign_material_candidate, confidence_band, status,
                   feeding_period_id, attempt_count, last_error_code,
                   observation_json, intelligence_json, owner_context_json,
                   created_at, completed_at, retention_state, expires_at
            from public.fecal_events
            where user_id = :uid
            order by created_at, id
        """,
        "food_products": """
            select id, owner_id, brand, name, ingredients_raw, guaranteed_analysis,
                   calories, feeding_directions, extraction_confidence, verified_at,
                   created_at, updated_at, label_retention_state, label_expires_at
            from public.food_products
            where owner_id = :uid
            order by created_at, id
        """,
        "feeding_periods": """
            select fp.*
            from public.feeding_periods fp
            join public.dogs d on d.id = fp.dog_id
            where d.owner_id = :uid
            order by fp.start_at, fp.id
        """,
        "digestive_baselines": """
            select b.*
            from public.digestive_baselines b
            join public.dogs d on d.id = b.dog_id
            where d.owner_id = :uid
            order by b.calculated_at, b.id
        """,
        "digestive_insights": """
            select i.*
            from public.digestive_insights i
            join public.dogs d on d.id = i.dog_id
            where d.owner_id = :uid
            order by i.created_at, i.id
        """,
        "digestive_observations": """
            select o.*
            from internal.digestive_observations o
            join public.fecal_events f on f.id = o.fecal_event_id
            where f.user_id = :uid
            order by o.created_at, o.fecal_event_id
        """,
        "consents": "select * from public.user_consents where user_id = :uid order by created_at, id",
        "lifestyle_profiles": """
            select * from public.dog_lifestyle_profiles
            where user_id = :uid order by created_at, dog_id
        """,
        "advice_outcomes": """
            select * from public.advice_outcomes
            where user_id = :uid order by created_at, id
        """,
        "owner_reported_observations": """
            select id, dog_id, transcript, facts_json, status,
                   confirmed_at, created_at
            from public.owner_reported_observations
            where user_id = :uid order by created_at, id
        """,
        "subscriptions": "select * from public.subscriptions where user_id = :uid",
        "usage_ledgers": """
            select * from public.usage_ledgers
            where user_id = :uid order by period_start, id
        """,
        "gallery_visibility": """
            select v.*
            from public.dog_profile_visibility v
            join public.dogs d on d.id = v.dog_id
            where d.owner_id = :uid
            order by v.dog_id
        """,
        "gallery_albums": """
            select * from public.dog_albums
            where owner_id = :uid order by created_at, id
        """,
        "gallery_photos": """
            select id, dog_id, album_id, caption, visibility, taken_at,
                   created_at, deleted_at
            from public.dog_photos
            where owner_id = :uid order by created_at, id
        """,
        "care_events": """
            select * from public.care_events
            where user_id = :uid
            order by scheduled_at, id
        """,
        "devices": """
            select * from public.device_installations
            where user_id = :uid order by created_at, id
        """,
        "dog_profile_versions": """
            select v.*
            from internal.dog_profile_versions v
            join public.dogs d on d.id = v.dog_id
            where d.owner_id = :uid
            order by v.created_at, v.id
        """,
        "signal_experiments": """
            select * from public.signal_experiments
            where user_id = :uid order by created_at, id
        """,
        "signal_map_entries": """
            select * from public.signal_map_entries
            where user_id = :uid
            order by dog_id, category
        """,
        "knowledge_scores": """
            select k.*
            from public.knowledge_scores k
            join public.dogs d on d.id = k.dog_id
            where d.owner_id = :uid
            order by k.calculated_at, k.id
        """,
        "analysis_jobs": """
            select id, job_type, domain, event_id, status, attempt_count,
                   last_error_code, scheduled_at, started_at, completed_at,
                   created_at, updated_at
            from internal.analysis_jobs j
            where exists (
              select 1 from public.behavior_events e
              where e.id = j.event_id and e.user_id = :uid
            )
            or exists (
              select 1 from public.fecal_events f
              where f.id = j.event_id and f.user_id = :uid
            )
            or exists (
              select 1 from public.food_products p
              where p.id = j.event_id and p.owner_id = :uid
            )
            order by created_at, id
        """,
        "ai_cost_events": """
            select id, provider, model, operation, domain, event_id,
                   input_tokens, output_tokens, media_bytes, latency_ms,
                   cost_usd, created_at
            from internal.ai_cost_events
            where user_id = :uid order by created_at, id
        """,
        "usage_reservations": """
            select id, reference_id, domain, units, state, reason,
                   created_at, updated_at
            from internal.usage_reservations
            where user_id = :uid order by created_at, id
        """,
    }
    payload: dict[str, Any] = {"user_id": user_id, "generated_at": now_utc().isoformat()}
    async with engine.connect() as conn:
        for key, sql in queries.items():
            rows = (await conn.execute(text(sql), {"uid": user_id})).mappings().all()
            payload[key] = [_plain(dict(row)) for row in rows]
    return payload


async def list_storage_paths_for_user(engine: AsyncEngine, user_id: str) -> list[dict[str, str]]:
    sql = """
      select 'dog-avatars'::text as bucket, photo_path as path from public.dogs
      where owner_id = :uid and photo_path is not null
      union all
      select 'behavior-raw', storage_path from public.behavior_captures
      where user_id = :uid and storage_path is not null
      union all
      select 'digestive-raw', image_path from public.fecal_events
      where user_id = :uid and image_path is not null
      union all
      select 'food-labels', label_image_path from public.food_products
      where owner_id = :uid and label_image_path is not null
      union all
      select 'dog-gallery', storage_path from public.dog_photos
      where owner_id = :uid and storage_path is not null
      union all
      select 'exports', storage_path from internal.export_jobs
      where user_id = :uid and storage_path is not null
    """
    async with engine.connect() as conn:
        rows = (await conn.execute(text(sql), {"uid": user_id})).mappings().all()
    return [{"bucket": str(row["bucket"]), "path": str(row["path"])} for row in rows]


async def count_user_rows(engine: AsyncEngine, user_id: str) -> dict[str, int]:
    sql = """
      with owned_dogs as (
        select id from public.dogs where owner_id = :uid
      )
      select
        (select count(*) from public.profiles where user_id = :uid)::int as profiles,
        (select count(*) from public.dogs where owner_id = :uid)::int as dogs,
        (select count(*) from public.behavior_captures where user_id = :uid)::int as behavior_captures,
        (select count(*) from public.behavior_events where user_id = :uid)::int as behavior_events,
        (select count(*) from public.behavior_feedback where user_id = :uid)::int as behavior_feedback,
        (select count(*) from public.personal_patterns where dog_id in (select id from owned_dogs))::int as personal_patterns,
        (select count(*) from public.fecal_events where user_id = :uid)::int as fecal_events,
        (select count(*) from public.food_products where owner_id = :uid)::int as food_products,
        (select count(*) from public.feeding_periods where dog_id in (select id from owned_dogs))::int as feeding_periods,
        (select count(*) from public.user_consents where user_id = :uid)::int as consents,
        (select count(*) from public.dog_lifestyle_profiles where user_id = :uid)::int as lifestyle_profiles,
        (select count(*) from public.advice_outcomes where user_id = :uid)::int as advice_outcomes,
        (select count(*) from public.owner_reported_observations where user_id = :uid)::int as owner_reported_observations,
        (select count(*) from public.subscriptions where user_id = :uid)::int as subscriptions,
        (select count(*) from public.device_installations where user_id = :uid)::int as devices
    """
    async with engine.connect() as conn:
        row = (await conn.execute(text(sql), {"uid": user_id})).mappings().one()
    return {key: int(value or 0) for key, value in dict(row).items()}
