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
| B-4 | Provider AI reali non integrati | G3 | E |
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

Closed Android beta path wired: fail-fast staging/production config, Postgres dogs/behavior/quota/idempotency, Supabase Storage + Gemini/OpenAI adapters, durable workflow entry, mobile OTP+Google + real capture/upload/poll, privacy docs, Sentry/CI/EAS beta profiles. Signals remain postponed/hidden. Payments out of scope.

## Backend execution (2026-09-06)

- Fase 1 fondamenta: implementata nel codice (SQL domains, GDPR worker, retention DB, test SQL in CI); resta da aggiungere copertura pytest contro Postgres effimero per i repository DB.
- Fase 2 Knowledge + Advice V2: implementata; registry scientifico 2.0 validato, contesto cane/lifestyle, retrieval bounded, Advice Engine deterministico max 1, API owner-scoped, audit DB e outcome append-only. Migrazioni remote applicate e RLS/write boundary verificati.
- Fase 3 billing/integrità: implementata nel codice (billing DB-backed, webhook HTTP autenticato/idempotente, retry behavior e digestive persistiti, consensi e diario). Il consenso retention resta da collegare a un'eventuale eccezione prodotto esplicita.
- Fase 4: copertina album, Knowledge Score read API e push result/care dispatch implementati. Restano operative la schedulazione periodica care e la separazione edge del worker.
- Verifica locale: backend `73 passed`, Ruff verde, OpenAPI 40 path senza drift. Reset SQL locale non eseguito su questa macchina perché Docker Desktop non è installato; schema, migrazioni e RLS verificati sul progetto Supabase remoto.

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
