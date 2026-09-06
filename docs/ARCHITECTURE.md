# ARCHITECTURE — Vista d'insieme, confini runtime/dati, flussi chiave

Data: 2026-09-06 • Fonte: Spec V1 (sez. 2, 8, 9, 10, 12, 22, 23) +
**SPEC_AMENDMENT_V1.1** (hosting Vercel + Vercel Workflows) +
`docs/DECISIONS.md` (ADR-001…012). Documento richiesto da Appendix B della Spec V1
("Runtime/service/data boundaries and diagrams").

Riferimenti di implementazione: `api/index.py`, `vercel.json`,
`backend/app/api/`, `backend/app/worker/`, `backend/app/domains/`,
`backend/app/providers/`, `backend/app/contracts/`, `supabase/migrations/`,
`apps/mobile/app/`, `apps/admin/`.

## 1. Vista d'insieme

Quattro pezzi deployati separatamente, più servizi esterni:

```
                          ┌──────────────────────────┐
                          │   Supabase (managed)     │
                          │  Auth · PostgreSQL ·     │
                          │  Storage (bucket privati)│
                          └──────────▲───────────────┘
              JWT (sessione utente)  │  signed URL (upload/read diretti)
                                     │  SQL via pooler (service role)
┌───────────────────┐   HTTPS /v1/*  │            │
│ Mobile Expo (RN)  ├────────────────┼────────┐   │
│ com.attilalab.    │  JWT Supabase  │        │   │
│ dogly — iOS/And.  │                ▼        ▼   │
└────────▲──────────┘   ┌─────────────────────────┴──┐
        │               │ Backend FastAPI su Vercel  │
        │ push token    │ (serverless, api/index.py) │
        │ (Expo Push)   │                            │
        │               │  Public API /v1/*  (JWT)   │
┌───────┴──────────┐    │  Worker interno /tasks/run │
│ Admin Control    │    │  (x-internal-token)        │
│ Center Next.js   │    └───────▲───────────┬────────┘
│ (apps/admin,     │            │ dispatch  │ HTTPS
│ progetto Vercel  │   job queue│ (solo ID) │ (provider AI)
│ separato — V0    │   ┌────────┴───────┐   ▼
│ read-model mock) │   │ Vercel         │  ┌────────────────┐
└──────────────────┘   │ Workflows      │  │ Gemini observer│
                       │ (dietro        │  │ OpenAI reasoner│
┌──────────────────┐   │ adapter        │  │ DigestiveVision│
│ RevenueCat       │   │ JobQueue)      │  └────────────────┘
│ (billing)        │   └────────────────┘
└────────┬─────────┘
         │ webhook firmato → POST /v1/webhooks/revenuecat → entitlement mirror
         └──────────────────────────────► (public API, nessun JWT utente)
```

- **Mobile** (`apps/mobile/`, Expo Router, 3 tab Home/Fotocamera/{cane}): parla solo
  con la public API `/v1/*` con JWT Supabase; i media grandi bypassano l'API via
  signed URL diretti a Supabase Storage (Vercel non è proxy di banda, Spec sez. 12.1).
  Nessun segreto nel mobile: solo `EXPO_PUBLIC_*` pubblici.
- **Backend** (`api/index.py` shim): una singola serverless function Vercel che monta
  la public app (`backend/app/api/app.py`) e la worker app (`backend/app/worker/main.py`).
  `vercel.json` riscrive `/*` → `/api/index`, `maxDuration: 60`.
- **Supabase**: Auth (JWT validato lato FastAPI), PostgreSQL (schema `public` + `internal`),
  Storage con bucket privati e object policy path-scoped.
- **Async**: job durevoli via adapter `JobQueue` → Vercel Workflows (Amendment V1.1);
  il payload dei task contiene solo ID, mai media bytes né segreti.

## 2. Confini runtime

