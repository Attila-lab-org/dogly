# DATA MODEL — Canine Behavioral Intelligence V1

Source of truth: `SPEC_V1.docx` §10 (schema), §11 (migration plan), §12 (RLS/storage matrix),
§21–22 (usage governance), §23 (retention/deletion), §33 (canonical values).
All schema changes are Supabase migrations in `supabase/migrations/` only. No manual
production edits, no ORM-generated schema.

## 1. Schema topology

| Schema | Audience | Exposure |
| --- | --- | --- |
| `public` | User-facing data, strict RLS on every table | Supabase Data API; client roles `authenticated` (limited), `anon` (denied) |
| `internal` | Jobs, cost, audit, model governance, provider payloads | Never exposed through the Data API; `service_role` (backend/worker) only |
| `auth` / `storage` | Supabase managed | Touched only via FK references, the new-user trigger, buckets and object policies |

## 2. Table ownership & derived-vs-source

Legend — **Writer**: which identity is allowed to mutate. Client roles can never write
AI-derived data (Spec §10 principle).

| Table | Writer (authority) | Derived or source? | Notes |
| --- | --- | --- | --- |
| `public.profiles` | User (locale/timezone only); service role (deletion) | Source | 1:1 with `auth.users`; auto-created by trigger |
| `public.user_consents` | User (grant/revoke own) | Source | Append/version history; research opt-in separate |
| `public.dogs` | User (create/update own) | Source | V1 plan limit 1 dog enforced by API entitlement |
| `internal.dog_profile_versions` | API (service role) | Derived audit | Snapshot on profile-affecting changes |
| `public.device_installations` | User (own devices) | Source | Push tokens; no hardware fingerprinting |
| `public.signal_experiments` | API/user-owned flow | Source observation | Idempotent attempt: allowlisted sound, visible reaction, measured latency, owner feedback |
| `public.signal_map_entries` | Deterministic Signals service | Derived aggregate | Per-dog sound reaction map; never a universal vocabulary |
| `public.behavior_captures` | API init/complete (service role) | Source metadata | Unique `(user_id, client_request_id)` idempotency |
| `public.behavior_events` | Worker/API only (service role) | Source + AI-derived fields | Statuses per §33.1; client read-only |
| `internal.behavior_observations` | Worker | Derived (observer output) | Evidence only — objective facts, no intent |
| `internal.behavior_interpretations` | Worker | Derived (reasoner output) | Hypothesis only — zero authority over patterns |
| `public.behavior_feedback` | User (own completed event) | Source (label, not ground truth) | One feedback per event per user |
| `internal.behavior_outcomes` | Worker/API | Source (observed outcome) | Independent supporting/contradicting evidence |
| `public.personal_patterns` | Personal Engine only (service role) | **Derived aggregate** | Anti-feedback-loop firewall: no client writes |
| `internal.pattern_event_links` | Personal Engine | Derived | SUPPORT/CONTRADICT evidence links |
| `public.knowledge_scores` | Scoring service (service role) | Derived | Versioned formula, append-only history |
| `public.fecal_events` | API (metadata) + worker (derived fields) | Source + AI-derived fields | Candidate flags never prove absence |
| `internal.digestive_observations` | Worker | Derived (vision output) | Observation separate from safety/rule layer |
| `public.food_products` | User (verify/edit own) | Source after `verified_at` | Only verified fields feed correlations |
| `public.feeding_periods` | User/API | Source | One open period per dog (partial unique index) |
| `public.digestive_baselines` | Baseline service (service role) | Derived | Compare Rocky to Rocky; association ≠ causality |
| `public.digestive_insights` | Digestive service (service role) | Derived | Safety flags are deterministic, non-downgradable |
| `public.subscriptions` | RevenueCat webhook/API (service role) | Mirror (not billing truth) | Client read-only summary |
| `public.usage_ledgers` | Quota RPCs only (service role) | Derived counter | Per user+period; no rollover |
| `internal.usage_reservations` | Quota RPCs | Derived | Idempotency anchor: RESERVED→COMMITTED/REFUNDED/RELEASED |
| `internal.analysis_jobs` | Worker/API | Ops | IDs only in payloads |
| `internal.ai_cost_events` | Worker (CostMeter) | Ops/telemetry | Per-call provider/model/version/cost |
| `internal.audit_log` | Services | Audit | No raw media/prompts/secrets |
| `internal.deletion_jobs` | Privacy service | Ops + completion evidence | Retryable purge workflow |
| `internal.export_jobs` | Privacy service | Ops | Expiring private export artifact |
| `internal.retention_policies` | Migrations/config | Config | TTL values (open decision O-05) |
| `public.ref_intents` / `ref_context_buckets` / `ref_status_values` | Migrations only | Reference | Codes + versions only; no scientific prose in DB |

