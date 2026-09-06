# SECURITY — Threat model, segreti, RLS/storage, auth interna

Fonte: Spec V1 sez. 4.2, 12, 15, 22, 23, 24 + SPEC_AMENDMENT_V1.1 (secret management
→ Vercel Environment Variables; hosting/coda → Vercel / Vercel Workflows).
Implementazione di riferimento: `supabase/migrations/0008–0009,0012`,
`backend/app/api/auth.py`, `backend/app/api/routes/webhooks.py`,
`backend/app/worker/main.py`.

## 1. Threat-control matrix (Spec V1 sez. 24.1)

| Threat | Controllo obbligatorio | Stato implementazione |
| --- | --- | --- |
| Cross-user data access | RLS + ownership check backend + test negativi su ogni dominio | ✅ RLS su tutte le tabelle public (migrazione 0009); test `supabase/tests/rls_negative_tests.sql` |
| Service-key leak | Segreti solo server-side / secret store; repository secret scan | ✅ Classi segreti mappate su Vercel Env Vars (sez. 2); secret scan in CI (sez. 28.1) — pipeline CI in allestimento |
| Quota bypass / parallel abuse | Riserva usage atomica + guardrail device/account/IP autenticati | ✅ Funzioni DB atomiche `reserve/commit/refund` (migrazione 0006); test race `supabase/tests/quota_concurrency.sh` + `backend/tests/test_quota.py` |
| Signed URL misuse | Path esatto generato dal server, expiry breve, bucket privati, validazione metadata | ✅ Storage policies migrazione 0008; path `users/{uid}/dogs/{dog_id}/{domain}/{event_id}/{uuid}.{ext}` generato dall'API |
| Dogly Signals overclaim | Copy/contratti vietano traduzione, obbedienza e significati universali | ✅ `signal_experiments` salva solo categoria safe, sound key allowlisted, reazioni osservabili e feedback owner |
| Prompt/media injection | Media trattati come dato non fidato; output strutturati; nessuna esecuzione di tool AI nel path di inferenza | ✅ Regola sez. 15 (vedi sez. 5); validazione Pydantic con allowlist enum |
| Webhook spoof | Validazione firma RevenueCat + event ID idempotenti | ✅ `POST /v1/webhooks/revenuecat` richiede `REVENUECAT_WEBHOOK_SECRET`; nessun JWT utente; handling idempotente |
| Task spoof | Identità interna coda→worker; worker senza ingress pubblico | ✅ Su Vercel: route `/tasks/run` protette da header `x-internal-token` = `WORKER_INTERNAL_TOKEN`; dispatcher `VercelWorkflowsJobQueue` unico chiamante attestato (sostituisce OIDC Cloud Tasks, Amendment V1.1); test `test_worker.py` |
| Mass scraping of diary | Paginazione a cursore, ownership, rate control, nessun URL media pubblico | ✅ Cursor pagination su `/v1/diary`; bucket privati, nessun public URL |
| Provider response corruption | Validazione stretta Pydantic/JSON-schema e allowlist enum | ✅ Contratti in `backend/app/contracts/`; test fixture `test_contracts.py` |
| Sensitive logging | Solo correlation ID; redazione di auth, segreti, media, prompt completi e note private | ✅ `internal.audit_log` senza media/prompt grezzi (migrazione 0007) |
| Supply-chain dependency risk | Lockfile pinnati, Dependabot/security scanning, pacchetti nativi minimi | 🔶 Lockfile backend (`uv`); dipendenza da CI security scan — in allestimento |
| Unsafe model advice | Tassonomia chiusa + policy + template safety deterministici + astensione | ✅ Tassonomia intent chiusa (seed migrazione 0011); abstention/INSUFFICIENT nel contratto |

Legenda: ✅ implementato con test • 🔶 parziale / in allestimento.

## 2. Classi di segreti (Spec V1 sez. 4.2) → Vercel Environment Variables

Amendment V1.1: il secret store V1 è **Vercel Environment Variables** (per ambiente
Production / Preview / Development). Le classi di segreti e i divieti restano
invariati. Mappatura concreta sulle variabili di `backend/app/config.py`:

