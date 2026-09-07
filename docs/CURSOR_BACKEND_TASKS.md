# TASK BACKEND — per Cursor (o chi lavora su backend/supabase/CI)

**Data:** 2026-09-05 • **Fonte:** `docs/AUDIT_ENTERPRISE_2026-09-05.md` + `docs/AUDIT_GAP_FLUSSI_2026-09-05.md` • **Scope:** SOLO `backend/`, `supabase/`, `api/`, `.github/` — **non toccare `apps/mobile/`** (ci lavora Kimi in parallelo).

> Backlog storico. Lo stato operativo corrente è in `PROJECT_STATE.md`.
> Le voci 17 e 24 sono chiuse; la 15 resta aperta ed è tracciata esplicitamente.

Regole: migrazioni forward-only (mai editare una migrazione applicata); nessun ENUM Postgres per tassonomie AI; RLS/grants nella stessa migrazione della tabella; ogni dominio con negative test; aggiornare `docs/openapi.json` (`uv run python ../scripts/export_openapi.py`) e i conteggi nei docs alla fine.

## P0 — blocca beta

1. **C-1 Privacy GDPR funzionante.** Aggiungere handler worker `privacy_export` e `account_deletion` in `backend/app/worker/main.py` (TASK_HANDLERS): export → genera file in bucket `exports`, completa job; delete → chiama `internal.begin_account_deletion()` (esiste, `supabase/migrations/0012:227-251`), purge storage + tabelle + auth user, `complete_deletion_job`. Test: `backend/tests/test_privacy.py` (endpoint → job → handler → stato finale). Riferimento: audit enterprise C-1.
2. **C-2 Persistenza SQL per tutti i domini.** Oggi solo behavior/dogs/signals/idempotency hanno `*_db.py`; tutto il resto vive in `InMemoryStore` (perso a ogni istanza serverless). Creare i moduli DB per: **care** (`care_db.py` — la tabella `care_events` di 0014 non è mai letta dal backend!), **digestive**, **diary/timeline**, **nutrition** (food_products/feeding), **gallery** (album/photos 0013), **devices**, **privacy**, **subscription**. Pattern da seguire: `domains/dogs_db.py` / `signals_db.py`. Test di integrazione su Postgres effimero.
3. **H-1 Retention DB-backed.** `cleanup_expired_raw_media` deve leggere `internal.media_due_for_deletion` (vista esistente, 0012:113-144) invece dello store in-memory; coprire stati `DELETE_PENDING`, bucket `food-labels` ed `exports`; chiamare `mark_media_deleted`. Test su Postgres reale.
4. **H-2 Test SQL in CI.** Aggiungere step `bash supabase/tests/run_tests.sh` al job `supabase` in `.github/workflows/ci.yml` (dopo `supabase start` + `db reset`). Blocca RELEASE_CHECKLIST A e chiude B-2/B-5.

## P1 — prima del public release

5. **H-3 Usage/subscription DB-backed.** `/v1/usage` e `/v1/subscription/status` devono leggere `public.usage_ledgers` / `public.subscriptions` quando `engine` è presente (oggi sempre FREE/0 da memoria).
6. **H-4 Worker retry.** Persistere stato + `attempt_count` anche nel ramo retryable (`worker/handlers.py:77-91`): oggi `MAX_TASK_ATTEMPTS` non si raggiunge mai → retry infiniti.
7. **H-5 Webhook RevenueCat → DB.** Scrivere il mirror su `public.subscriptions` con `last_webhook_event_id` come anchor idempotente; allineare gli status di `map_revenuecat_event` (`active/inactive/grace_or_cancelled`) a quelli attesi dalla SQL function (`ACTIVE/TRIALING/GRACE_PERIOD`). Test firma valida/invalida + idempotenza.
8. **Endpoint consensi utente** (serve al mobile: gli switch privacy oggi non hanno backend): `GET /v1/me/consents` + `PATCH /v1/me/consents` (service/notifiche OFF default, research opt-in, keep-clip eccezione TTL 24h) su `public.user_consents` (append + revoke coerente coi grants colonna-livello di 0009). Contratto con versione policy.
9. **Endpoint lista eventi per Diario/Home** (serve al mobile): `GET /v1/dogs/{dog_id}/events?domain=&cursor=&limit=` (timeline unificata behavior+digestive, cursor pagination, mai raw media URL permanenti) o equivalente. Senza questo, Diario e "ultima analisi" Home restano mock.
10. **MIME allowlist** su capture init (`contracts/api.py:257,373,405`): `Literal["video/mp4","video/quicktime"]` behavior, formato immagine digestive; `bytes` con upper bound. Allinea `docs/SECURITY.md:16` (dichiarata ✅ ma assente).
11. **H-6 Negative test per dominio** (spec 24.1) + test dei path SQL: digestive, care (ownership cross-user su `care_events`), subscription/usage, webhooks, privacy, me.
12. **Care reminders dispatch**: job schedulato (o endpoint cron Vercel) che legge `care_events` con `reminder_pending` e marca `reminder_sent_at` — il mobile schedula localmente, ma il server deve poter annullare/inviare lato server (vedi ADR-009).

