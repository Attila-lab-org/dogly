# REMEDIATION PLAN — Audit E2E & Scalabilità

v2 — 2026-09-08: riclassificato dopo verifica indipendente su database reale (Cursor + MCP Supabase).
Esecutore: Cursor (+ MCP Supabase). Validatore: Kimi (questo piano è il contratto di accettazione).

## Stato di verifica su produzione (2026-09-08)

- 0 eventi zombie, 0 quote riservate appese, 0 claim idempotency incompleti → i difetti sono **strutturali**, non incidenti in corso.
- **Retention cron rotto in produzione**: `/tasks/cron/retention` = 1 invocation in 7 giorni, **status 500** (2026-09-08 03:15 UTC). Root cause: DELETE su Supabase Storage → 400 → `raise_for_status()` abortisce l'intero run; gli altri oggetti non vengono toccati. `CRON_SECRET` presente e auth funzionante (care-reminders: 14× 200, anche orari → piano non Hobby-daily).
- DB: **12 media in `media_due_for_deletion`** (3 video, 9 foto), 0 mai cancellati; il più vecchio scaduto il 2026-09-06 02:00 UTC (>68h). La promessa "raw video 24h dal completion" è **già rotta, in piccolo**.
- Criterio severità concordato: *se succede, l'utente se ne accorge e si riprende da solo → può scendere; se resta bloccato/spennato/GDPR senza che nessuno lo sappia → non scende, anche se raro oggi.*

## Regole globali per l'esecutore

- **Mai modificare migrazioni già applicate**: solo nuove migrazioni additive con timestamp successivo. Nessuna modifica distruttiva su dati esistenti.
- Ogni fix backend DEVE avere test pytest nuovi o aggiornati; ogni fix mobile DEVE passare `tsc` e Jest.
- Contratti da non violare: error taxonomy `{code, message, retryable, correlation_id}`; confidence a bande (mai %); wording probabilistico; 3 tab.
- Dopo ogni fase: `uv run pytest`, `uv run ruff check .`, mobile `pnpm tsc --noEmit` e `pnpm jest`; export OpenAPI se cambiano route.
- Migrazioni: applicare via MCP **prima su un progetto di prova/staging**, poi production solo dopo OK del validatore. Attenzione: oggi "staging" e production puntano allo stesso Supabase (vedi GATE-1) — finché GATE-1 non è chiuso, trattare ogni applicazione SQL come se fosse production.

---

## FASE 1 (P0) — Fallimenti invisibili all'utente

Chiude tutti i casi in cui l'utente resta bloccato, paga, o perde dati senza che nessuno se ne accorga.

### FIX 1.1 — Sweep schedulato per eventi stuck + rimborso quota
**Problema** (confermato su codice; kill preciso identificato: `already_running` → HTTP 200 → step marcato riuscito → nessun retry futuro): eventi in `QUEUED`/`OBSERVING`/`INTERPRETING`/`FAILED_RETRYABLE` dopo crash restano non-terminali per sempre; quota `RESERVED` mai rimborsata.
Evidenza: `backend/app/worker/handlers.py:124-163` e `:426-427`; `backend/app/worker/sweep.py` (solo CLI); non schedulato in `vercel.json`.

**Cambiamenti**:
1. Endpoint worker `POST /tasks/sweep-stuck` (auth HMAC come gli altri cron, pattern di `backend/app/worker/main.py`) che esegue la logica di `sweep.py` con `LIMIT` parametrico (default 50) e soglia età (default 15 min).
2. Evento oltre `MAX_TASK_ATTEMPTS` o età massima (30 min): transizione a `FAILED_TERMINAL` con codice dedicato (`PROCESSING_TIMEOUT`), **rimborso quota** se non committata, push di fallimento (FIX 1.3).
3. Cron in `vercel.json` ogni 10 min. Il piano corrente supporta cron orari (verificato: care-reminders gira orario) — verificare che supporti anche `*/10`; altrimenti orario come minimo accettabile e documentare il trade-off.
4. Query di scan con `LIMIT`, indice parziale esistente sui job pendenti; niente scan unbounded.

**Accettazione**: pytest con evento `OBSERVING` vecchio → `FAILED_TERMINAL` + quota rimborsata + job marcato; `vercel.json` aggiornato.

### FIX 1.2 — Timeout lato mobile sul polling
**Problema**: behavior ha backoff ma nessun tetto; digestive ha 2s fisso senza backoff né tetto. Senza 1.1, spinner infinito garantito.
Evidenza: `apps/mobile/app/behavior/processing/[eventId].tsx:62-69`; `apps/mobile/app/digestive/processing/[eventId].tsx:40-44`.

