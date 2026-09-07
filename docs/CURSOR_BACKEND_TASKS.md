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


---

## Task sicurezza + performance media (audit 2026-09-07)

Fonte: audit indipendente (Kimi) su sicurezza backend e pipeline immagini. I problemi 1–4 sono quelli che un founder non tecnico non saprebbe di cercare; la parte mobile della stessa audit è in `docs/MOBILE_TASKS.md` (vietata a Cursor per regola d'oro).

### P0 — sicurezza/GDPR

1. **BLOCKER — Cron retention media mai schedulato.** Il handler `media_retention_cleanup` esiste (`backend/app/worker/main.py:29`) ma nessuno lo invoca: `vercel.json` non dichiara alcun cron e nessun codice di produzione fa enqueue di quel task (verificato via grep). La privacy policy promette cancellazione media grezze a 24h (`internal.retention_policies`) che in realtà non avviene mai → violazione GDPR su dati sensibili. Fix: dichiarare `crons` in `vercel.json` (o progetto Vercel Cron) che chiama `/tasks/run` con il task e `x-internal-token`; verificare esecuzione via log. Rif: `backend/app/domains/retention.py:5-9` (il commento ammette il gap).
2. **MAJOR — Export GDPR Art. 20 incompleto.** `collect_export_payload` (`backend/app/domains/privacy_db.py:245-299`) omette: `care_events`, `device_installations`, `dog_albums`, `dog_photos`, `dog_profile_visibility` (consensi pubblicazione!), `usage_ledgers`, `owner_reported_observations`, `knowledge_scores`, `digestive_insights`, `digestive_baselines`. Fix: aggiungere le tabelle mancanti al payload export + test.
3. **CHIUSO 2026-09-07 — Nessun rate limiting.** ~~Non esiste alcun limite per-utente su nessuna API autenticata.~~ Fix applicato: dependency factory `rate_limit(bucket, limit)` in `backend/app/api/deps.py` — finestra fissa per-utente su Postgres (`internal.rate_limits`, migrazione `20260907113000`, grant solo a service_role) con fallback in-memory per dev/test; limite superato → `429 RATE_LIMITED` (retryable). Applicato a: `POST /v1/behavior/captures/init` (30/min), `POST /v1/behavior/events/{id}/feedback` (60/min), `POST /v1/digestive/fecal/init` (30/min), `POST /v1/devices/push-token` (10/min). Test: `backend/tests/test_rate_limit.py` (3 test: limite, per-user isolation). Per estendere ad altri endpoint: aggiungere il parametro `_limiter` con `Depends(rate_limit(...))`.
4. **MAJOR — Webhook RevenueCat anti-replay parziale.** Idempotenza = scarto solo se `last_webhook_event_id == event_id` (`backend/app/domains/billing_db.py:137-151`): eventi più vecchi rispediti (consegna at-least-once, ordine non garantito) vengono riapplicati e sovrascrivono lo stato. Fix: tabella `webhook_events` con insert-if-absent atomico come guard; gestione out-of-order (ignorare eventi con `event_timestamp` antecedente allo stato corrente).

### P1 — robustezza upload

5. **MAJOR — Contenuto upload mai validato.** La signed URL Supabase è creata senza vincolo MIME (`backend/app/providers/supabase_storage.py:37-67`, body vuoto); il `content_type` dichiarato dal client decide solo l'estensione (`behavior_db.py:32-36`) e a complete si verifica solo esistenza+dimensione dichiarata dal client stesso (`behavior_db.py:239-243`, `dogs_db.py:270-274`). Chiunque può caricare file arbitrari mascherati da video. Fix: firma con `contentType` vincolante, sniffing magic-bytes lato worker su `complete`, blocco su mismatch; antivirus/scan opzionale in P2. NOTA: il task 10 (MIME allowlist DTO) è solo il lato dichiarativo — questo è il lato enforcement.
6. **MAJOR — EXIF/GPS nelle foto non rimosso server-side.** Il mobile non stripna i metadati (vedi MOBILE_TASKS); il server deve farlo a valle dell'upload (worker su complete: rieseguire encode immagine o chiamata Supabase Image Transformation) prima che la foto sia servita o esportata.
7. **MINOR — `/ready` pubblico senza auth** (`api/index.py:36-44`): esegue `select 1` sul DB di produzione per chiunque. Fix: proteggere con token interno o IP allowlist Vercel.

### P1 — performance immagini (il mobile non può risolvere da solo)

8. **URL media effimeri → niente cache possibile.** Ogni lettura foto/avatar restituisce signed URL con TTL `min(600s default, 3600)` (`config.py:65`, `gallery.py:29-57`, `dogs.py:28-36`): a ogni refetch dati gli URL cambiano e ogni client riscarica tutto. Fix (scelta architetturale, discutere con PO prima): (a) endpoint `GET /v1/media/{photo_id}` autenticato che streama il file (cache lato client per id), oppure (b) bucket pubblico per media `PUBLISHED` + signed solo per `PRIVATE`. L'opzione (a) mantiene RLS-by-construction.
9. **Miniature assenti.** `thumbnailUri == uri` full-res ovunque (`mapPhoto` in gallery): le griglie scaricano la foto intera. Fix: generare thumbnail a upload-complete (worker, larghezza ~400px, stesso bucket) o servire via Supabase Image Transformations (`/render/image` con resize) se il piano lo consente; esporre `thumbnail_url` nel DTO.
10. **TTL signed read incoerente col ciclo di vita client.** Con staleTime 30s del mobile, i refetch generano URL nuovi ogni 30s+: se si resta su (8), alzare `storage_signed_url_ttl_seconds` a 3600 come mitigazione immediata (1 riga in config/env Vercel), non come fix definitivo.


---

## Bug logici flussi core (audit 2026-09-07)

Fonte: percorrenza end-to-end mobile+backend dei flussi quota/paywall, capture→result, billing, care, digestive, timezone, concorrenza. La fondazione quota è solida (`reserve_usage` con `FOR UPDATE` + reservation idempotenti); questi bug sono nel ciclo di vita.

### P0 — bloccano o bruciano soldi in produzione

33. **Evento behavior bloccato per sempre in OBSERVING/INTERPRETING.** `backend/app/worker/handlers.py:207` + `backend/app/contracts/taxonomy.py:44-72`: se il worker muore a metà analisi, ogni redispatch chiama `process_behavior_event` → `transition(event, OBSERVING)` → `InvalidTransition` non catturato → retry esauriti → evento perso per sempre (utente fermo allo spinner, quota riservata). Auto-confermato da `sweep.py:26` che rispedisce proprio quegli stati. Fix: ammettere `OBSERVING/INTERPRETING → OBSERVING` come re-entry idempotente + test sulla transizione.
34. **Quota orfana su init non transazionale.** `backend/app/domains/behavior_db.py:129-139` (idem `digestive_db.py:124-134`): `reserve_usage_sql` committa in una connessione separata; se l'insert dell'evento fallisce dopo, la reservation resta `RESERVED` per sempre (nessuno sweep rilascia — zero uso di `RELEASED` nel codice). Fix: stessa transazione, oppure `refund_usage_sql` nel `except`.
35. **Upload abbandonato = quota bloccata fino al reset.** Stesso punto: evento fermo in `UPLOADING` + reservation `RESERVED`; con 3 abbandoni l'utente free è bloccato senza mai aver avuto risultati. Fix: job sweep che refunda reservation con evento in `UPLOADING/DRAFT` da > N ore (task 1 retention cron può farlo insieme).
36. **Free user esaurito in loop silenzioso senza paywall.** `apps/mobile/src/features/behavior/upload.ts:173-186`: 402 QUOTA_EXHAUSTED nel drain → `markRecoverable` → retry all'infinito a ogni resume, paywall mai mostrato. Fix: nel catch, se quota esaurita → stato terminale + evento che apre il paywall.

### P1 — prima del go-live billing e qualità

37. **Doppio complete → analisi eseguita due volte (costo AI doppio).** `behavior_db.py:217-275`: guard non atomico su `status`, `internal.analysis_jobs` senza unique su `event_id` (`0007_jobs_cost_audit.sql:31` solo indice non unico). Fix: `UPDATE ... SET status='QUEUED' WHERE id=:id AND status IN ('UPLOADING','DRAFT') RETURNING` come guard atomico, + unique constraint `analysis_jobs(event_id)`.
38. **Webhook fuori ordine declassa premium.** `backend/app/domains/billing_db.py:150-151`: dedup solo se identico all'ultimo evento; `EXPIRATION` tardiva dopo `RENEWAL` sovrascrive. Fix: applicare update solo se `period_end` in arrivo ≥ corrente (dup parziale del task 4 della sez. sicurezza — unificare).
39. **Evento RevenueCat `TRANSFER` ignorato.** `backend/app/providers/billing.py:52-53` → il piano resta sul vecchio account dopo cambio telefono/login. Fix: mappare transfer dell'entitlement sul nuovo `app_user_id`. (Oggi invisibile: store non collegato; letale al go-live.)
40. **Doppio promemoria agenda (locale + push server).** `apps/mobile/src/features/care/store.ts:168` + `backend/app/worker/handlers.py:561-595`: utente con push token riceve due notifiche per lo stesso appuntamento. Fix: una fonte sola.
41. **Notifiche agenda orfane dopo restart.** `apps/mobile/src/features/care/store.ts:233-251`: `notificationId` mai persistito → cancellazione evento dopo restart non cancella la notifica già schedulata. Fix: persistere id o chiave derivata dall'evento.
42. **Errore rete spacciato per "analisi non trovata".** `apps/mobile/app/behavior/processing/[eventId].tsx:123-133`: fix = distinguere 404 da errore rete + pulsante Riprova (collegato al task 31 della sez. precedente).
43. **Conteggio episodi digestivi gonfiato da raffiche di foto.** `backend/app/domains/digestive_db.py:481-531`: 5 foto in 5 minuti = "5 episodi in 24h". Fix (scelta prodotto da confermare): deduplica per finestra 6-12h nel conteggio `recent_episode_count_24h`.

### Nota di stato

Acquisto e restore purchase sono **stub** (`apps/mobile/app/paywall.tsx:154-162`): il gap funzionale maggiore non è un bug ma l'assenza del billing collegato. Timezone/date verificati sani (dayDistance, DST assorbito da Math.round, parse date validato).


---

## Gap AI — spec V2 engine→consumer (audit 2026-09-07)

Fonte: audit pipeline AI vs `docs/SPEC_BEHAVIOR_INTELLIGENCE_V2.md`. Il motore interno
(observer→reasoner→safety→advice, metering, fail-fast) è solido e testato; questi gap
sono tutti nella superficie consumer V2 e nella validazione empirica.

### P0 — bloccano la beta AI

44. **CHIUSO 2026-09-07 — Consumer composer V2 behavior.** `domains/behavior_intelligence.py` produce headline, `baseline_note` ("Per Rocky"), next step e what-to-watch post-reasoner; `BehaviorEventOut` espone i campi consumer + `personal_memory_used`. Test: `test_behavior_intelligence.py`, `test_worker.py`.
45. **CHIUSO 2026-09-07 — Safety governa wording e azione.** Copy deterministico per `SAFE_ESCALATION_001` / distress / pain: l'utente riceve "Aumenta la distanza e non forzare il contatto", mai il codice tecnico. Safety urgent resta senza advice catalog ma con azione consumer.
46. **Gate eval G3 mai eseguito.** `docs/EVALS.md:6,78`: nessun dataset, nessuno script
   eval in `scripts/`, registro vuoto. La spec dice "No model enters closed beta without
   this table filled". Fix: dataset 200-300 video reali etichettati blind, split
   dog-disjoint, script eval (schema validity ≥98%, safety 0 regressioni, P95 ≤25s,
   costo mediano) — richiede raccolta dati reale (task anche di prodotto, non solo codice).
47. **CHIUSO 2026-09-07 — `context_bucket` risolto server-side.** Se il client manda UNKNOWN, il worker deriva PLAY/DOOR_EXIT/FEEDING/… dall'osservazione, altrimenti orario/pasti, altrimenti HOME. Log `behavior.context_bucket.unknown_from_client`. Test: `test_context_bucket.py`.
48. **CHIUSO 2026-09-07 — risposta `context_question` behavior.**
   `POST /v1/behavior/events/{id}/context` salva il bucket confermato e rilancia
   reasoner + composer senza riosservare il video né consumare un'altra analisi.
49. **CHIUSO 2026-09-07 — costi AI configurabili da listino.** Tariffe verificate
   per Gemini 3.8 Flash e GPT-5 mini sono in `config.py`, sovrascrivibili via env,
   con margine prudenziale 15%; i thinking token Gemini sono inclusi.

### P1 — prima della produzione

50. **CHIUSO 2026-09-07 — provider/modelli versionati.** Observer Gemini 3.8 Flash
    e reasoner OpenAI GPT-5 mini sono dichiarati in `vercel.json`, non solo in dashboard.
51. **CHIUSO 2026-09-07 — `personal_memory_used` esposto** in `BehaviorEventOut` e usato dal composer "Per Rocky".
52. **CHIUSO 2026-09-07 — Test composer/safety/context.** Restano i test per l'endpoint `context_question` behavior (task 48).
