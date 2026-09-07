# AUDIT ENTERPRISE — Dogly (canine-behavioral-intelligence)

**Data:** 2026-09-05 • **Tipo:** audit read-only pre-release (4 domini: Security/Privacy, Backend, Mobile/UX, Spec/Docs/Process) • **Esito build al momento dell'audit:** backend `uv run pytest` 42/42 ✅, mobile `tsc` ✅ + jest 69/69 ✅, OpenAPI zero drift (33 path).

> **STORICO / SUPERATO (2026-09-07).** Valutazioni e conteggi sono riferiti allo
> snapshot auditato il 2026-09-05. Per lo stato corrente usare
> `PROJECT_STATE.md`.

## Giudizio complessivo: 6.6 / 10 — "Bel guscio, motore da collegare"

| Dominio | Voto | Sintesi |
| --- | --- | --- |
| Security & Privacy | 6.5 | RLS/storage/JWT esemplari; GDPR export/delete e retention **non funzionanti in produzione** |
| Backend Engineering | 5.0 | Contratti e quota SQL ottimi; **persistenza SQL assente per ~10 domini su 12** |
| Mobile & UX | 7.5 | UX-lock enforced dai test, token discipline, a11y sopra la media; care feature da cablare |
| Spec/Docs/Process | 7.5 | ADR disciplinate e rispettate; qualche gate sovradichiarato e CI incompleta |

**Verdetto:** il progetto è maturo come disciplina (decisioni tracciate, test di guardrail, threat model) ma **non è pronto per utenti reali**: i dati in produzione vivono in memoria per-processo serverless, la privacy GDPR è un vicolo cieco, e i test che proteggono RLS/quota non girano in CI.

---

## Findings CRIT (bloccanti release)

### C-1 — Privacy export/delete account non funzionanti (GDPR)
`POST /v1/privacy/export` e `/v1/privacy/delete-account` creano job che **nessun worker esegue** (`backend/app/worker/main.py:26-30` — handler presenti solo per behavior/digestive/retention). In produzione nemmeno `internal.begin_account_deletion()` (che esiste ed è testata, `0012:227-251`) viene mai chiamata → nessuna revoca, nessuna purge. Zero test (`backend/tests/` non ha test privacy). La release checklist dichiara questo un P0 blocker (`supabase/tests/privacy_retention_tests.sql:3-4`).
**Fix:** handler worker `privacy_export`/`account_deletion` con purge storage+tabelle+auth user; test backend.

### C-2 — Persistenza SQL assente per la maggior parte dei domini
`build_default_state` crea sempre `InMemoryStore` (`backend/app/api/deps.py:56`); il branch SQL esiste solo in `routes/behavior.py` e `routes/dogs.py`. Care, digestive, diary, nutrition, patterns, gallery, devices, privacy, subscription, webhook mirror usano solo memoria → su Vercel serverless **i dati utente si perdono a ogni istanza/restart**. La tabella `care_events` (0014) non è mai letta/scritta dal backend (non esiste `domains/care_db.py`).
**Fix:** implementare i `*_db.py` per ogni dominio (pattern già esistente in `dogs_db.py`).

---

## Findings HIGH

| # | Finding | Evidenza |
| --- | --- | --- |
| H-1 | Retention cleanup legge solo lo store in-memory: con DB reale non cancella nulla; ignora `DELETE_PENDING`, food-labels, exports. La vista `internal.media_due_for_deletion` è inutilizzata | `backend/app/domains/retention.py:34-68` |
| H-2 | Test SQL (RLS negative, quota, privacy) **mai eseguiti in CI**: il job `supabase` fa solo start + db reset. Blocca la RELEASE_CHECKLIST A | `.github/workflows/ci.yml:55-63` vs `supabase/tests/run_tests.sh` |
| H-3 | `/v1/usage` e `/v1/subscription/status` in produzione leggono solo memoria → sempre FREE/0 consumi | `backend/app/domains/billing.py:78,127-152` |
| H-4 | Worker: fallimenti retryable non persistono `attempt_count` → retry infiniti, evento bloccato | `backend/app/worker/handlers.py:77-91,117` |
| H-5 | Webhook RevenueCat non scrive `public.subscriptions` (quota premium mai attiva) + status mapping incompatibile con la SQL function | `backend/app/api/routes/webhooks.py:52-61`, `providers/billing.py:42-46` |
| H-6 | Zero test sui path SQL di produzione; ~8 domini senza test; `test_care.py` ha 1 solo happy-path (negative test richiesti da spec 24.1) | `backend/tests/` |
| H-7 | G1 dichiarato "✅ COMPLETATO" ma la sua evidenza DB è ammessa parziale (B-2): sovradichiarato | `PROJECT_STATE.md:9` vs `:30` |
| H-8 | Notifiche care mai configurate né deep-linkate: `configureCareNotifications` e `subscribeToCareNotificationResponses` senza call site; `data.href` dead letter | `apps/mobile/src/features/care/notifications.ts:16,95` |