| Segreto (sez. 4.2) | Variabile / dove vive | Mai consentito |
| --- | --- | --- |
| Supabase publishable key | Mobile env (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | Funzionalità service role |
| Supabase service role / credenziali DB | Vercel Env Var (`DATABASE_URL` via pooler) — solo deployment Vercel | Mobile / log / client generato |
| Gemini API key / credenziali Google | Vercel Env Var `GEMINI_API_KEY` — solo route workflow interne (G3) | Mobile |
| OpenAI API key | Vercel Env Var `OPENAI_API_KEY` — solo route workflow interne (G3) | Mobile |
| RevenueCat public SDK keys | Config piattaforma mobile | Secret webhook/API key RevenueCat |
| RevenueCat webhook secret | Vercel Env Var `REVENUECAT_WEBHOOK_SECRET` — solo API | Mobile |
| Identità coda→worker | Vercel Env Var `WORKER_INTERNAL_TOKEN` (header `x-internal-token`) + `WORKFLOW_BASE_URL` | Credenziali lato client |

Regole trasversali (sez. 0.2 / 4.1): nessun segreto provider, service-role,
RevenueCat secret o credenziale cloud nel codice mobile o nella history del repo;
le variabili `EXPO_PUBLIC_*` contengono solo valori intenzionalmente pubblici;
nessun segreto di produzione nei log CI.

## 3. RLS e storage

- **Separazione schemi (sez. 10):** `public` = dati utente con RLS stretta su ogni
  tabella; `internal` (jobs, costi, audit, retention, payload provider) **non esposto**
  via Supabase Data API — accesso solo service role. Test negativi dedicati.
- **Matrice di autorizzazione (sez. 12):** il client non scrive mai dati AI-derived
  (eventi, observation, interpretation, pattern, usage ledger, subscriptions): letture
  solo dei propri record; scritte solo via API con controllo ownership; il worker/API
  opera con service role.
- **Dogly Signals:** le tabelle `signal_experiments` e `signal_map_entries` sono
  owner-scoped via `dogs.owner_id`. I dati sono sound key allowlisted e reazioni
  osservabili; niente raw audio, niente voce del proprietario, niente significati
  inventati o comandi. Le scritture sono negate ad `authenticated`/`anon` sia
  dalle policy RLS sia dai privilegi SQL (`0016`); mutazioni solo via API.
- **Storage privato (sez. 12.1, migrazione 0008):** bucket privati
  (`dog-avatars`, `behavior-raw`, `digestive-raw`, `food-labels`, `exports`); object key
  generato dall'API; signed upload URL per esattamente un path con expiry breve
  (`STORAGE_SIGNED_URL_TTL_SECONDS`, default 600 s); signed read URL solo server-side
  per utente autorizzato; validazione MIME/dimensione/durata prima di lavoro AI
  costoso; nessun public URL per video comportamentali grezzi; nessun URL pubblico
  permanente verso i provider.
- **Retention/deletion (sez. 23, migrazione 0012):** TTL raw media configurabile
  (`RAW_MEDIA_TTL_HOURS`, beta default 24 h post-analisi); "keep clip" e research
  opt-in espliciti; export/delete account con job retryable e auditabile, senza
  contenuto grezzo nei log.

## 4. Webhook RevenueCat e auth interna worker

- **Webhook RevenueCat (sez. 21.1 / 24.1):** `POST /v1/webhooks/revenuecat` non
  accetta JWT utente; richiede verifica firma con `REVENUECAT_WEBHOOK_SECRET`;
  event handling idempotente (event ID); l'entitlement del mobile non è mai
  autorevole — il mirror server-side governa l'accesso.
- **Auth interna worker (Amendment V1.1):** le route workflow `/tasks/run`
  (`backend/app/worker/main.py`) richiedono header `x-internal-token` uguale a
  `WORKER_INTERNAL_TOKEN`. Nessun ingress pubblico logico: il dispatcher
  `VercelWorkflowsJobQueue` è l'unico chiamante attestato; handler idempotenti alla
  riconsegna (sez. 22); payload dei task = solo ID (niente media bytes, niente
  segreti). In local dev il token di default (`local-internal-token`) non è un segreto
  reale.
- **JWT utenti (sez. 24.2):** FastAPI valida il JWT Supabase (firma/JWKS via
  `SUPABASE_JWKS_URL`, issuer `SUPABASE_JWT_ISSUER`, expiry, audience) e deriva
  `user_id` esclusivamente da `sub`; nessun endpoint accetta `owner_id`/`user_id`
  dal client come autorità.

## 5. Prompt-injection rule (Spec V1 sez. 15)

Qualsiasi testo, schermata, voce o istruzione che appare **dentro i media utente** è
contenuto non fidato:

- Le istruzioni dell'observer dichiarano esplicitamente che il contenuto dei media non
  deve mai alterare le istruzioni di sistema/sviluppatore.
- L'output del provider è sempre validato a schema (Pydantic + allowlist enum) e non
  viene mai eseguito come codice o comando di tool.
- Nel path di inferenza non esiste esecuzione di tool AI.
- Log e audit non conservano prompt completi né contenuto dei media (solo correlation
  ID, provider/model/version, usage).

## 6. Controlli incidentali

Kill switch provider/feature flag, spend control, rollback e gestione outage sono nel
runbook operativo: `docs/RUNBOOK.md`. Blocker di release P0 security-related:
`docs/RELEASE_CHECKLIST.md` (sez. 31.2).
