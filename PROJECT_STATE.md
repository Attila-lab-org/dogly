# PROJECT STATE — Canine Behavioral Intelligence

Ultimo aggiornamento: 2026-09-04 (sera) • Branch integrazione: `main` @ `7d70992`
(merge fix/review-gate — GATE UX/SPEC **PASS** dopo re-review indipendente)

## Gate corrente

| Gate | Stato | Evidenza |
| --- | --- | --- |
| **G1 — Data/security contract** | ✅ **COMPLETATO** | Migrazioni `supabase/migrations/0001–0012` (schema public+internal, RLS, storage policies, quota RPC atomiche reserve/commit/refund, privacy/retention); test SQL in `supabase/tests/` (RLS negative, quota, quota concurrency, privacy/retention); backend skeleton FastAPI con OpenAPI V1 a **23 path** (`docs/openapi.json`); suite pytest **27 passed** (auth JWT JWKS/HS256/expiry/issuer, quota atomica con race, idempotenza init/complete, adapter JobQueue Vercel + guard no-GCP, worker e2e/idempotenza/internal-auth, fixture contracts). Commit: `98d7574`, `db57d19`, `86637a4`. |
| **Amendment V1.1** | ✅ Registrato e recepito | Hosting = Vercel; async = Vercel Workflows dietro adapter `JobQueue` (`backend/app/providers/vercel_workflows.py`, fake locale in `mock.py`); `infra/vercel/` (vercel.json + README deploy/env); nessuna dipendenza GCP nel codice V1. Vedi `docs/DECISIONS.md` (ADR-002). |
| **G0 — Platform spike (mobile)** | 🔶 **PARZIALE** | Shell Expo + TS mergiata (`98eaf4c`…`c9199c9`): Expo SDK 57, RN **0.86.3** (pin per fix `rn-get-polyfills`, commit `bb3f1ce`), expo-router, TanStack Query, RHF+Zod, SQLite upload queue, SecureStore wrapper, design tokens da mockup, 3 tab UX-lock, 23 route. `tsc` ✅, jest **45/45** ✅, `npm ci` ✅, `expo export` iOS+Android ✅. Manca: verifica su dispositivi reali (camera/mic/dev build/RevenueCat sandbox) — non eseguibile in sandbox (B-3). |
| **G4 — Consumer behavior MVP (UX mobile)** | 🔶 **UX COMPLETA SU MOCK** | Tutte le schermate sez. 5–7 implementate fedeli al mockup ufficiale (`docs/ux/`) e ai UX-lock: Home (CTA gradiente "Capisci Rocky", dog card, Knowledge Score, ultima analisi, quota sottile), capture (state machine 5 stati, hard cap 20s, mic separato), processing (stepper + retry/quality/provider error), result (band senza %, 3–5 evidence, alternative, feedback 3 vie), Diario (timeline+filtri+dettaglio), Rocky (pattern/baseline/digestione), digestive flow, nutrition (scan OCR/verify), settings/privacy/export/delete, paywall (prezzi da mock entitlement), auth gate journey 7.1. Mock generati dai contratti (regola 29.2). |
| **GATE UX/SPEC (Stage 3)** | ✅ **PASS** | Reviewer indipendente: 17/17 check PASS dopo fix round (prima tornata FAIL su stati mandatory 6 + journey 7.1 + prezzi hardcoded → fix `3b455a1`…`4c3ad3f`). Evidenze eseguite: tsc ✅, jest 45/45 ✅, pytest 31/31 ✅, ruff ✅, OpenAPI diff NO_DRIFT ✅. CI GitHub Actions aggiunta (`.github/workflows/ci.yml`, 4 job). |
| G2 — Async behavioral skeleton | ⬜ Prossimo | Parzialmente preparato lato backend: upload init/complete + JobQueue + worker idempotente con provider mock. Manca: deploy Vercel funzionante e giro e2e completo (mobile → signed upload → workflow → risultato). |
| G3, G5–G9 | ⬜ Non avviati | Vedi piano gate in Spec V1 sez. 30. |

## Scope implementato su `main`