## Findings MED (selezione)

- **Worker `/tasks/run` pubblicamente raggiungibile** (montato su `/` della function Vercel): protetto solo da token statico; `docs/SECURITY.md:84` dichiara "nessun ingress pubblico" — falso (`api/index.py:49`).
- **Idempotenza webhook solo in-memory** (cold start serverless → duplicati); nessun test webhook (`repository.py:86`).
- **MIME non validato** su capture init (`content_type: str` libero) vs "validazione MIME" dichiarata ✅ in SECURITY.md (`contracts/api.py:257`).
- **Doppia fonte TTL**: DB `internal.retention_policies` (1h/7gg) vs Python `raw_media_ttl_hours=24` per tutto; le policy DB mai lette (`0012:56-60` vs `retention.py:21-31`).
- **Reminder care mai erogabili**: nessun job li invia nonostante `reminder_sent_at` e indice dedicato (0014).
- **Care store mobile**: solo memoria, mutazioni ottimistiche senza rollback su errore remoto (`features/care/store.ts:177-205`).
- **Sentry installato ma mai inizializzato** (`@sentry/react-native` in package.json, zero call site).
- **Codice morto**: `DailyMessageCard` (+mock), `DoglyLogo` e `features/brand/index.ts` senza importatori.
- **A11y**: nessun `TextInput` dell'app ha `accessibilityLabel` (sign-in, care/new, onboarding, edit).
- **Feedback 3-vie**: se la POST fallisce il catch ingoia l'errore e l'utente vede "Salvato" — feedback perso (`features/core/feedback.ts:31-39`).
- **CI `dependency-scan` non scansiona** (compila requirements + riesegue un test config; nessun pip-audit) (`ci.yml:92-103`).
- **Contraddizioni docs**: "Production path: Gemini/OpenAI adapters" vs blocker B-4 "provider AI reali non integrati" (`PROJECT_STATE.md:54` vs `:32`); BILLING_V1 scope non riconciliato con la beta.
- **Grant CRUD diretto** su `care_events` ad `authenticated` (0014:97): bypassa backend/idempotenza via PostgREST.
- **Idempotency DB solo su behavior**; care/digestive/signals solo in memoria.

## Findings LOW (selezione)

- Drift numerico docs: migrazioni reali fino a **0017** (docs dicono 0014/0016), OpenAPI **33 path** (README dice 31), backend **42 test** (README dice 27) — sostituire i conteggi con riferimenti non numerici.
- `SUPABASE_JWT_AUDIENCE=""` disattiva silenziosamente la verifica audience (`auth.py:101`); algoritmo JWT dall'header invece che da allowlist.
- `QUALITY_NO_DOG`/`SAFETY_REVIEW` nella tassonomia errori ma mai sollevati.
- Gradiente welcome `#DCEBFE` hardcoded (quasi-duplicato di `primarySoft #DBEAFE`); icona Google teal su bottone gradiente in sign-in.
- Commento mock obsoleto "Knowledge Score in Home 38%" (`mocks/core.ts:35`); prop morto `disabled={false}` in home.tsx:209.
- 0009 "audit layer" non ri-asserisce le tabelle create dopo (care_events, gallery).

