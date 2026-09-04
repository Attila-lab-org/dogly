# DECISIONS — Architecture Decision Records e registro decisioni

Fonte di precedenza (Spec V1 sez. 0.1): Spec V1 > Master Blueprint V4 > Product Spec V2
> Unit Economics V1 > ricerca scientifica. Le decisioni **LOCKED** si implementano come
scritte; solo il Product Owner può riaprirle. Questo file registra ADR con data e
razionale, e le decisioni ancora aperte (O-01…O-09) **senza inventare risoluzioni**.

## ADR

### ADR-001 — Stack tecnologico LOCKED (Spec V1)

- **Data:** 2026-09-04 • **Autorità:** Product Owner (Spec V1 sez. 2) • **Stato:** LOCKED
- **Decisione:** Mobile React Native + Expo + TypeScript (Expo Router, TanStack Query,
  React Hook Form + Zod, Expo SQLite/SecureStore); backend Python 3.12+ FastAPI +
  Pydantic v2; DB Supabase PostgreSQL (migrazioni SQL uniche, SQLAlchemy 2 async via
  pooler, no ORM migrations); Auth Supabase (Apple/Google/email, JWT validato da
  FastAPI); Storage Supabase privato con signed URL diretti (API mai proxy di banda);
  observer Gemini e reasoner OpenAI **via adapter** (model ID in config, mai
  hard-coded); billing RevenueCat; notifiche Expo Push; Sentry/PostHog raccomandati
  dietro wrapper; CI GitHub Actions + EAS.
- **Vincoli espliciti:** NO Capacitor, NO Flask; nessun segreto nel mobile; chiamate AI
  pagate mockate in CI.

### ADR-002 — Hosting Vercel + Vercel Workflows (SPEC_AMENDMENT_V1.1)

- **Data:** 2026-09-04 • **Autorità:** Product Owner (riapre esplicitamente la decisione
  LOCKED della Spec V1 sez. 2/8) • **Stato:** LOCKED (vigente, sostituisce Spec V1)
- **Decisione:**
  - Hosting: **Vercel** — FastAPI deployato su Vercel Python runtime / serverless
    functions (al posto di Google Cloud Run public API + private worker).
  - Async processing: **Vercel Workflows** — job asincroni durevoli, retryable,
    push-based (al posto di Cloud Tasks → Cloud Run worker).
  - Secret management: **Vercel Environment Variables** (classi di segreti Spec V1
    sez. 4.2 invariate: niente segreti nel mobile, chiavi provider solo server-side).
  - Invariati: Supabase (DB/Auth/Storage), mobile Expo, provider AI via adapter,
    RevenueCat, EAS.
  - Cloud Run / Cloud Tasks: **non usati in V1** — mantenuti solo come *future scaling
    path* documentato.
- **Rationale:** la coda resta dietro l'interfaccia `JobQueue` (Spec V1 sez. 8.3);
  l'implementazione V1 è l'adapter Vercel Workflows
  (`backend/app/providers/vercel_workflows.py`). L'**architettura resta migrabile**:
  un futuro passaggio a Cloud Tasks/Run richiede solo un nuovo adapter `JobQueue`,
  senza refactor del dominio. La separazione public API / private worker resta
  concettuale: route pubbliche `/v1/*` (JWT) vs route interne `/tasks/run` protette da
  `x-internal-token`, senza ingress pubblico logico.
- **Conseguenze:** `infra/cloudrun/` → `infra/vercel/`; staging = preview deployments
  Vercel; production = deploy manuale gated; guardrail di costo = limiti di
  concorrenza/spending Vercel + budget provider AI con kill switch (obiettivi Spec V1
  sez. 27 invariati). Guardrail nel codice: nessuna dipendenza GCP in V1 (test
  `test_job_queue.py`).

### ADR-003 — Contratti canonici e confini provider

- **Data:** 2026-09-04 • **Autorità:** Spec V1 sez. 3.1 / 14.1 • **Stato:** LOCKED
- **Decisione:** FastAPI/Pydantic è la source of truth dei contratti API pubblici
  (OpenAPI esportato in CI, snapshot `docs/openapi.json`, drift = fallimento CI);
  i contratti delle risposte provider sono modelli Pydantic backend-only (il JSON grezzo
  Gemini/OpenAI non diventa mai contratto mobile); lo schema DB è controllato solo da
  migrazioni Supabase SQL; tassonomie/status in costanti/tabelle versionate. Interfacce
  provider `VideoObserver` / `Reasoner` / `DigestiveVision` / `PersonalEngine` /
  `CostMeter` / `StorageProvider` / `JobQueue` sostituibili (dettagli in
  `docs/AI_CONTRACTS.md`).

### ADR-004 — Personal Intelligence firewall anti-feedback-loop

- **Data:** 2026-09-04 • **Autorità:** Spec V1 sez. 17 • **Stato:** LOCKED
- **Decisione:** una predizione del modello non è mai "ciò che Rocky fa": separazione
  delle fonti (observer = evidenza, reasoner = ipotesi, owner = etichetta utile non
  ground truth, outcome osservato = evidenza indipendente); gli update dei pattern
  passano solo da un servizio deterministico di Personal Intelligence; la predizione
  generativa ha **zero autorità** sui pattern (release blocker P0, Spec V1 sez. 31.2);
  precedenza evidenza: video corrente → contesto → policy generale → memoria personale
  eligibile.

### ADR-005 — Subscription senza "unlimited" e quota atomica server-side

- **Data:** 2026-09-04 • **Autorità:** Spec V1 sez. 21 / 7.3 • **Stato:** LOCKED
- **Decisione:** FREE 3+3 analisi/mese, PREMIUM €9.99/mese o €89.99/anno 30+30/mese;
  nessun usage illimitato; entitlement server-side (mirror RevenueCat + usage ledger);
  riserva quota atomica lato DB prima del job, refund solo per rejection qualità o
  fallimento tecnico terminale; nessun rollover.

## Decisioni aperte (Spec V1 sez. 32) — NON inventare risoluzioni

| ID | Decisione | Si può codificare? | Regola vigente |
| --- | --- | --- | --- |
| O-01 | Brand/app display name e bundle/package ID di produzione finali | Sì | Placeholder per ambiente in dev/staging; release store di produzione bloccata. |
| O-02 | Wording finale legale/privacy/disclaimer medico | Sì | Slot di copy versionati, architettura consensi e template safety; copy legale bloccato prima del public release. |
| O-03 | Model ID esatti OpenAI/Gemini | Sì | Selezione via config dopo lo spike (G3); nessun hardcoding. |
| O-04 | Vendor analytics/feature-flag finale | Sì | Raccomandati PostHog + Sentry; interfacce wrapper mantengono sostituibilità. |
| O-05 | Durate finali di retention dei raw media | Sì | TTL configurabile + keep/research consent esplicito; finalizzare prima del public V1. |
| O-06 | Upload da galleria per behavior post-launch | Sì | Non implementare nella V1 iniziale. |
| O-07 | Percentuale numerica di confidence | Sì | Non shippare percentuali fino al calibration gate; usare bande Low/Medium/High. |
| O-08 | Algoritmo di similarity/embedding dei pattern | Sì | Solo infrastruttura in P0; abilitare discovery dopo eval. |
| O-09 | Multi-dog / family tier | Sì | Schema già compatibile; il piano V1 limita a 1 cane attivo. |

> Qualunque elemento non deciso e non presente in questo registro va marcato
> **OPEN** nei documenti operativi e riportato qui — mai risolto per congettura
> (Spec V1 sez. 0.1 conflict rule).