**Cambiamenti**: tetto complessivo 10 min in stato non terminale → stato errore onesto ("L'analisi sta impiegando troppo") con CTA "Riprova" e copy rassicurante sulla quota. Digestive: stesso backoff di behavior. Contratti di stato immutati.

**Accettazione**: Jest con timer mockato → dopo la soglia appare lo stato timeout; `tsc` verde.

### FIX 1.3 — Push anche su fallimento terminale
**Problema** (confermato): notifica enqueued solo su `COMPLETED` (`handlers.py:662-667`); su `FAILED_TERMINAL` silenzio totale.

**Cambiamenti**: push "non siamo riusciti ad analizzare il video, nessun addebito" su `_fail` terminale e nel path sweep (1.1), riusando la pipeline esistente (`handlers.py:1016-1033`). Italiano, tono brand.

**Accettazione**: pytest su enqueue push per fallimento behavior e digestive.

### FIX 1.4 — TTL sulle chiavi di idempotenza bloccate
**Problema** (confermato su codice; 0 casi aperti oggi): riga `status_code=0` → 429 per sempre su quella chiave; il clip diventa incompletable.
Evidenza: `backend/app/domains/idempotency_db.py:22-66`.

**Cambiamenti**: righe `status_code=0` >10 min trattate come scadute (ri-claim atomico o delete); cleanup righe >7 giorni nel cron retention.

**Accettazione**: pytest: chiave claimed-mai-completata invecchiata → retry riparte invece di 429.

### FIX 1.5 — Re-upload su oggetto esistente
**Problema** (confermato): PUT riuscito ma risposta persa → retry ri-PUTta sullo stesso path → errore a ogni tentativo → `terminal_error`; l'utente deve ri-registrare (solo se ha quota libera).
Evidenza: `apps/mobile/src/lib/signedUpload.ts:14-74`; `backend/app/providers/supabase_storage.py:37-67`.

**Cambiamenti** (preferita la A):
- A. Retry di item già in `uploading`: verifica `object_exists` + match dei byte dichiarati → salta il PUT, vai diretto a `complete_capture`.
- B. URL firmato con upsert + header `x-upsert: true` nel PUT.
- Test runtime via MCP consigliato prima di scegliere: due PUT sullo stesso signed path e osservare la risposta del secondo.

**Accettazione**: Jest: PUT riuscito con risposta persa + retry → converge a `complete` senza errore.

### FIX 1.6 — Retention: isolamento per-oggetto (INCIDENTE LIVE, ex 3.4a)
**Problema** (confermato in produzione 2026-09-08): un 400 sul DELETE di un oggetto → `raise_for_status()` abortisce il run intero; 12 media scaduti mai cancellati, il più vecchio da 68h. Promessa "raw 24h" già violata in piccolo.
Evidenza: `backend/app/domains/retention.py:186-219`; invocation 500 del 2026-09-08 03:15 UTC.

**Cambiamenti**:
1. Try/except **per singolo oggetto**: un fallimento viene loggato (con correlation-id, vedi 1.7) e marcato, il run continua sugli altri.
2. Contatore di fallimenti consecutivi per oggetto: oltre N tentativi (es. 3 run), l'oggetto va in una lista "quarantena" visibile (tabella o log strutturato) invece di ri-fallire in silenzio a ogni run.
3. Status code del cron: 500 solo se **tutti** gli oggetti falliscono; 200 con conteggio parziale altrimenti (così un 400 singolo non maschera più il run).
4. Dopo il deploy: verificare che i 12 media arretrati vengano smaltiti; indagare il 400 del singolo oggetto (path mancante? bucket? permessi?).

**Accettazione**: pytest con un oggetto che fallisce → gli altri 11 processati, run non 500. Via MCP a fine giro: `SELECT count(*) FROM media_due_for_deletion` = 0.

### FIX 1.7 — Request-id / correlation-id end-to-end (ex 4.13)
**Problema** (confermato e già morso): il 500 del retention cron è rimasto cieco — nessun id cercabile nei log. `correlation_id` è generato ex-novo a ogni errore, mai propagato né loggato: decorativo.
Evidenza: `backend/app/api/app.py:79,110`; `backend/app/contracts/errors.py:94`; nessun middleware request-id; payload workflow = solo `event_id`.