---

## Cosa è fatto BENE (da tenere)

1. **RLS layer esemplare**: fail-closed, `force row level security`, grants colonna-livello, schema `internal` recintato, migrazione 0014 care corretta e coperta da test negativi.
2. **Quota SQL (0006)**: row lock `FOR UPDATE`, anchor idempotente, state machine reservation — il pezzo migliore del repo.
3. **JWT validation corretta e testata**; user_id solo da `sub`; fail-fast config staging/prod contro wiring mock.
4. **UX-lock enforced dai test** (band-mai-%, wording probabilistico, 3–5 evidence, hard cap 20s): la compliance è testata, non dichiarata.
5. **ADR disciplinate e rispettate nel codice** (verificate ADR-002/004/005/007/009/010 + O-07); guardrail anti-GCP e anti-unlimited come test.
6. **Firewall Personal Intelligence** (ADR-004): worker e prompt reasoner non scrivono mai pattern da output generativo.
7. **OpenAPI zero drift** (snapshot byte-identico rigenerato); error taxonomy fedele a spec 22.1 senza leak di stack trace.
8. **Documentazione onesta**: EVALS dichiara "nessuna valutazione eseguita"; RUNBOOK operativo reale con kill switch e rollback.

---

## Roadmap di remediation prioritaria

**P0 — blocca qualsiasi beta (1-2 settimane di lavoro)**
1. C-1: handler worker privacy export/delete + test
2. C-2: persistenza SQL per tutti i domini (`*_db.py`)
3. H-1: retention cleanup DB-backed via `media_due_for_deletion`
4. H-2: step `bash supabase/tests/run_tests.sh` in CI (sblocca anche B-2/B-5 e la checklist A)

**P1 — prima del public release**
5. H-4/H-5: webhook → `public.subscriptions` con anchor idempotente; usage/subscription DB-backed
6. H-3: worker che persiste `attempt_count` nel ramo retryable
7. H-6: negative test per dominio + test path SQL (Postgres effimero)
8. H-8: wiring notifiche care (`configureCareNotifications` + deep-link in `_layout.tsx`)
9. MIME allowlist su capture init; allineare TTL Python↔DB; separare o proteggere `/tasks/run`

**P2 — igiene pre-release**
10. Sentry init; rimozione codice morto (DailyMessageCard, DoglyLogo); `accessibilityLabel` su TextInput; rollback ottimistico care store
11. Riconciliazione docs: G1 condizionato a B-2, B-4 vs production path, scope billing beta, conteggi non numerici; dependency-scan reale (pip-audit)

*Audit eseguito in read-only su 4 domini paralleli; ogni finding ha evidenza file:riga. I mock di provider AI/auth/RevenueCat sono attesi per design V1 e non contati come finding.*

---

## Remediation status (2026-09-05 evening)

| Finding | Stato | Evidenza |
| --- | --- | --- |
| C-1 GDPR export/delete | **CLOSED** | `privacy_db.py` + worker `privacy_export` / `account_deletion`; tests in `test_privacy.py` |
| C-2 SQL persistence | **CLOSED** | `care_db`, `digestive_db`, `gallery_db`, `billing_db`, `devices_db`, `profiles_db`, `patterns_db`, `diary_db`, `privacy_db` + route engine branches |
| H-1 Retention DB | **CLOSED** | `cleanup_expired_raw_media_db` + `arm_*_expiry` via `media_due_for_deletion` / `media_expiry_at` |
| H-2 SQL tests in CI | **CLOSED** | `.github/workflows/ci.yml` runs `supabase/tests/run_tests.sh` |
| H-3/H-5 Billing mirror | **CLOSED** (pulled into P0) | `billing_db` + webhook upsert + `/usage` / `/me` SQL path |
| Migration 0019 | **APPLIED** | fecal/food runtime cols + `begin_export` / `arm_media_expiry` / `collect_user_storage_paths` |

Backend gate at remediation: `uv run pytest` **48 passed**. Mobile: `tsc` + jest **69/69**. Beta release still requires staging smoke of each domain + retention cron ops schedule.