## P2 — igiene e coerenza

13. **Idempotenza DB su tutte le mutazioni** (oggi solo behavior fa dual-write su `internal.api_idempotency`): care, digestive, signals.
14. **Doppia fonte TTL**: far leggere al backend `internal.retention_policies` (FOOD_LABEL 1h, EXPORT 7gg) invece dell'unico `raw_media_ttl_hours=24`.
15. **APERTO — `/tasks/run` raggiungibile sullo stesso ingresso Vercel** (`api/index.py`): il token interno protegge l'handler applicativo, ma resta da separare il deployment del worker o aggiungere protezione edge.
16. **`/care` grant diretto** ad `authenticated` via PostgREST (0014:97): valutare revoke di insert/update/delete una volta che il backend è il write path.
17. **CHIUSO — Riconciliazione docs**: provider Gemini/OpenAI integrati nella factory/worker; architettura, stato progetto e decisione tab allineati al codice corrente.
18. **Config fail-fast**: richiedere `REVENUECAT_WEBHOOK_SECRET` in staging/prod; allowlist algoritmi JWT (`api/auth.py:96-101`) invece dell'header del token.


---

## Aggiunte dal giro di fix mobile (sera 2026-09-05)

Scoperti mentre il mobile veniva collegato agli endpoint reali:

19. **`DiaryItem` incompleto** — la lista `GET /v1/diary` non espone `confidence_band` né `feedback`: il Diario non può mostrare la band né il feedback già dato. Aggiungere i campi al DTO.
20. **`GET /v1/behavior/events/{id}` non restituisce il feedback** registrato — riaprendo un risultato, il feedback a tre vie non è pre-compilato (mobile lo imposta a `null`).
21. **Pattern review senza azione di conferma** — `POST /v1/patterns/{id}/review` ha enum `contest | archive | correct_context`: manca l'azione "Corretto/conferma" (la UI oggi lo dichiara onestamente all'utente).
22. **`GalleryAlbumDto` senza `cover_url`** — ha solo `cover_photo_id`; la copertina album si risolve solo se le foto sono già in cache. Valutare `cover_url` (signed, TTL breve).
23. **`DigestiveEventOut` incompleto** — mancano candidati (muco/sangue/melena/materiale estraneo), `image_quality`, `quality_warnings`, `active_food_name`, `baseline_comparison`: la UI digestiva reale è più povera del mock. Mancano anche stati espliciti `INSUFFICIENT_IMAGE` / `FAILED_*` nel dominio digestivo.
24. **CHIUSO — Knowledge Score**: endpoint owner-scoped disponibile e mobile collegato; il mock resta solo nel mock gate.
25. **Notifica "risultato pronto"** — oggi locale con delay fisso 30s; se il backend esponesse ETA o push server-side, sostituire.


---

## Task V2 — AI Knowledge + Advice Engine (2026-09-06, ADR-012)

**Fonte vincolante:** `docs/kb/CURSOR_IMPLEMENTATION_BRIEF_Dogly_AI_Knowledge_Advice_V2.md` — brief repo-aware completo, già indirizzato a Cursor. Eseguire quel brief così com'è; punti chiave:

1. `backend/app/knowledge/` (models, registry, retrieval, advice + `data/dogly_knowledge_advice_v2.json` da `docs/kb/`), validazione registry a load-time, fail-fast in staging/prod.
2. `backend/app/domains/dog_context.py` — DogContextSnapshot (età esatta + life stage derivato + lifestyle owner-reported con provenance).
3. Reasoner boundary esteso: `knowledge_context` + `dog_context` (mai storia completa del cane).
4. AdviceEngine **deterministico**: max 1 consiglio consumer, azione solo dal catalogo, LLM solo per la razionale breve.
5. 2 migrazioni nuove (verificare la numerazione reale prima — c'è stato drift): `dog_lifestyle_profiles` (RLS owner-only) + `advice_outcomes` (append-only).
6. API owner-scoped: lifestyle GET/PATCH, advice outcome POST. Estendere `EvidenceSource` con `SCIENTIFIC_KB`, `LIFE_STAGE`, `LIFESTYLE_BASELINE`.
7. NON toccare `IntentCode` (tassonomia repo confermata, ADR-012). Nessun RAG runtime. Niente diagnosi.
8. Test di accettazione: elenco alla sez. 15 del brief.

**Parte mobile (Kimi, dopo il backend):** profiling progressivo "Routine e abitudini" nel profilo, micro-card Home "Aiutami a conoscerlo meglio", card risultato "Cosa puoi fare adesso", outcome "Ti è sembrato utile?" (Sì/No/Non so).
