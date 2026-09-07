# PROJECT STATE — Dogly

Ultimo aggiornamento: 2026-09-06 • Branch: `main`

## Gate corrente

| Gate | Stato | Evidenza |
| --- | --- | --- |
| **G1 — Data/security contract** | ✅ **COMPLETATO** | Migrazioni `0001–0016` (Signals + write hardening); RLS; OpenAPI; pytest. |
| **Amendment V1.1** | ✅ | Hosting Vercel + Workflows. |
| **G0 — Platform spike (mobile)** | 🔶 **PARZIALE** | Expo SDK 57, pnpm, EAS preview APK Android; RevenueCat sandbox in checklist. |
| **G4 — Consumer UX** | ✅ **UX V1 integrata** | Flussi Home/Diario/Digestione/API reali, Advice V2 e outcome, routine lifestyle progressiva, attesa accessibile e share card branded. Mock isolati nel solo demo gate. |
| **GATE UX/SPEC (Stage 3)** | ✅ **PASS** (statico) | Non implica integrazioni reali complete. |
| G2 — Async e2e | 🔶 Parziale | Retention TTL al completion + cleanup job; giro mobile→upload→worker da chiudere. |
| G3, G5–G9 | ⬜ | Non avviati. |

## Deploy / tooling reali

- Backend preview: Vercel; shim `api/index.py` presente.
- Mobile: `packageManager: pnpm@10.34.5`; brand **Dogly** / `com.attilalab.dogly`.
- Env: `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Signals: migrazioni `0015–0016` applicate su Supabase; API usa PostgreSQL quando
  `DATABASE_URL` è configurato e mock in-memory soltanto in locale/test.

## Blocker aperti

| # | Blocker | Impatto | Owner |
| --- | --- | --- | --- |
| B-1 | ~~Shim `api/index.py`~~ | **CHIUSO** | — |
| B-2 | Validazione Supabase CLI reale incompleta | Evidenza G1 parziale | B / J |
| B-3 | Test device / IAP sandbox incompleti | Exit G0 — vedi `docs/DEVICE_TEST_CHECKLIST.md` | A / J |
| B-4 | ~~Provider AI reali non integrati~~ | **CHIUSO** — factory/worker Gemini + OpenAI | — |
| B-5 | Test CI supabase da rafforzare | CI E2E | J |
| B-6 | Camera/OCR nativi incompleti | Capture reale | A / F |
| B-7 | ~~Retention expires_at a init~~ | **CHIUSO** — TTL al terminal + `media_retention_cleanup` | — |

## Decisioni prodotto V1

- Brand **Dogly**; digestione + nutrizione in V1; admin dopo.
- Confidenza: bande; raw video 24h dal completion; album privati + share OS.
- Profilo privato default / pubblico opt-in; messaggio quotidiano interattivo.
- Dogly Signals: **POSTICIPATO**; nessun ingresso visibile e deep link disattivati.
  Schema e prototipo restano isolati per una futura rivalutazione.
- Admin: Control Center web V0 in apps/admin (Next.js), mock read-model; RBAC e endpoint /v1/admin/* nelle fasi successive (ADR-011).

## Riferimenti

- UX: `docs/ux/UX_REFERENCE.md`
- Billing: `docs/BILLING_V1.md`
- Device QA: `docs/DEVICE_TEST_CHECKLIST.md`
- ADR/open: `docs/DECISIONS.md` (ADR-010 Signals)

## Production path (2026-09-05)

Closed Android beta path wired: fail-fast staging/production config, Postgres dogs/behavior/quota/idempotency, Supabase Storage + Gemini/OpenAI integrati, durable workflow entry, mobile OTP+Google + real capture/upload/poll, privacy docs, Sentry backend/mobile condizionale ai rispettivi DSN, CI/EAS beta profiles. Signals remain postponed/hidden. Payments out of scope.

## Backend execution (2026-09-06)

- Fase 1 fondamenta: implementata nel codice (SQL domains, GDPR worker, retention DB, test SQL in CI); resta da aggiungere copertura pytest contro Postgres effimero per i repository DB.
- Fase 2 Knowledge + Advice V2: implementata; registry scientifico 2.0 validato, contesto cane/lifestyle, retrieval bounded, Advice Engine deterministico max 1, API owner-scoped, audit DB e outcome append-only. Migrazioni remote applicate e RLS/write boundary verificati.
- Fase 3 billing/integrità: implementata nel codice (billing DB-backed, webhook HTTP autenticato/idempotente, retry behavior e digestive persistiti, consensi e diario). Il consenso retention resta da collegare a un'eventuale eccezione prodotto esplicita.
- Fase 4: copertina album, Knowledge Score read API collegata al mobile e push result/care dispatch implementati. Restano operative la schedulazione periodica care e la separazione edge del worker.
- Verifica locale storica della fase: backend `73 passed`, Ruff verde. Per lo
  stato corrente vedere “Enterprise UX V5.1” sotto.

## Mobile UX completion (2026-09-06)

- Advice V2 collegato al risultato e al Diario; il payload backend viene mappato
  senza inventare fallback in produzione e l'outcome già salvato non viene
  richiesto nuovamente.
- “Routine e abitudini” collegata alle API lifestyle, al profilo cane e alla
  micro-card progressiva in Home; “Non so” resta un valore realmente ignoto.
- Attesa analisi resa viva con messaggi per stato, anelli pulsanti e breve
  conferma finale; `Reduce Motion` disattiva l'animazione.
- Condivisione risultato trasformata in card grafica branded con foto del cane
  e fallback testuale; nessun video, URL firmato o percorso storage viene
  condiviso.
- Verifica locale: TypeScript verde; Jest `108 passed` in 19 suite.

## Audit hardening backend (2026-09-06, seconda ondata)

Fix da audit esterno verificati su codice reale e implementati; backend `131 passed`, Ruff verde.

- **Retry AI reali**: `_fail` retryable solleva `RetryableTaskError` dopo aver persistito `FAILED_RETRYABLE` → lo step Vercel fallisce davvero e `max_retries=5` ingaggia; tentativi persistenti (`attempt_count`), terminale con rimborso quota oltre il cap. Worker HTTP mappa retryable → 503.
- **Enum osservazione chiusi**: `BodyHeight/Posture/Locomotion/ApproachWithdrawalFreeze/EarPosition/TailHeight/TailMovement/VocalizationType` come `StrEnum`; prompt Gemini porta i valori ammessi; `normalize_observation_dict` con tabella alias difensiva prima del retrieval (garbage → `unknown`, mai crash).
- **Safety deterministica pre-LLM**: `app/knowledge/safety.py` è la singola fonte delle regole (≥2 distress / rigidità+growl / pain nel contesto); le flag deterministiche (`SAFE_*_001`) entrano nel prompt del reasoner come vincoli e si mergiano in `interpretation.safety_flags` (vince la severità deterministica). Il gate urgente dell'Advice Engine non dipende più solo dall'LLM.
- **Coverage robusta**: punteggio per famiglie di segnali indipendenti + grade A − contraddizioni, cap a MEDIUM se qualità media ≠ good; `ABSTAIN_001`/`SAFE_*` escluse dal contributo positivo.
- **Lifestyle schema chiuso**: `DogLifestylePatch` con modelli pydantic tipizzati (campi reali mobile + quantificati del brief), `extra="forbid"`, range e limiti dimensionali; la GET resta tollerante sulle righe legacy.
- **Budget AI bloccante**: gate serializzato pre-chiamata (`pg_advisory_xact_lock` + somma giornaliera su `internal.ai_cost_events`) per observer e reasoner; superato il budget → `AI_BUDGET_EXCEEDED` come failure **terminale non retryable**. Kill switch già presenti confermati.
- **Coda locale reale**: `InMemoryJobQueue` con dispatcher in-process (il fake queue smaltisce davvero; prima gli eventi restavano `QUEUED` per sempre in locale). Sweep CLI: `uv run python -m app.worker.sweep` ripesca `QUEUED/FAILED_RETRYABLE` e li analizza con drain.
- **Migrazione 0028** (`rls_fk_searchpath_hardening`): 71 policy riscritte con `(select auth.uid())`, 6 indici FK mancanti, `search_path` fissato su 4 funzioni — applicata a Supabase production il 2026-09-07.
- **Video web coerente**: il MIME reale prodotto da `MediaRecorder` viene propagato fino a storage e Gemini; WebM non viene più caricato dichiarandolo falsamente MP4.
- **Digestive vision reale**: le foto digestive private vengono passate a OpenAI tramite URL Supabase firmato a breve durata; output validato come `StoolObservationContract`, un solo tentativo di repair, budget/kill switch dedicati e regole di sicurezza deterministiche separate dal modello.

Verifica locale della fase: backend `134 passed`; mobile TypeScript verde,
Jest `118 passed` in 20 suite.

## Enterprise UX V5.1 + Digestive Intelligence V2 (2026-09-07)

- Navigazione consumer consolidata in Home / Diario / Profilo; Fotocamera
  Storie resta una route secondaria.
- Home, Diario, Profilo, Routine, processing e risultati riallineati alle
  reference V5.1 con layout responsive, immagini del cane e dettagli
  progressivi.
- Digestive Intelligence V2 separa osservazione OpenAI, contesto verificato,
  baseline personale versionata, retrieval veterinario bounded, triage
  deterministico e risposta consumer.
- “Raccontami di {nome}” supporta testo e registrazione vocale breve,
  trascrizione OpenAI, revisione/modifica dei fatti e conferma esplicita con
  provenienza `OWNER_REPORTED`; l’audio raw non viene persistito.
- Migrazioni `0029–0036` applicate a Supabase production; includono
  riconciliazione RLS, indici FK, metering voce e scadenza dei draft.
- Verifica corrente: backend `145 passed`, Ruff verde; mobile TypeScript
  verde, Jest `118 passed` in 20 suite; OpenAPI esportato con 44 path.