| Surface | Route | Auth | Chi la chiama |
| --- | --- | --- | --- |
| Public API | `/v1/*` | JWT Supabase (firma/JWKS, issuer, expiry, audience; `user_id` solo da `sub`) | Mobile |
| Webhook billing | `POST /v1/webhooks/revenuecat` | Firma `REVENUECAT_WEBHOOK_SECRET`, nessun JWT, event ID idempotenti | RevenueCat |
| Worker interno | `POST /tasks/run` | Header `x-internal-token` = `WORKER_INTERNAL_TOKEN`; nessun ingress pubblico logico | Solo dispatcher `VercelWorkflowsJobQueue` |
| Admin (futuro) | `/v1/admin/*` | RBAC server-side (6 ruoli), read-model dedicato | Admin Control Center (ADR-011, V0 = mock tipizzati) |

Separazione public/private concettualmente identica alla Spec V1 (Cloud Run); su
Vercel si realizza con route pubbliche vs route interne protette, senza refactor
di dominio (Amendment V1.1).

### Adapter provider — sostituibilità (`backend/app/providers/base.py`)

| Interfaccia | Impl. local/CI | Impl. target V1 | Sostituzione |
| --- | --- | --- | --- |
| `JobQueue.enqueue` | `InMemoryJobQueue` (`mock.py`) | `VercelWorkflowsJobQueue` | `JOB_QUEUE_BACKEND` + `WORKFLOW_BASE_URL` |
| `VideoObserver.observe` | mock fixture-backed | `gemini_observer.py` (G3) | config `OBSERVER_PROVIDER/MODEL` |
| `Reasoner.interpret` | mock fixture-backed | `openai_reasoner.py` (G3) | config `REASONING_PROVIDER/MODEL` |
| `DigestiveVision.observe_stool` | mock fixture-backed | adapter vision (G3) | config `DIGESTIVE_VISION_PROVIDER/MODEL` |
| `StorageProvider` | mock | `supabase_storage.py` | config `STORAGE_PROVIDER` |
| `CostMeter.record` | mock | `db_cost_meter.py` → `internal.ai_cost_events` | interno |
| `PersonalEngine.update` | — | servizio deterministico (workstream G) | **zero autorità** della predizione generativa (ADR-004) |

Model ID solo in config, mai hard-coded (O-03). Nessuna dipendenza GCP nel codice
V1 (test `test_job_queue.py`); Cloud Run/Tasks restano solo future scaling path via
nuovo adapter `JobQueue`, senza refactor di dominio.

## 3. Confini dati

- **Schema `public`**: dati utente, RLS stretta (`ENABLE` + `FORCE`) su ogni tabella;
  esposto via Supabase Data API con ruoli `authenticated` (limitato) / `anon` (negato).
  Il client non scrive mai dati AI-derived (eventi, observation, interpretation,
  pattern, ledger, subscriptions): scritture solo via API con ownership check.
- **Schema `internal`**: jobs, costi, audit, payload provider, retention
  (`analysis_jobs`, `ai_cost_events`, `audit_log`, `deletion_jobs`, `export_jobs`,
  `behavior_observations`, `behavior_interpretations`, …) — **mai esposto** via Data
  API; accesso solo `service_role` (backend/worker). Test negativi dedicati.
- Dettaglio tabelle/writer/RLS: `docs/DATA_MODEL.md`.

### Retention (Spec sez. 23, O-05)

| Asset | Default beta | Meccanismo |
| --- | --- | --- |
| Raw video behavior | 24h dal completamento terminale | `expires_at` su `behavior_captures`, view `media_due_for_deletion`, job `media_retention_cleanup` |
| Raw foto digestiva | 24h | stesso pattern su `fecal_events` |
| Foto etichetta cibo | 1h post-estrazione verificata | `food_products.label_expires_at` |
| Album / galleria cane | **persistente** (fino a delete utente) | bucket privati, share OS |
| Storie | 24h | viewer mobile, separate dagli album (ADR-007) |
| Export account | 7 giorni | `internal.export_jobs.expires_at`, bucket `exports` privato |
| Account deletion | revoca immediata + purge asincrono | `begin_account_deletion()` → `internal.deletion_jobs` |

