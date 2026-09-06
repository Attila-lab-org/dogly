# CURSOR — START HERE (pacchetto lavoro backend)

**Data:** 2026-09-06 • **Per:** Cursor (o chi lavora su backend/supabase/CI) • **Regola d'oro:** non toccare MAI `apps/mobile/` (ci lavora Kimi in parallelo). Non fare push finché il PO non lo chiede. Alla fine: elenca tutti i file modificati + esito test.

## Ordine di esecuzione

### FASE 1 — Fondamenta che bloccano tutto (da `docs/CURSOR_BACKEND_TASKS.md`)
1. **Task 2 (C-2)**: persistenza SQL per tutti i domini (`*_db.py` per care, digestive, diary, nutrition, gallery, devices, privacy, subscription) — pattern: `domains/dogs_db.py`.
2. **Task 1 (C-1)**: handler worker `privacy_export` / `account_deletion` (GDPR — release blocker P0 della Spec sez. 31.2).
3. **Task 3 (H-1)**: retention cleanup DB-backed via `internal.media_due_for_deletion`.
4. **Task 4 (H-2)**: step `bash supabase/tests/run_tests.sh` in `.github/workflows/ci.yml`.

### FASE 2 — AI Knowledge + Advice Engine V2 (ADR-012)
Esegui integralmente **`docs/kb/CURSOR_IMPLEMENTATION_BRIEF_Dogly_AI_Knowledge_Advice_V2.md`** (è repo-aware e completo: moduli `backend/app/knowledge/`, `domains/dog_context.py`, retrieval card, AdviceEngine deterministico max-1-consiglio, 2 migrazioni, API lifestyle/advice-outcome, test di accettazione alla sua sez. 15). Il JSON dati è in `docs/kb/dogly_knowledge_advice_engine_v2.json`. **Non modificare `contracts/taxonomy.py`** (tassonomia confermata, ADR-012).

### FASE 3 — Billing e integrità (da `docs/CURSOR_BACKEND_TASKS.md`)
5. **Task 7 (H-5)**: webhook RevenueCat → `public.subscriptions` (status mapping + anchor idempotente).
6. **Task 5 (H-3)**: `/v1/usage` e `/v1/subscription/status` DB-backed.
7. **Task 6 (H-4)**: worker persiste `attempt_count` nel ramo retryable.
8. **Task 8 + 9**: endpoint consensi (`/v1/me/consents` GET/PATCH) — il mobile già li attende con TODO; campi diario/eventi (task 19-20).

### FASE 4 — Igiene (task 10-18, 21-25 dello stesso documento)

## Regole non negoziabili (Spec V1)
- Migrazioni forward-only, RLS/grants nella stessa migrazione, negative test per ogni dominio.
- Mai segreti nel codice; chiamate AI pagate mockate in CI; OpenAPI export aggiornato (`scripts/export_openapi.py`) dopo ogni cambio route.
- Ogni fase si chiude con: `uv run pytest` verde + OpenAPI diff pulito + riga di stato in `PROJECT_STATE.md`.
- Conflitti tra documenti: NON risolverli per congettura — segnalali al PO (Spec sez. 0.1).

## Cosa NON fare
- Non toccare `apps/mobile/`, non installare nulla lì, non modificare `docs/DECISIONS.md` (le ADR le registra il PO/Kimi).
- Non implementare upload da galleria behavior (O-06), non abilitare pattern discovery (O-08), mai % di confidenza (O-07).
