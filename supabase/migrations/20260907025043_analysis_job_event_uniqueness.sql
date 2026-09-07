-- One durable analysis workflow per event. Prevents concurrent/repeated
-- complete calls from charging the same behavior or digestive event twice.

delete from internal.analysis_jobs older
using internal.analysis_jobs newer
where older.event_id = newer.event_id
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id < newer.id)
  );

create unique index if not exists analysis_jobs_event_unique_idx
  on internal.analysis_jobs (event_id);
