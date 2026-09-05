# Dogly Control Center (apps/admin)

Console web admin interna di Dogly — **V0 Foundation**.
Spec di riferimento e roadmap: [`docs/ADMIN_CONTROL_CENTER.md`](../../docs/ADMIN_CONTROL_CENTER.md).

## Stack

- Next.js 15 (App Router) + TypeScript, gestore pacchetti **npm**
- Componenti propri + `lucide-react` (icone) + `recharts` (grafici)
- CSS puro con design token in `app/globals.css` (niente Tailwind)
- Dati: mock tipizzati in `lib/data.ts` / `lib/types.ts`, pronti per essere
  sostituiti da fetch verso `/v1/admin/*` (vedi commento in `lib/data.ts`)

## Run

```bash
cd apps/admin
npm install
npm run dev      # http://localhost:3000 (redirect demo: /login -> /)
```

Build di produzione:

```bash
npm run build
npm start
```

## Autenticazione

V0: login puramente visuale — qualsiasi credenziale porta a `/`.
In V1 l'auth sarà Supabase: copia `.env.example` in `.env.local` e valorizza
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Nessun segreto reale va committato.

## Aree

Interfaccia interamente in italiano, linguaggio semplice (V0.1, richiesta del PO).

| Route | Area | Stato V0 |
| --- | --- | --- |
| `/login` | Accesso | Demo visuale |
| `/` | Panoramica | Banner stato, KPI semplici, "Da gestire", grafico 7 giorni, stato servizio e costi |
| `/segnalazioni`, `/segnalazioni/[id]` | Segnalazioni utenti | Lista con filtri + dettaglio con azioni demo |
| `/users`, `/users/[id]` | Utenti e Cani | Tabella + scheda cliente |
| `/behavior`, `/behavior/[id]` | Comportamento | Lista + dettaglio evento |
| `/sistema` | Sistema | Stato servizi, coda lavori, errori recenti |
| `/audit` | Registro attività | Skeleton con sample |
| `/digestive`, `/costi`, `/privacy` | — | Placeholder (prossime versioni) |
