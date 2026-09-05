# Dogly

App mobile consumer (iOS/Android) che interpreta il comportamento del cane da brevi
video (5–20 s) e monitora la salute digestiva da foto delle feci, con sistema
longitudinale di Personal Intelligence anti-feedback-loop.

**Brand:** Dogly (`com.attilalab.dogly`). Internal repo/package history may still
reference “Canine Behavioral Intelligence / CBI”.

**Source of truth:** Engineering Spec V1 (DOCX esterno) +
`SPEC_AMENDMENT_V1.1.md` (hosting Vercel + Vercel Workflows — vincolante) +
`docs/ux/UX_REFERENCE.md` (UX V1) + `docs/DECISIONS.md`.

Stato corrente dei gate e blocker: vedi `PROJECT_STATE.md`.

## Struttura del repository

| Path | Contenuto | Owner (workstream) |
| --- | --- | --- |
| `apps/mobile/` | App Expo React Native + TypeScript (Router, 3 tab) — brand Dogly | A / F |
| `api/index.py` | Shim serverless Vercel (public API + worker mount) | D / C |
| `vercel.json` | Config deploy root (includeFiles backend) | D |
| `backend/app/api/` | Public FastAPI API (route `/v1/*`, JWT Supabase) | C |
| `backend/app/worker/` | Handler privati dei job asincroni (route `/tasks/run`, auth interna) | C / D |
| `backend/app/domains/` | dogs, behavior, digestive, billing, privacy | C |
| `backend/app/providers/` | Adapter Gemini/OpenAI/Storage/JobQueue (mock fixture-backed in V1 locale) | E |
| `backend/app/contracts/` | Schemi Pydantic request/response/provider (Observation/Interpretation) | E |
| `backend/tests/` | Test pytest: auth, quota, idempotenza, contratti, job queue, worker | C / J |
| `supabase/migrations/` | Unica sorgente dello schema DB (0001–0014, forward-only) | B |
| `supabase/tests/` | Test SQL: RLS negative, quota, privacy/retention | B / J |
| `infra/vercel/` | Config deploy Vercel (`vercel.json`, env mapping) — Amendment V1.1 | D |
| `scripts/` | Export OpenAPI, utility fixture/eval | C / J |
| `docs/` | Architettura, security, runbook, decisioni, eval | vari |

Stack LOCKED (Spec V1 sez. 2, con Amendment V1.1): React Native + Expo + TypeScript •
FastAPI + Pydantic v2 (Python 3.12+) • Supabase (PostgreSQL/Auth/Storage) •
**Vercel** (hosting) + **Vercel Workflows** (async, dietro adapter `JobQueue`) •
Gemini (observer) / OpenAI (reasoner) via adapter • RevenueCat (billing) •
GitHub Actions + EAS (CI/CD).

## Prerequisiti

