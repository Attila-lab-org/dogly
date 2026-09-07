-- Defense in depth for server-only data.
-- Client roles have no USAGE on the internal schema and no table grants.
-- service_role and the database owner continue to bypass RLS.
alter table internal.dog_profile_versions enable row level security;
alter table internal.behavior_observations enable row level security;
alter table internal.behavior_interpretations enable row level security;
alter table internal.behavior_outcomes enable row level security;
alter table internal.pattern_event_links enable row level security;
alter table internal.digestive_observations enable row level security;
alter table internal.usage_reservations enable row level security;
alter table internal.analysis_jobs enable row level security;
alter table internal.ai_cost_events enable row level security;
alter table internal.audit_log enable row level security;
alter table internal.deletion_jobs enable row level security;
alter table internal.retention_policies enable row level security;
alter table internal.export_jobs enable row level security;
alter table internal.api_idempotency enable row level security;
alter table internal.rate_limits enable row level security;
