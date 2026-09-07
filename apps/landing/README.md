# Dogly — Landing

Landing page pubblica di Dogly (marketing + CTA download sugli store). Next.js 15
(App Router, SSG), deploy come progetto Vercel separato (vedi `vercel.json`, come
`apps/admin/`).

## Comandi

```bash
npm install
npm run dev        # sviluppo su http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # build di produzione
```

## Aggiornare i link store

Gli href App Store / Google Play sono placeholder centralizzati in
`src/lib/storeLinks.ts` — aggiornarli lì prima del lancio pubblico.

## Asset

Gli screenshot in `public/screenshots/` derivano dai mockup ufficiali in
`docs/ux/` del repo principale.
