# SPEC AMENDMENT V1.1 — Decisione infrastrutturale riaperta dal Product Owner

Data: 2026-09-04 • Autorità: Product Owner (riapre esplicitamente decisione LOCKED della Spec V1 sez. 2/8)
Precedenza: questo emendamento **sostituisce** le voci corrispondenti della Spec V1. Tutto il resto della Spec V1 resta invariato e vincolante.

## Decisioni aggiornate

| Voce | Spec V1 (superata) | V1.1 (vigente) |
| --- | --- | --- |
| Hosting | Google Cloud Run: public API + private worker | **Vercel** — FastAPI deployato su Vercel (Python runtime / serverless functions) |
| Async processing | Google Cloud Tasks → private Cloud Run worker | **Vercel Workflows** — job asincroni durevoli, retryable, push-based |
| Database / Auth / Storage | Supabase | **Invariato: Supabase** |
| Mobile | React Native + Expo + TypeScript | **Invariato** |
| Provider AI | Gemini (observer) / OpenAI (reasoner) via adapter | **Invariato** |
| Billing | RevenueCat | **Invariato** |
| Cloud Run / Cloud Tasks | piattaforma V1 | **Non usati in V1** — mantenuti solo come future scaling path documentato |
| Secret management | Cloud Secret Manager | **Vercel Environment Variables** (classi di segreti della sez. 4.2 invariate: niente segreti nel mobile, chiavi provider solo server-side) |

## Regole architetturali che RESTANO vincolanti
- **JobQueue adapter (sez. 8.3)**: la coda resta dietro interfaccia `JobQueue`; l'implementazione V1 è l'adapter **Vercel Workflows**. L'architettura resta migrabile (futuro Cloud Tasks/Run possibile senza refactor di dominio).
- **Provider interfaces (sez. 14.1)**: invariate — observer/reasoner/personal engine/cost meter restano sostituibili.
- **Separazione public API / private worker**: concettualmente invariata; su Vercel si realizza con route pubbliche vs workflow/handler interni protetti (no ingress pubblico, autenticazione interna).
- **Media path**: i media grandi continuano a bypassare l'API via signed URL diretti a Supabase Storage (sez. 8, 12.1) — Vercel non diventa proxy di banda.
- **Repository topology (sez. 3)**: `/infra/cloudrun/` → **`/infra/vercel/`** (config deploy, `vercel.json`, env mapping). Tutto il resto invariato.
- **CI/CD (sez. 28)**: GitHub Actions invariato; il deploy target diventa Vercel (staging = preview deployments, production = deploy manuale gated). EAS invariato per il mobile.
- **Guardrail di costo**: max-istances/budget alerts si traducono in limiti di concorrenza/spending Vercel + budget provider AI con kill switch (sez. 27 invariata negli obiettivi).

## Impatto per workstream
- **A (Mobile)**: nessun impatto funzionale; base URL API via `EXPO_PUBLIC_API_URL`.
- **B (DB)**: nessun impatto.
- **C (Backend)**: deploy target Vercel; `JobQueue` adapter = Vercel Workflows; niente dipendenze GCP (google-cloud-tasks) nel codice V1; local dev = fake queue invariato.
- **D (Async/Infra)**: quando attivato, implementa `infra/vercel/` al posto di `infra/cloudrun/`.