`USER_KEPT` / `RESEARCH_OPT_IN` (consenso esplicito) vincono sempre sul TTL. Eventi
strutturati, observation, feedback e pattern sopravvivono alla cancellazione dei raw.

### Fonte di verità dello schema

Solo migrazioni SQL in `supabase/migrations/` (attualmente `0001`–`0022`),
**forward-only**: mai editare una migrazione applicata, mai schema ORM-generated,
riproducibili da zero con `supabase db reset` (Spec sez. 11.1).

## 4. Flussi chiave

### 4.1 Analisi behavior end-to-end

```
Mobile          API /v1          Supabase Storage   JobQueue    Worker /tasks    Provider AI
  │ capture video │                  │                │             │               │
  │── POST /behavior/captures/init ─►│                │             │               │
  │                │ reserve_usage atomico (quota)    │             │               │
  │                │── signed upload URL (path esatto, TTL 600s) ──►│             │
  │◄───────────────│                 │                │             │               │
  │── PUT video (diretto, bypassa API) ──────────────►│             │               │
  │── POST /captures/{id}/complete ─►│                │             │               │
  │                │── enqueue(task=solo event_id) ───────────────►│               │
  │                │                 │                │── /tasks/run (x-internal-token) ─►│
  │                │                 │◄── signed read URL (server-side) ──│         │
  │                │                 │                │             │── observe() ──►│ Gemini
  │                │                 │                │             │◄ ObservationContract │
  │                │                 │                │             │ KB retrieval V2 (ADR-012, card tag-based, no RAG PDF)
  │                │                 │                │             │── interpret(obs + contesto + memoria eligibile) ─►│ OpenAI
  │                │                 │                │             │◄ InterpretationContract + advice (max 1, da catalogo) │
  │                │◄── commit_usage + evento COMPLETED + TTL raw 24h ────│         │
  │◄─ GET /behavior/events/{id} (poll) │              │             │               │
  │◄── notifica push (Expo Push, device_installations) │            │               │
```

Idempotenza: `(user_id, client_request_id)` unique sul capture; handler worker no-op
su evento terminale alla riconsegna; retry fino a `MAX_TASK_ATTEMPTS = 5`.

### 4.2 Analisi digestiva

Stesso skeleton (init → upload signed → complete → job → worker), con differenze:

```
Worker: DigestiveVision.observe_stool(foto) → StoolObservationContract
      → safety/rule layer DETERMINISTICO (domains/digestive.py, flag non downgradabili)
      → confronto con baseline personale (digestive_baselines: "Rocky vs Rocky")
      → insight + candidate flag (mai prova di assenza) → evento COMPLETED
```

### 4.3 Export / delete account

```
Mobile ── POST /v1/privacy/export ──► API: enqueue export job ──► Worker:
      raccoglie dati utente → artifact nel bucket privato `exports` (expiry 7gg)
      ──► GET /v1/privacy/export/{job_id} → signed URL temporaneo

Mobile ── POST /v1/privacy/delete-account ──► API:
      begin_account_deletion() → profiles.deleted_at (revoca immediata accesso)
      + enqueue deletion_jobs ──► Worker: purge retryable/auditabile di dati e media,
      evidenza di completamento registrata SENZA conservare contenuto
```

### 4.4 Webhook billing → entitlement

```
RevenueCat ── POST /v1/webhooks/revenuecat (firma verificata, event ID idempotente)
          ──► API: aggiorna mirror public.subscriptions (service role)
          ──► entitlement server-side governa quota/feature; l'entitlement del mobile
              NON è mai autorevole (lettura solo del mirror)
```

## 5. Stato reale vs target

Fotografia onesta al 2026-09-06 (fonte `PROJECT_STATE.md`):

