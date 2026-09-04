# RUNBOOK — Operazioni e incident response (Vercel / Amendment V1.1)

Ambiente di riferimento: **staging = Vercel preview deployments**, **production =
deploy Vercel manuale gated**; async = **Vercel Workflows** (dietro adapter `JobQueue`);
DB/Auth/Storage = Supabase; billing = RevenueCat. Cloud Run/Cloud Tasks sono solo
*future scaling path* (Amendment V1.1) — queste procedure V1 assumono Vercel.

Config rilevante: `backend/app/config.py` (env vars Vercel), `infra/vercel/README.md`.
Feature flag/routing provider: `OBSERVER_PROVIDER`, `REASONING_PROVIDER`,
`DIGESTIVE_VISION_PROVIDER` (+ `*_MODEL`) e flag modulo AI via vendor di feature flag
(O-04: vendor finale OPEN — vedi `docs/DECISIONS.md`; wrapper replaceable).

## 1. Provider AI outage (Gemini / OpenAI)

**Sintomi:** spike di `PROVIDER_TIMEOUT` / `PROVIDER_SCHEMA_INVALID`, retry rate in
crescita, latenze provider P95 oltre target (sez. 25.3).

**Procedura:**
1. Verificare lo stato del provider e i dashboard costo/latenza per model/version.
2. Se l'outage è di un solo provider: **rerouting via config** — aggiornare la Vercel
   Env Var del provider interessato (es. `OBSERVER_MODEL` verso il modello
   fallback valutato) e redeploy/promuovi. Mai hard-code: solo config (sez. 14.2).
   Nuovi modelli non valutati: solo se già passati in shadow eval, altrimenti
   preferire il kill switch (sez. 26.2 release gate).
3. Se l'intero dominio è compromesso: attivare il **kill switch di dominio**
   (feature flag) per sospendere il modulo AI costoso senza release app
   (sez. 22 "Provider outage"). L'utente vede stato `FAILED_RETRYABLE`/retry, non un
   crash.
4. Gli eventi in coda restano durevoli su Vercel Workflows e vengono ritentati con
   backoff; gli handler worker sono idempotenti alla riconsegna (sez. 22) — nessuna
   azione manuale sui singoli job.
5. A ripristino: disattivare kill switch/rerouting, monitorare drenaggio coda e tasso
   di schema failure; verificare che le quote rifiutate per qualità/tecnica siano state
   rimborsate (`refund_usage`, idempotente).

## 2. Spend kill switch (costo AI / budget)

**Obiettivo (sez. 27):** un aumento di prezzo o un abuso non deve distruggere il
margine. Guardrail V1: **spending/concurrency limits Vercel** + **budget provider AI
con alert giornalieri/mensili** + kill switch.

**Procedura:**
1. Alert budget provider o Vercel spend limit raggiunto → verificare mix provider,
   retry rate e costo per evento (dashboard sez. 25.3; tabella `internal.ai_cost_events`).
2. Azioni progressive:
   - Ridurre/routing verso il modello a costo minimo che ha passato l'eval
     (sez. 14.2: default al modello più economico valido; escalation solo per schema
     failure/ambiguità/safety).
   - Attivare il feature flag di pausa del dominio costoso (behavior e/o digestive).
   - In ultima istanza: spending limit hard lato Vercel (il deploy smette di scalare;
     le read API restano servite finché nei limiti).
3. Nessuna modifica quota lato client: le allowance sono entitlement server-side
   (sez. 21); comunicare agli utenti lo stato via copy di servizio (O-02 per wording
   finale: OPEN — vedi `docs/DECISIONS.md`).
4. Post-incident: registrare causa, durata, costo; aggiornare soglie budget.

## 3. Queue backlog (Vercel Workflows)

**Sintomi:** `queue_wait_ms` in crescita (sez. 25.1), eventi fermi in
`QUEUED`/`OBSERVING`, retry rate alto.

**Procedura:**
1. Diagnosticare: outage provider (→ sez. 1), errori schema sistematici
   (`PROVIDER_SCHEMA_INVALID`), o spike di traffico.