- Python 3.12+ con [uv](https://docs.astral.sh/uv/)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (stack locale PostgreSQL/Auth/Storage)
- Node.js LTS + **pnpm** (packageManager in `apps/mobile/package.json`), Expo CLI / EAS CLI
- Docker (richiesto da Supabase CLI per lo stack locale)

## Setup locale — backend

```bash
cd backend
cp .env.example .env        # default local: provider mock, queue fake, repo in-memory
uv sync                     # installa dipendenze (venv)
uv run pytest               # suite unit/contract/integration (27 test al gate G1)
uv run uvicorn app.api.app:app --reload          # public API locale
uv run uvicorn app.worker.main:worker_app --reload --port 8001  # worker locale
```

In locale **nessuna credenziale cloud è necessaria**: `JOB_QUEUE_BACKEND=fake`
(coda in-process), provider AI mock fixture-backed, repository in-memory se
`DATABASE_URL` è vuoto. Le chiamate AI pagate sono sempre mockate in CI (Spec V1
sez. 0.2).

Export del contratto OpenAPI (usato dal contract-drift check in CI):

```bash
uv run python ../scripts/export_openapi.py   # aggiorna docs/openapi.json
```

## Setup locale — database (Supabase CLI)

```bash
supabase start              # stack locale (DB, Auth, Storage)
supabase db reset           # applica migrations 0001–0014 + seed.sql da zero
bash supabase/tests/run_tests.sh   # RLS negative tests, quota, privacy/retention
```

Regole vincolanti (Spec V1 sez. 11.1): ogni modifica schema è una nuova migrazione
committed (mai editare una migrazione applicata in produzione); niente ENUM Postgres
per tassonomie AI in evoluzione; RLS/grants nella stessa gate della tabella.

> Nota di stato: la suite test DB è stata eseguita finora su harness PostgreSQL 16
> con stub delle funzioni Supabase, **non** ancora su `supabase start` reale —
> vedi blocker in `PROJECT_STATE.md`.

## Setup locale — mobile

```bash
cd apps/mobile
pnpm install
cp .env.example .env.local   # EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
pnpm start                   # Metro / Expo Go per UI; development build per moduli nativi e IAP
```

Le variabili `EXPO_PUBLIC_*` possono contenere **solo valori pubblici** (URL Supabase,
publishable key, base URL API). Nessun segreto nel mobile (Spec V1 sez. 4.2).
Acquisti reali RevenueCat richiedono un Expo development build, non Expo Go
(Spec V1 sez. 21.1).

## Ambienti e configurazione

| Ambiente | Scopo | Regole |
| --- | --- | --- |
| `local` | Sviluppo | Supabase CLI locale, fake queue, fixture AI, repo mock |
| `staging` | Integrazione device/provider | = Vercel **preview deployments** (Amendment V1.1); Supabase/RevenueCat sandbox; budget AI ridotto |
| `production` | Utenti store | Deploy Vercel **manuale gated** (checklist firmata, `docs/RELEASE_CHECKLIST.md`); segreti/DB/bucket separati |

Configurazione backend via env (pydantic-settings, `backend/app/config.py`;
in staging/prod = **Vercel Environment Variables**). Voci principali:

| Gruppo | Variabili | Note |
| --- | --- | --- |
| Env | `APP_ENV` | `local` / `staging` / `production` |
| Auth | `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_AUDIENCE` | Validazione JWT Supabase (sez. 24.2) |
| DB | `DATABASE_URL` | Pooler Supabase; vuoto = mock repo in local |
| AI routing | `OBSERVER_PROVIDER/MODEL`, `REASONING_PROVIDER/MODEL`, `DIGESTIVE_VISION_PROVIDER/MODEL` | Model ID solo in config (O-03), mai hard-coded |
| Queue | `JOB_QUEUE_BACKEND` (`fake`/`vercel_workflows`), `WORKFLOW_BASE_URL` | Amendment V1.1 |
| Worker auth | `WORKER_INTERNAL_TOKEN` | Header `x-internal-token` sulle route interne |
| Billing | `REVENUECAT_WEBHOOK_SECRET` | Solo API, verifica firma webhook |
| Storage/media | `STORAGE_PROVIDER`, `STORAGE_SIGNED_URL_TTL_SECONDS`, `RAW_MEDIA_TTL_HOURS`, `MAX/MIN_VIDEO_DURATION_MS` | TTL retention e contratto capture |

Dettaglio completo deploy/env: `infra/vercel/README.md`.

## Documentazione

| File | Contenuto |
| --- | --- |
| `PROJECT_STATE.md` | Gate corrente, scope implementato, blocker, evidenze |
| `docs/DECISIONS.md` | ADR e decisioni LOCKED/aperte (O-01…O-09) |
| `docs/DATA_MODEL.md` | Tabelle, ownership, retention, RLS |
| `docs/AI_CONTRACTS.md` | Contratti Observation/Interpretation, policy, provider routing |
| `docs/SECURITY.md` | Threat model, segreti, RLS/storage, webhook/task auth |
| `docs/RUNBOOK.md` | Incidenti operativi: outage provider, kill switch, backlog, retention, rollback |
| `docs/RELEASE_CHECKLIST.md` | Checklist firmabile staging→production |
| `docs/EVALS.md` | Strategia di valutazione AI (spike video/foto, metriche) |
| `docs/ux/` | Riferimento UX ufficiale e mockup |
| `docs/openapi.json` | Snapshot OpenAPI V1 (31 path) per contract-drift check |
