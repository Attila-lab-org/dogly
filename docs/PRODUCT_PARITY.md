# Product parity — un solo Dogly

**ADR:** ADR-017 in `docs/DECISIONS.md`.

## Regola

`apps/mobile` e `apps/mobile-web` espongono lo **stesso prodotto**.
L’utente non deve notare differenze di schermate, copy o percorsi tra
telefono e browser.

Ammesse solo differenze di piattaforma (fotocamera, store, push, mic nativo).

## Ownership oggi

Finché non esiste un package condiviso unico:

1. La **fonte UI** per le schermate consumer allineate al mock Oreo è
   `apps/mobile-web` (parity raggiunta lì per prima).
2. Ogni modifica a una schermata nella lista sotto va **copiata**
   nell’altra app nella stessa PR/commit.
3. La CI job `product-parity` fallisce se i file elencati divergono.

Obiettivo successivo: `packages/` (o una sola app Expo) con adapter
`.native.tsx` / `.web.tsx` — niente doppia ownership.

## File sotto gate di parity

Vedi `scripts/check-product-parity.mjs`.

Elenco corrente (percorsi relativi a `app/` o `src/` condivisi):

- `app/(tabs)/_layout.tsx`
- `app/(tabs)/home.tsx`
- `app/(tabs)/diary.tsx`
- `app/(tabs)/rocky.tsx`
- `app/(tabs)/around.tsx`
- `app/care/index.tsx`
- `app/digestive/index.tsx`
- `app/nutrition/foods/catalog.tsx`
- `app/nutrition/foods/index.tsx`
- `app/nutrition/foods/new.tsx`
- `app/dogs/[dogId]/memories.tsx`
- `app/dogs/[dogId]/routine.tsx`
- `src/features/home/HomeConversation.tsx`
- `src/features/home/api.ts`
- `src/features/dogs/DogCareOverview.tsx`
- `src/features/care/CareEventCard.tsx`
- `src/features/core/types.ts`
- `src/features/places/api.ts`
- `src/features/routine/api.ts`

## Scope prodotto (produzione 1)

| Area | Stato |
| --- | --- |
| Home conversazione + tile + momenti | In scope; parity obbligatoria |
| Diario | In scope (tag contestuali + filtro Routine) |
| Profilo / alimenti / digestione / agenda | In scope (catalogo, Scaduti, intro digestione) |
| Tab Cerca = momenti + luoghi utili | In scope (non social) |
| Routine giornata oraria | In scope (DB + API + UI) |
| Ricerca cani / social | **Post-P1** |