**Cambiamenti**:
1. Middleware che genera/propaga `X-Request-ID` (accetta quello in ingresso se presente) e lo rende disponibile a route, handler e logger (contextvar).
2. Il `correlation_id` delle risposte di errore = request-id della request (non più generato ex-novo).
3. Propagazione API → job payload → handler worker → log: aggiungere `request_id` (o derivarlo da `event_id`) nei log strutturati degli step e dei cron.
4. I cron loggano a fine run: oggetti processati / falliti / saltati, con id run.

**Accettazione**: pytest: errore API → `correlation_id` == request-id in ingresso; log del cron retention contiene esito per-oggetto. Contratto errore invariato (cambia solo il valore, non lo shape).

### FIX 1.8 — `maxDuration` e budget temporale dello step (ex 2.1)
**Problema** (confermato): nessun `maxDuration` in `vercel.json`; lo step unico Gemini può superare il wall-clock → kill di piattaforma che bypassa tutta la recovery (è la causa scatenante di 1.1).
Evidenza: `backend/app/workflows/analysis.py:10-35`; `backend/app/providers/gemini_observer.py:69,225-233,274-297`.

**Cambiamenti**:
1. `maxDuration` in `vercel.json` al massimo del piano; valore e motivazione in `docs/ARCHITECTURE.md`.
2. Budget temporale interno allo step: se manca margine, interruzione controllata → persisti checkpoint e rilancia retryable invece di farti uccidere. Somma dei timeout httpx < `maxDuration`.
3. `finally` di cancellazione file Gemini (`gemini_observer.py:206`) deve coprire anche i timeout controllati.

**Accettazione**: `vercel.json` con `maxDuration`; pytest su timeout controllato → `FAILED_RETRYABLE`; doc aggiornata.

---

## GATE-1 (P0, prima di tester esterni) — Staging isolato

**Problema** (confermato): `apps/mobile/eas.json:22-47` — staging e production puntano allo stesso backend Vercel e allo stesso progetto Supabase `zcnzkpxgpbdspfmselwz`. Le build di staging girano su dati di produzione, contro `infra/vercel/STAGING.md`.

**Cambiamenti**: progetto Supabase + deployment Vercel dedicati per staging; `eas.json` profilo staging aggiornato; segreti separati. Blocca: beta chiusa con tester esterni.

**Accettazione**: build staging che non tocca il DB di produzione (verificabile via MCP: progetto diverso).

---

## FASE 2 (P1) — Scalabilità e misconfig future

### FIX 2.1 — Rimborso rapido quota per upload abbandonati (ex 2.3)
Soglia 2h + cron giornaliero = blocco quota 2–26h → paywall immeritato. Spostare il rimborso reservation `UPLOADING` >2h nel cron frequente del FIX 1.1, o retention 2×/giorno. Fix obbligatorio abbinato: `retention.py:99,109` — `e.id::text = r.reference_id` → `e.id = cast(r.reference_id as uuid)` (scan non sargable).
**Accettazione**: pytest rimborso via sweep; `EXPLAIN` con index scan.

### FIX 2.2 — Indice e purge `ai_cost_events` + coerenza budget gate (ex 3.1)
Lock per ruolo (non globale, correzione accettata) + SUM senza indice su `(operation, created_at)`; tabella mai purgata; costi `reasoner.refine_context` non conteggiati dal gate (`openai_reasoner.py:67-71` vs `handlers.py:749-753`).
Cambiamenti: migrazione con indice `(operation, created_at)`; gate e registrazione allineati sui nomi operation (prefisso per ruolo o normalizzazione); purge >90 giorni nel cron retention (verificare requisiti audit in `docs/SECURITY.md`; se serve storia, tabella `_archive`).
**Accettazione**: MCP: indice presente, `EXPLAIN` della SUM lo usa; pytest sul gate che include `refine_context`.

### FIX 2.3 — Paginazione SQL reale nel Diario (ex 3.2)
`diary_db.py:66-123` carica tutta la storia e pagina in Python; idem `digestive_summary` (`digestive_db.py:781-796`). Cursor-based in SQL: `(occurred_at, id) < :cursor` per ramo + `LIMIT` per ramo; ricerca testuale con LIMIT.
**Accettazione**: pytest 2 pagine senza duplicati/buchi; `EXPLAIN` usa `behavior_events_diary_cursor_idx`; shape risposta immutata.

### FIX 2.4 — Una connessione DB per request (ex 3.3)
Oggi ~4 acquisizioni sequenziali per poll (`deps.py:110-114`, `routes/behavior.py:162-169`). Dependency FastAPI con connessione per request passata ai repository; attenzione alle semantics di commit separate (claim/enqueue). Incrementale: prima le route di polling.
**Accettazione**: test esistenti verdi; test spia: 1 acquisizione per poll.

