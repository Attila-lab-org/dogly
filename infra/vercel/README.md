# Deploy su Vercel (SPEC_AMENDMENT_V1.1 — vincolante per V1)

Hosting V1 = **Vercel** (FastAPI su Vercel Python runtime / serverless functions).
Async processing = **Vercel Workflows** (job durevoli, retryable, push-based) dietro
l'interfaccia `JobQueue` (`backend/app/providers/base.py`; adapter V1 in
`backend/app/providers/vercel_workflows.py`; fake queue locale in
`backend/app/providers/mock.py` — invariata). **Nessuna dipendenza GCP** nel codice
V1. Cloud Run / Cloud Tasks restano solo *future scaling path* documentato: la
migrazione futura richiede solo un nuovo adapter `JobQueue`, senza refactor di dominio.

## Struttura deploy

- Il progetto Vercel punta alla root del repo.
- Entrypoint serverless: `api/index.py` (shim che esporta le app FastAPI
  `backend.app.api.app:app` — public — e `backend.app.worker.main:worker_app` —
  internal workflow routes). `vercel.json` instrada il traffico pubblico verso
  l'app API; le route `/tasks/run` del worker sono raggiungibili solo con il
  token interno (vedi sotto).
- Route pubbliche: `/v1/*` (JWT Supabase) — app `backend/app/api/app.py`.
- Route interne workflow: `/tasks/run` (`backend/app/worker/main.py`) — protette
  dall'header `x-internal-token` = `WORKER_INTERNAL_TOKEN`. Nessun ingress
  pubblico logico: il dispatcher `VercelWorkflowsJobQueue` è l'unico chiamante
  attestato; handler idempotenti alla riconsegna (spec 22).
- I media grandi **bypassano** l'API via signed URL diretti a Supabase Storage:
  Vercel non fa mai da proxy di banda (spec 8/12.1, invariato).

## Environment Variables (Vercel → pydantic-settings)

`backend/app/config.py` legge tutto da env (Vercel Environment Variables per
ambiente: Production / Preview / Development). Nessun secret manager esterno in V1.

| Variabile | Ambiente | Note |
| --- | --- | --- |
| `APP_ENV` | tutti | `local` / `staging` / `production` |
| `SUPABASE_JWT_ISSUER` / `SUPABASE_JWKS_URL` / `SUPABASE_JWT_AUDIENCE` | tutti | validazione JWT Supabase (sez. 24.2) |
| `DATABASE_URL` | staging/prod | Supabase pooler (SQLAlchemy 2 async); vuoto = mock repo in local |
| `OBSERVER_PROVIDER` / `OBSERVER_MODEL` | tutti | modello = config (O-03), mai hard-coded |
| `REASONING_PROVIDER` / `REASONING_MODEL` | tutti | idem |
| `DIGESTIVE_VISION_PROVIDER` / `DIGESTIVE_VISION_MODEL` | tutti | idem |
| `GEMINI_API_KEY` *(quando adapter reale G3)* | staging/prod | solo workflow interni (observer) |
| `OPENAI_API_KEY` *(quando adapter reale G3)* | staging/prod | solo workflow interni (reasoner/digestive) |
| `REVENUECAT_WEBHOOK_SECRET` | staging/prod | solo API (verifica firma webhook) |
| `JOB_QUEUE_BACKEND` | tutti | `fake` (local) / `vercel_workflows` (staging/prod) |
| `WORKFLOW_BASE_URL` | staging/prod | es. `https://<deployment>.vercel.app` |
| `WORKER_INTERNAL_TOKEN` | staging/prod | auth interna route workflow |
| `STORAGE_PROVIDER` / `STORAGE_SIGNED_URL_TTL_SECONDS` | tutti | signed URL Supabase Storage |
| `RAW_MEDIA_TTL_HOURS` | tutti | retention raw media (default 24h beta) |
| `MAX_VIDEO_DURATION_MS` / `MIN_VIDEO_DURATION_MS` | tutti | contratto capture (sez. 13) |

Classi di segreti (spec 4.2) invariate: niente segreti nel mobile; chiavi provider
solo server-side; RevenueCat secret solo API.

## CI/CD (GitHub Actions, spec 28 con target Vercel)

- **Staging** = Vercel *preview deployments* su PR/push; migrazioni staging solo
  dopo test verdi; smoke test provider con budget cap.
- **Production** = deploy Vercel **manuale gated** (release checklist firmata,
  spec 28.3/31). Backend prima del mobile quando l'API è backward compatible.
- Guardrail di costo: limiti di concorrenza/spending Vercel + budget provider AI
  con kill switch (sostituiscono max-instances Cloud Run; obiettivi spec 27 invariati).
- Mobile: EAS invariato.

## Local dev

`JOB_QUEUE_BACKEND=fake` → `InMemoryJobQueue` (in `backend/app/providers/mock.py`);
i task vengono invocati in-process dai test o via worker app locale. Nessuna
credenziale cloud necessaria. Vedi `backend/.env.example`.