2. Se errore sistematico (bug worker/contratto): **non** lasciare drenare la coda sul
   codice rotto — attivare kill switch dominio, fissare e deployare, poi riattivare.
   I job sono durevoli e retryable: la riconsegna è sicura perché gli handler sono
   idempotenti e gli stati terminali sono no-op (sez. 22).
3. Se spike di traffico: alzare i limiti di concorrenza Vercel con attenzione ai
   rate/quota di Supabase e provider (le max-concurrency proteggono il DB e le quote
   provider durante abuso o traffico improvviso, sez. 27.1).
4. Attempt count cappato: job che esauriscono i retry passano a `FAILED_TERMINAL` con
   refund quota e telemetria di supporto (sez. 7.2/22). Verificare che i terminal
   siano rimborsati e tracciati in `internal.analysis_jobs.last_error_code`.
5. Mai manipolare job a mano in produzione: nessuna modifica manuale allo schema/dati
   di produzione (sez. 0.2/11.1).

## 4. Storage cleanup / retention

**Policy (sez. 23.2):** raw video behavior e foto digestive hanno TTL configurabile
(`RAW_MEDIA_TTL_HOURS`, beta default 24 h post-completamento); "keep clip" e research
opt-in espliciti; food-label image eliminata dopo estrazione verificata salvo scelta
utente. Gli artefatti durevoli sono gli eventi strutturati (piccoli).

**Procedura (monitoraggio):**
1. Dashboard "storage growth and retention cleanup success" (sez. 25.3): crescita
   lineare perpetua dei bucket `behavior-raw`/`digestive-raw` = cleanup rotto.
2. Verificare che gli eventi in stato terminale abbiano `retention_state` coerente
   (TEMPORARY → DELETE_PENDING → DELETED; sez. 33.5) e che la migrazione 0012
   (funzioni retention) sia applicata.
3. Cleanup manuale solo via funzioni di retention del DB (0012), mai delete ad-hoc
   sulla console Storage: il delete deve restare auditabile (sez. 23.3).
4. Export account: artefatto privato con expiry; deletion account: revoca accesso
   immediata + purge asincrono con completion state, retryable, senza raw content nei
   log.

## 5. Rollback

**Backend/API (Vercel):**
1. **Instant rollback Vercel**: promuovere il deployment precedente noto-buono
   (production è un deploy manuale gated → il target di rollback è sempre noto).
2. Compatibilità API: il deploy backend precede il mobile solo se backward compatible;
   mantenere la finestra di compatibilità di almeno una versione mobile precedente
   (sez. 28.3). Se il rollback rompe un contratto consumato dal mobile in campo,
   valutare invece roll-forward con fix.
3. Dopo rollback: verificare smoke su `/v1/me`, un giro capture init/complete e un
   task workflow `/tasks/run` con `x-internal-token` valido.

**Database:**
- Mai editare una migrazione applicata: gli undo si fanno con **nuova migrazione**
  (sez. 11.1). Modifiche distruttive richiedono backfill plan, finestra di
  compatibilità e procedura di restore.
- Migrazione di produzione solo con piano revisionato e backup/restore readiness
  (sez. 28.3).

**Mobile:** rollback = re-submit store (lento) → preferire feature flag/kill switch
server-side per disattivare funzionalità difettose senza release (sez. 22).

**Kill-switch drill:** prima di G9, testare in staging: kill switch dominio, rollback
Vercel, spend limit (sez. 30 — G9 richiede "rollback/kill-switch tested").

## 6. Riferimenti rapidi

| Componente | Dove |
| --- | --- |
| Env vars e mappatura segreti | `infra/vercel/README.md`, `docs/SECURITY.md` sez. 2 |
| Stati evento / errori stabili | Spec V1 sez. 7.2 / 22.1; `docs/AI_CONTRACTS.md` |
| Telemetria costi per evento | tabella `internal.ai_cost_events` (migrazione 0007); dashboard sez. 25.3 |
| Quota reserve/commit/refund | migrazione 0006; test `backend/tests/test_quota.py` |
| Checklist release | `docs/RELEASE_CHECKLIST.md` |
