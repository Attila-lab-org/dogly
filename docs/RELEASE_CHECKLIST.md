# RELEASE CHECKLIST — staging → production (firmabile)

Fonte: Spec V1 sez. 28.3 (production release), 31.2 (release blocker P0), 30 (gate
G8/G9) + SPEC_AMENDMENT_V1.1 (staging = Vercel preview, production = deploy Vercel
manuale gated). La checklist va compilata e **firmata** per ogni release di
produzione. Una voce non verificabile = release bloccata.

Release: ______________  Data: ______________  Commit: ______________
Deployment Vercel (preview di origine): ______________  Deployment production: ______________

## A. Precondizioni staging (tutte verdi su preview deployment)

- [ ] CI verde su `main`: lint/typecheck/test backend (`uv sync` → ruff → pytest),
      migration reset su stack Supabase, RLS/SQL tests, secret scan + dependency scan,
      export OpenAPI senza drift rispetto a `docs/openapi.json` (sez. 28.1).
- [ ] Preview deployment Vercel funzionante: shim `api/index.py` instrada public API
      (`/v1/*`) e route workflow interne (`/tasks/run` con `x-internal-token`).
- [ ] Migrazioni staging applicate automaticamente **solo dopo test verdi** (sez. 28.2).
- [ ] Env vars Vercel dell'ambiente Production/Preview complete e separate
      (vedi `infra/vercel/README.md`; classi segreti in `docs/SECURITY.md` sez. 2).
- [ ] RevenueCat sandbox/test store products verificati (purchase/restore/grace) su
      Expo development build — non Expo Go (sez. 21.1).
- [ ] Real-provider smoke test eseguito con **budget cap** esplicito (sez. 28.2).

## B. Database e compatibilità

- [ ] Piano di migrazione produzione revisionato; backup/restore readiness confermata
      (sez. 28.3).
- [ ] Schema riproducibile da source control (fresh reset da `supabase/migrations/`
      senza stato manuale da Dashboard) (sez. 11.1).
- [ ] Deploy backend **prima** del mobile; API backward compatible; finestra di
      compatibilità con almeno una versione mobile precedente (sez. 28.3).
- [ ] Nessuna modifica manuale allo schema di produzione (solo migrazioni committed).

## C. Blocker P0 (sez. 31.2) — ciascuno deve essere verificato NON presente

- [ ] Nessuna esposizione cross-user: RLS/ownership non bypassabili (test negativi
      allegati alla release).
- [ ] Nessun segreto service/provider in client, repo o log (secret scan allegato).
- [ ] Nessun entitlement Premium derivato da stato client senza validazione server.
- [ ] Nessuna predizione AI può scrivere/rafforzare direttamente un personal pattern
      (firewall Personal Intelligence, ADR-004).
- [ ] Nessun raw media pubblico o con retention perpetua incontrollata (TTL attivo).
- [ ] Export/delete account presenti e funzionanti (E2E privacy allegato).
- [ ] Behavior analysis funzionante su entrambe le piattaforme store (iOS + Android).
- [ ] Telemetria costo AI per evento e spend control provider attivi.
- [ ] Nessun safety flag sopprimibile da testo generato free-form (routing
      deterministico).
- [ ] Migrazioni in grado di riprodurre lo schema di produzione da source control.

## D. Release readiness (sez. 28.3 "signed checklist")

- [ ] Privacy copy e consent architecture aggiornate alla versione di policy corrente
      (wording legale finale: O-02 — OPEN, vedi `docs/DECISIONS.md`; bloccante per
      public release).
- [ ] Store metadata completi; **bundle/package ID produzione finali** (O-01 — OPEN,
      vedi `docs/DECISIONS.md`; bloccante per store release).
- [ ] Prodotti billing di produzione configurati e mappati (RevenueCat).
- [ ] Contatto di supporto attivo e pubblicato.
- [ ] Budget alerts provider + spending/concurrency limits Vercel configurati
      (sostituiscono max-instances, Amendment V1.1).
- [ ] Crash/error monitoring attivo (Sentry o equivalente, wrapper provider-agnostic,
      nessun raw media nei log).
- [ ] Flusso delete/export verificato end-to-end su staging.
- [ ] Kill switch e rollback Vercel **testati** (richiesto per G9, sez. 30; procedure
      in `docs/RUNBOOK.md`).
- [ ] EAS Build/Submit pronto; staged rollout configurato dove supportato (sez. 28.3).

## E. Evidenze allegate

| Evidenza | Riferimento (link/commit/report) |
| --- | --- |
| CI run verde | |
| Report RLS/security test | |
| OpenAPI diff (o assenza drift) | |
| Smoke test provider con budget cap | |
| Privacy E2E (export/delete) | |
| Test acquisto sandbox iOS/Android | |
| Drill kill switch / rollback | |

## Firma

| Ruolo | Nome | Firma | Data |
| --- | --- | --- | --- |
| Engineering lead | | | |
| QA/Security (workstream J) | | | |
| Product Owner | | | |

> G8 richiede checklist firmata e zero blocker P0/P1 (sez. 30). G9 (public V1)
> richiede inoltre monitoring attivo, spend alerts e rollback/kill-switch testati.