- **DB (workstream B):** migrazioni 0001–0012 complete; schema `public` con RLS stretta
  su ogni tabella; schema `internal` (jobs, costi, audit, retention) non esposto via
  Data API; bucket privati con object-path policies; funzioni quota atomiche;
  seed tassonomia versionata.
- **Backend (workstream C):** FastAPI public API (23 path: dogs, behavior
  captures/events/feedback, diary, digestive, nutrition, patterns, subscription,
  usage, devices, privacy, webhook RevenueCat) + worker privato (`/tasks/run`,
  header `x-internal-token`); contratti Pydantic Observation/Interpretation/Stool +
  errori stabili; provider mock fixture-backed; adapter `JobQueue` fake +
  Vercel Workflows; export OpenAPI (`scripts/export_openapi.py`).
- **Infra (workstream D):** `infra/vercel/vercel.json` + README deploy con env
  mapping completo (Amendment V1.1).
- **Mobile (workstream A + F1/F2):** app Expo completa su mock — design tokens
  dal mockup ufficiale, componenti condivisi, navigation 3 tab (UX LOCK),
  23 route con tutte le schermate di contenuto (core + secondary), mock layer
  tipizzato dai contratti, state machine capture, auth gate. Test: 45 jest.
- **CI/CD:** `.github/workflows/ci.yml` — job mobile (npm ci→tsc→jest),
  backend (uv sync→ruff→pytest), supabase (db reset), openapi-drift bloccante.

## Blocker aperti

| # | Blocker | Impatto | Owner |
| --- | --- | --- | --- |
| B-1 | **Shim serverless `api/index.py` mancante**: `vercel.json` instrada tutto su `/api/index`, ma il file che esporta `backend.app.api.app:app` e `backend.app.worker.main:worker_app` non è ancora nel repo | Primo deploy Vercel (staging = preview) impossibile | D / C |
| B-2 | **Validazione su Supabase CLI reale non eseguita**: i test DB girano su harness PostgreSQL 16 con stub delle funzioni Supabase (auth.uid(), storage), non su `supabase start` | Evidenza G1 parziale rispetto a sez. 30 (richiede fresh reset su stack Supabase) | B / J |
| B-3 | **Test npm/device su dispositivi reali non eseguibile in sandbox**: build iOS/Android, permessi camera/mic, registrazione 20 s, acquisti RevenueCat sandbox richiedono ambiente fuori sandbox | Exit evidence G0 (Spec V1 sez. 30) non chiudibile qui | A / J |
| B-4 | Provider AI reali (Gemini/OpenAI) non integrati: solo mock fixture-backed; adapter reali e spike 200–300 video sono gate G3 | Nessuna chiamata pagata possibile; strategia in `docs/EVALS.md` | E |
| B-5 | **Job CI `supabase` mai eseguito su runner reale** (CLI/Docker non disponibili in sandbox); gli altri 3 job replicati localmente con esito verde | CI non ancora validata end-to-end su GitHub | J |
| B-6 | Integrazione nativa camera/OCR non presente (expo-camera, ML Kit): preview simulata con stati/contratti completi | Pacchetti nativi da approvare e collegare in G0 su dev build | A / F |

## Prossimi passi (ordinati)

1. Implementare `api/index.py` (shim serverless) e primo preview deploy Vercel → sblocca staging.
2. Eseguire `supabase start` + `supabase db reset` + `supabase/tests/run_tests.sh` su stack reale → chiude evidenza G1. Primo push su GitHub per validare il job CI `supabase` (B-5).
3. Spike G0 su device reali: dev build EAS, permessi camera/mic, registrazione 20s, RevenueCat sandbox (B-3); collegare expo-camera/ML Kit (B-6).
4. G2: giro asincrono e2e con queue Vercel Workflows su staging (o fake locale) con evento idempotente; sostituire i mock mobile con il client generato da OpenAPI (codegen TS, attualmente mirror manuale — il drift-check CI copre backend→openapi.json).

## Decisioni

- LOCKED e ADR: `docs/DECISIONS.md` (include ADR-002 Vercel/Workflows, Amendment V1.1).
- Aperte: registro O-01…O-09 in `docs/DECISIONS.md` — nessuna risolta, non inventare.
