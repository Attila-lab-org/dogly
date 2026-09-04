# AI Contracts — Observation / Interpretation / Provider Boundaries

Fonte: Spec V1 sez. 14–17, 22, 25 + **SPEC_AMENDMENT_V1.1** (hosting/queue).
Implementazione: `backend/app/contracts/`, `backend/app/providers/`, `backend/app/worker/`.

## 1. Provider interface boundaries (spec 14.1) — INVARIATE da V1.1

Definite in `backend/app/providers/base.py`:

| Interfaccia | Input | Output | Invariante |
| --- | --- | --- | --- |
| `VideoObserver.observe` | riferimento video temporaneo + versione policy | `ObservationContract` | Solo osservabili; nessun intent finale |
| `Reasoner.interpret` | `ObservationContract` + contesto + policy + memoria personale eligibile | `InterpretationContract` | Deve supportare astensione/alternative |
| `DigestiveVision.observe_stool` | riferimento immagine | `StoolObservationContract` | Osservazione separata dal safety/rule layer |
| `CostMeter.record` | usage provider + metadati operazione | record costo | Ogni chiamata pagata tracciabile a evento/utente |
| `StorageProvider` | bucket/path/ttl | signed URL | API mai proxy di banda (sez. 12.1) |
| `JobQueue.enqueue` | task_type + payload (solo ID) | task id | Vendor decoupling (sez. 8.3, V1.1) |

`PersonalEngine.update` (spec 14.1/17): la predizione generativa ha **zero autorità** —
gli handler worker non mutano mai i Personal Patterns da output generativo; gli update
passano dal servizio deterministico di Personal Intelligence (workstream G, P0
conservativo). Release blocker 31.2.

Adapter V1 local/CI: mock fixture-backed (`backend/app/providers/mock.py`,
fixtures in `backend/app/providers/fixtures/`), stessi Protocol dei provider reali.
Adapter reali Gemini (observer) / OpenAI (reasoner, structured output) in gate G3;
swap solo di config (O-03: model ID in `OBSERVER_MODEL` / `REASONING_MODEL` /
`DIGESTIVE_VISION_MODEL`, mai hard-coded).

## 2. ObservationContract V0 (`backend/app/contracts/observation.py`)

Sezioni (spec 15): `capture_quality`, `scene`, `body`, `head_face`, `ears`, `tail`,
`vocalization`, `timeline[]`, `unknowns[]`, `observer_meta` (schema_version, provider,
model, request_id). Ogni campo supporta unknown/not_visible; posizioni di orecchie/coda
sono relative al neutro individuale (morphology-aware), non voci deterministiche di
dizionario (16.1).

Regole: observation ≠ interpretation (mai inventare osservazioni mancanti);
contenuto dei media = untrusted (prompt-injection rule, spec 15); output sempre
validato a schema Pydantic; il JSON grezzo del provider non diventa mai contratto
mobile (sez. 3.1).

## 3. InterpretationContract V0 (`backend/app/contracts/interpretation.py`)

Campi (spec 16.3): `primary_intent` (tassonomia chiusa `IntentCode` in
`contracts/taxonomy.py`, spec 16.2 — PLAY_INTERACTION, ATTENTION_REQUEST,
OUTSIDE_REQUEST, ALERT_VIGILANCE, DISCOMFORT_AVOIDANCE, FEAR_INSECURITY, HIGH_AROUSAL,
FRUSTRATION, RELAX_REST, RESOURCE_TENSION, AMBIGUOUS, INSUFFICIENT — o null se
insufficiente); `confidence_band` LOW/MEDIUM/HIGH (**mai % numeriche**, O-07);
`consumer_summary` con wording probabilistico ("sembra / probabilmente / possibile");
`alternatives[]` (0–2); `evidence[]` (3–5, tipizzati per sorgente); `contradictions[]`;
`personal_memory_used[]` (solo pattern eligibili: PRELIMINARY/ESTABLISHED/STRONG);
`needs_context`; `safety_flags[]` (consumati dal copy layer deterministico — il testo
generato non può downgrade/sopprimere un flag); versioni schema/policy/taxonomy
obbligatorie per audit/replay.

