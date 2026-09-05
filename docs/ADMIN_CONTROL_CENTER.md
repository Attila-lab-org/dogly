# Dogly Admin Control Center

Console web interna per governare business, utenti, AI, costi e privacy di Dogly.
Codice: `apps/admin/` (Next.js 15 + TypeScript + npm, standalone — vedi ADR-011 in
`docs/DECISIONS.md`).

## Fonte

- Spec esterna: **Canine_Intelligence_Admin_Control_Center_Enterprise_UX_Spec_V1.docx**
  (documento prodotto, fuori repo).
- North star: in **<10 secondi** l'admin capisce — funziona? quanto uso? quanto costa?
  quanto rende? l'AI lavora bene?

## Route map (V0.1 — italiano, semplificata per volontà del PO)

> Nota: dalla V0.1 l'interfaccia è interamente in italiano e con linguaggio
> semplice (niente sigle tipo MAU/MRR/P95), per decisione del Product Owner.
> Le vecchie aree "AI & Models" e "Operations" confluiscono in "Sistema";
> "Personal Intelligence" resta come contenuto nel dettaglio evento, non come voce.

| Route | Area | V0.1 |
| --- | --- | --- |
| `/login` | Accesso (auth visuale demo) | ✅ |
| `/` | Panoramica (banner stato, KPI semplici, "Da gestire") | ✅ |
| `/segnalazioni`, `/segnalazioni/[id]` | Segnalazioni utenti (cuore della gestione quotidiana) | ✅ |
| `/users`, `/users/[id]` | Utenti e Cani (scheda cliente) | ✅ |
| `/behavior`, `/behavior/[id]` | Comportamento | ✅ |
| `/digestive` | Digestione | placeholder |
| `/costi` | Costi | placeholder |
| `/privacy` | Privacy | placeholder |
| `/sistema` | Sistema (servizi, coda lavori, errori) | ✅ |
| `/audit` | Registro attività (append-only) | skeleton ✅ |

## Fasi

- **V0 — Foundation (fatto):** auth visuale, shell (sidebar + topbar + search),
  Panoramica, Utenti e Cani, Comportamento list+detail, Registro attività skeleton,
  mock read-model.
- **V0.1 — Semplificazione (fatto):** UI interamente in italiano, linguaggio
  semplice senza sigle, nuova area Segnalazioni al centro della gestione
  quotidiana, Panoramica ridotta (banner stato + "Da gestire" + un solo grafico),
  area Sistema che unisce AI & Models e Operations.
- **V1 — Intelligence Ops:** Digestive, Personal Intelligence, AI & Models con dati
  reali via `/v1/admin/*`, RBAC attivo.
- **V1.1 — Cost & Reliability:** Costs, Operations, alerting e anomaly detection.
- **V1.2 — Privacy:** console Privacy completa (export/delete, retention, consensi).
- **V2 — Optimization:** azioni correttive guidate, automazioni, eval continui.

## Ruoli RBAC previsti (6)

1. **Super Admin** — accesso completo, gestione ruoli.
2. **Privacy Admin** — export/delete, accesso media raw autorizzato, retention.
3. **AI Reviewer** — trace, annotazioni esperto, qualità modelli.
4. **Support Agent** — Customer 360 in sola lettura, ticket, nessun media raw.
5. **Finance Analyst** — costi, budget, report MRR/conversion.
6. **Read-only Auditor** — sola consultazione di audit log e report.

## Security boundary

- **Nessuna service-key nel browser:** il frontend usa solo chiavi publishable e
  token di sessione con claim di ruolo.
- **Azioni privilegiate server-side:** export, delete, apertura media raw e ogni
  scrittura passano da endpoint `/v1/admin/*` con verifica RBAC lato server.
- **Audit append-only:** ogni azione privilegiata (lettura media inclusa) scrive
  una riga immutabile con actor, ruolo, target, motivazione ed esito.
- **Privacy by design:** media sfocati di default, dati minimizzati, email
  mascherate nelle liste, retention automatica visibile nel dettaglio evento.
- Nessuna modifica al backend consumer in V0: i dati sono mock tipizzati
  (`apps/admin/lib/data.ts`) con shape pronte per il read-model dedicato.
