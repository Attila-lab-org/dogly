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

Login reale via **Supabase Auth** (email/password) + cookie di sessione
server-side (`@supabase/ssr`). Solo le email in `ADMIN_ALLOWED_EMAILS` entrano.

1. Copia `.env.example` → `.env.local`
2. Imposta `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (stessi valori pubblici dell’app mobile)
3. Imposta `ADMIN_ALLOWED_EMAILS` (virgola) — fail-closed se vuoto
4. Crea l’utente in Supabase Dashboard → Authentication → Users
5. Su Vercel (`dogly-admin`): stesse env in Production/Preview

Per la panoramica live aggiungi anche `SUPABASE_SERVICE_ROLE_KEY` come variabile
server-only. La chiave viene letta esclusivamente dai Server Components per il
read model cross-user e non viene mai inviata al browser.

Mai mettere la service-role key nel frontend o in variabili `NEXT_PUBLIC_*`.

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