Evidence precedence (16.1/17.3): video corrente → contesto → policy generale →
memoria personale eligibile. La memoria ri-ordina, non riscrive il presente.
Digestive: `StoolObservationContract` in `contracts/digestive.py`; safety routing
deterministico in `domains/digestive.py` (sez. 19.3).

## 4. Provider routing (spec 14.2)

Default = modello meno costoso che passa le eval; escalation solo per schema failure,
ambiguità/caso high-value o safety policy; provider/model/version persistiti per
chiamata (cost telemetry, sez. 25.1); nuovi modelli in shadow evaluation prima dello
switch; kill switch + budget provider come guardrail (sez. 27).

## 5. Deploy & Queue (aggiornato per SPEC_AMENDMENT_V1.1)

- **Hosting V1 = Vercel**: FastAPI su Vercel (Python runtime / serverless functions).
  Config in `infra/vercel/` (`vercel.json`, env mapping, note deploy).
- **Async processing = Vercel Workflows**: job durevoli, retryable, push-based.
  La coda resta dietro il protocollo `JobQueue` (`backend/app/providers/base.py`):
  - V1: `VercelWorkflowsJobQueue` (`backend/app/providers/vercel_workflows.py`) —
    dispatch verso la route interna `/tasks/run` con header `x-internal-token`;
    durability/retry/backoff forniti dalla piattaforma; fallimento di dispatch 5xx =
    retryable (`QueueUnavailableError`).
  - Local dev / CI: `InMemoryJobQueue` (`backend/app/providers/mock.py`) — invariato.
  - Selezione via `JOB_QUEUE_BACKEND` + `WORKFLOW_BASE_URL` (`backend/app/config.py`,
    factory `build_job_queue`).
- **Separazione public API / private worker** (concettualmente invariata): app pubblica
  `backend/app/api/app.py` (route `/v1/*`, JWT Supabase) vs surface interna
  `backend/app/worker/main.py` protetta da token interno; handler idempotenti
  (`backend/app/worker/handlers.py`: evento terminale = no-op su riconsegna, sez. 22).
- **Nessuna dipendenza GCP** nel codice V1 (niente google-cloud-tasks /
  google-cloud-secret-manager): segreti via **Vercel Environment Variables**, letti da
  pydantic-settings.
- **Media path invariato**: upload diretti a Supabase Storage via signed URL; Vercel
  non è proxy di banda.
- **Future scaling path**: Cloud Run / Cloud Tasks adottabili in seguito con un nuovo
  adapter `JobQueue`, senza refactor di dominio. Citabili solo in questa vece.
- **Guardrail di costo**: limiti di concorrenza/spending Vercel + budget provider AI
  con kill switch (obiettivi spec 27 invariati).

## 6. Error taxonomy (spec 22.1)

`backend/app/contracts/errors.py`: codici stabili (AUTH_REQUIRED, QUOTA_EXHAUSTED,
UPLOAD_URL_EXPIRED, VIDEO_TOO_SHORT/LONG, QUALITY_NO_DOG, QUALITY_LOW,
PROVIDER_TIMEOUT, PROVIDER_SCHEMA_INVALID, PROCESSING_FAILED, SUBSCRIPTION_SYNC,
SAFETY_REVIEW, ...) con `retryable` + http_status + `correlation_id`; mai stack trace
provider verso il client. Quota: reserve atomico server-side; refund solo per quality
rejection pre-AI e failure tecniche terminali; commit al completamento (sez. 7.3/22,
implementato in `domains/billing.py` + `worker/handlers.py`).

## 7. Eval & versioning

Fixture-based contract tests in CI (niente chiamate pagate, spec 0.2/26); real-provider
eval separata, budgeted, dog-disjoint (spec 26/34 → `docs/EVALS.md`).