| Area | Implementato oggi | Target V1/V2 |
| --- | --- | --- |
| Schema DB + RLS + quota atomica | ✅ Migrazioni `0001`–`0022`, RLS, reserve/commit/refund | — |
| Public API `/v1/*` | ✅ Route behavior/digestive/dogs/diary/patterns/care/privacy/webhooks… (OpenAPI snapshot in CI) | — |
| Worker `/tasks/run` + JobQueue adapter | ✅ Vercel Workflows + fake locale; idempotenza; retry | — |
| Persistenza SQL | 🔶 Parziale: Postgres per dogs/behavior/quota/idempotency/signals; resto in completamento | Tutte le tabelle su Postgres via pooler |
| Provider AI | 🔶 Adapter Gemini/OpenAI scritti; mock fixture-backed in local/CI; provider reali non integrati (blocker B-4, gate G3) | Observer Gemini + reasoner OpenAI in produzione |
| Coda mobile offline | 🔶 Capture/upload/poll reali wired; giro e2e mobile→upload→worker da chiudere (G2) | Coda SQLite locale + sync |
| Admin Control Center | 🔶 V0: Next.js standalone, read-model mock tipizzato | Endpoint `/v1/admin/*` + RBAC 6 ruoli |
| Evidence Retrieval Layer / KB scientifica | ⬜ Fonti registrate in `docs/kb/` (ADR-012); moduli `backend/app/knowledge/` non ancora implementati | Retrieval card tag-based + Advice Engine V2 (DogContextSnapshot, catalogo consigli) |
| Dogly Signals | ⬜ POSTPONED (ADR-010): schema isolato, nessun ingresso visibile | Eventuale riattivazione con nuova decisione prodotto |
| Billing RevenueCat | 🔶 Webhook + quota implementati; pagamenti reali out of scope per la beta | Sandbox IAP → store |

## 6. Decisioni architetturali

Registro completo in `docs/DECISIONS.md` (non duplicato qui):

- ADR-001 stack LOCKED • ADR-002 Vercel + Workflows (Amendment V1.1) •
  ADR-003 contratti canonici e confini provider • ADR-004 firewall anti-feedback-loop •
  ADR-005 quota atomica, no unlimited • ADR-006…010 UX/product (check-in, storie,
  digestivo, agenda, Signals) • ADR-011 Admin Control Center •
  ADR-012 Knowledge Base scientifica + Advice Engine V2.
- Decisioni aperte O-01…O-09: stessa fonte; mai risolverle per congettura.

## 7. Scalabilità e limiti noti

- **Cold start serverless**: la function Python Vercel carica l'intera app FastAPI
  (public + worker montate); il primo hit dopo idle paga l'import. Gli endpoint
  `/health` e `/ready` (con check DB) supportano smoke/monitoring.
- **`maxDuration: 60` s** (`vercel.json`): l'analisi video NON può avvenire
  sincronamente nella request pubblica — per questo il path è sempre asincrono
  (complete → job → worker) e il client fa polling/notifica. Limite da rivedere se
  il piano Vercel cambia; mai spostare inferenza AI nel request path pubblico.
- **Pooler Supabase**: `DATABASE_URL` punta al connection pooler (transaction mode);
  sessioni lunghe e prepared statement vanno trattati di conseguenza.
- **Guardrail di costo**: limiti di concorrenza/spending Vercel + budget provider AI
  con kill switch + CostMeter per chiamata (Spec sez. 27, invariata da V1.1).
  Procedure operative (outage provider, kill switch, backlog coda, retention,
  rollback): `docs/RUNBOOK.md`.
- **Retry e backlog**: Vercel Workflows fornisce durability/retry/backoff; fallimento
  di dispatch 5xx = `QueueUnavailableError` retryable; handler idempotenti alla
  riconsegna (Spec sez. 22).
- **Future scaling path**: Cloud Run/Cloud Tasks adottabili con un nuovo adapter
  `JobQueue`, senza refactor di dominio (Amendment V1.1) — citabili solo in questa vece.

---

Stato: creato 2026-09-06, colmando il requisito Appendix B della Spec V1.