### FIX 2.5 — Retention: throughput (ex 3.4b, la parte restante)
Batch delete verso Storage o limite alzato + cron più frequente; `mark_media_deleted` in batch per run; indici per la vista orphan (`dogs.photo_path`, `dog_photos.storage_path`) in nuova migrazione.
**Accettazione**: pytest con 250 oggetti dovuti → tutti processati in un run.

### FIX 2.6 — AI sincrona nel request path (ex 4.6, declassato: l'utente vede 504 e può ritentare)
`routes/behavior.py:202-208` e `routes/owner_stories.py:135-139` chiamano OpenAI (timeout 90s) in request. Opzioni: job async, oppure timeout coerente con `maxDuration` + errore di dominio retryable invece di 504 di piattaforma.
**Accettazione**: chiamata lenta → errore `{code, retryable: true}` gestito, non 504.

### FIX 2.7 — Heartbeat del job RUNNING (ex 4.9)
Soglia fissa 10 min vs step più lunghi → doppia esecuzione pagata pre-checkpoint (`handlers.py:139-143`). Heartbeat: lo step aggiorna `updated_at` periodicamente; reclaim solo su heartbeat morto.
**Accettazione**: pytest: job con heartbeat vivo oltre 10 min NON ri-claimato; job morto sì.

### FIX 2.8 — Fail-fast secret residui (ex 2.2, declassato: `CRON_SECRET` verificato presente)
Resta da validare: `APP_ENV` esplicito quando `VERCEL=1` (rifiuta boot se assente fuori da local), `REVENUECAT_WEBHOOK_SECRET`, `WORKFLOW_BASE_URL`. Allineare `infra/vercel/STAGING.md` alla realtà. Test in `tests/test_config_fail_fast.py`.
**Accettazione**: boot con env incompleta fallisce nominando la variabile.

---

## FASE 3 (P2) — Backlog

| # | Fix | Evidenza | Nota |
|---|-----|----------|------|
| 3.1 | Digestive: errori transitori OpenAI → `FAILED_RETRYABLE` come behavior | `handlers.py:917-935` | Utente può ritentare da solo |
| 3.2 | Verificare risultato `quota.commit()`; se `NO_OP_*` → non marcare committed, allertare | `handlers.py:644-646` | Soldi, basso rischio (RPC idempotente) |
| 3.3 | Webhook RevenueCat: non sovrascrivere `reset_at` con `period_end` | `billing_db.py:193-211` | Test a cavallo del mese |
| 3.4 | Idempotency key deterministiche su advice-outcome/feedback (no `Date.now()`) | `advice/api.ts:50`; `behavior/api.ts:152` | |
| 3.5 | Validazione server reale durata/size media (probe, non claim client) | `behavior_db.py:72-75` | |
| 3.6 | Reminder: mark prima del send (o send idempotente su reminder-id) | `handlers.py:1076-1090` | Utente se ne accorge |
| 3.7 | Rate limiter: cleanup ogni N hit o nel cron | `rate_limit_db.py:51-56` | |
| 3.8 | Push Expo idempotenti; enqueue fallita → retry, non eccezione ingoiata | `handlers.py:662-667`; `expo_push.py` | |
| 3.9 | Rimuovere fallback inventati nel mapping risultato | `apps/mobile/src/features/behavior/map.ts:33-66` | Errore onesto, non versioni fasulle |

---

## Protocollo di validazione (Kimi)

Per ogni fase, Cursor consegna e io verifico:
1. **Diff review** contro la scheda: niente scope creep, contratti intatti.
2. **Test locali**: `uv run pytest`, `uv run ruff check .`, mobile `pnpm tsc --noEmit` + `pnpm jest` verdi.
3. **Migrazioni**: via MCP su progetto di prova prima, production dopo OK; query di controllo come da schede.
4. **Checklist UX-lock**: 3 tab, bande, niente %, wording probabilistico.
5. Aggiornamento `PROJECT_STATE.md` a fine fase.

## Stato avanzamento

| Fase | Stato | Note |
|------|-------|------|
| Fase 1 (P0) | 🟡 Parziale | FIX 1.6 in produzione (tabella + cron isolato). Resto Fase 1 ancora aperto. |
| GATE-1 | ⏭️ Saltato | Nessuno staging: si testa direttamente in produzione. |
| Fase 2 (P1) | ⬜ | |
| Fase 3 (P2) | ⬜ | |