## 3. Quota state machine (Spec §7.3, §22)

```
reserve_usage(user, domain, reference_id)
    row lock on current usage_ledgers row -> used+reserved+units <= limit?
    yes: reserved += units; usage_reservations row (RESERVED, unique reference_id)
    no:  QUOTA_EXHAUSTED (no state change)
commit_usage(reference_id)   RESERVED -> COMMITTED   reserved-=u, used+=u   (idempotent)
refund_usage(reference_id, reason)  RESERVED -> REFUNDED|RELEASED  reserved-=u (idempotent)
```

- Delivered analyses (clear, ambiguous, insufficient) are committed — they consume a unit.
- Quality rejection before meaningful AI work and terminal technical failures are refunded.
- Parallel requests serialize on the ledger row lock; allowance cannot be exceeded
  (tested by `supabase/tests/quota_concurrency.sh`).
- Repeating any RPC with the same `reference_id` is a safe no-op (duplicate tap/queue
  delivery protection).

## 4. RLS & grants summary (Spec §12)

- Every `public` table: `ENABLE` + `FORCE ROW LEVEL SECURITY`, shipped in the table's own
  migration and re-asserted in `0009_rls_grants.sql`.
- `authenticated`: own-row SELECT on user data; writes only where the matrix allows
  (dogs create/update, consents grant/revoke, feedback own event, food/feeding CRUD,
  devices CRUD, profiles locale/timezone). Signals writes go through the versioned
  API/service role; client roles can read only their own signal rows. No writes to
  behavior events, patterns, scores, baselines, insights, ledgers, subscriptions.
- `anon`: nothing.
- `internal.*`: no privileges for client roles (schema + table + routine + sequence level).
- Storage: private buckets `dog-avatars`, `behavior-raw`, `digestive-raw`, `food-labels`,
  `exports`; object policies require path segment 2 = `auth.uid()` and (for media buckets)
  the canonical path shape `users/{uid}/dogs/{dog_id}/{domain}/{event_id}/{uuid}.{ext}`.
  Malformed or cross-user paths fail closed.

## 5. Retention & deletion (Spec §23)

| Asset | Default | Mechanism |
| --- | --- | --- |
| Behavior raw video | TTL from `internal.retention_policies` (beta 24h after completion) | `expires_at` on `behavior_captures`; `internal.media_due_for_deletion` view; `internal.mark_media_deleted/kept` |
| Digestive raw photo | Short TTL (beta 24h) | Same pattern on `fecal_events.retention_state/expires_at` |
| Food label image | Delete after verified extraction (beta 1h) | `food_products.label_retention_state/label_expires_at` |
| Export artifact | Expiring private object (beta 7d) | `internal.export_jobs.expires_at`, bucket `exports` |
| Account deletion | Immediate revocation + async purge | `internal.begin_account_deletion()` stamps `profiles.deleted_at` and enqueues `internal.deletion_jobs`; purge evidence recorded without retaining content |

`USER_KEPT` / `RESEARCH_OPT_IN` (explicit consent) always win over TTL; the
due-for-deletion view never lists them. Structured events, observations, feedback and
patterns survive raw-media deletion — that is the durable product value.

## 6. Conventions

- No Postgres ENUMs for AI taxonomies: `text` + CHECK constraints or versioned reference
  tables (Spec §11.1). Canonical values: Spec §33.
- Migrations are forward-only; applied migrations are never edited.
- Every migration is reproducible from an empty local Supabase (`supabase db reset`).
- Provider/model/version are stored per call; model strings never appear in schema.
- Dogly Signals stores `client_request_id`, sound keys, observable behavior codes
  and optional reaction latency only; no raw video/audio, no voiceprint, no
  universal “meaning” labels.
- Tests: `supabase/tests/run_tests.sh` (reset → RLS negatives → quota serial →
  privacy/retention integration → quota race).
