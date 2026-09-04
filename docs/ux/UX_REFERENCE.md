# UX Reference — Mockup ufficiale (fonte: condivisione ChatGPT "Mockup app italiano per Rocky")

Questo mockup è la **fonte visuale vincolante** per la direzione grafica, insieme alla Spec V1 sez. 5–7 per struttura/contenuti.
In caso di conflitto tra mockup e Spec V1, **vince la Spec V1** (es. confidenza: mockup mostra "87%" ma la spec O-07 vieta percentuali → usare band Low/Medium/High mantenendo lo stile pill del mockup).

## Design language osservato
- Sfondo chiaro (quasi bianco, tinta fredda leggera, es. #F4F7FB).
- Card bianche con radius grande (16–24px) e ombre morbide.
- Palette: blu primario (#2563EB-ish), gradiente blu→azzurro per CTA dominante, accento teal/cyan (#14B8A6-ish) per icone, progress bar e chip; testo navy scuro (#0E2A47-ish); grigi per testo secondario.
- Tipografia arrotondata e amichevole, pesi bold per titoli.
- Emoji ammessi nel copy conversazionale (es. "Ciao! 👋").
- Icone outline tondeggianti, colore teal.
- Tab bar bottom a 3 voci: Home / Diario / Rocky (icona zampa), voce attiva in blu.

## Schermata 1 — Home (`mockup-home.png`)
- Header: "Ciao! 👋" bold navy + sottotitolo grigio "Pronto a capire meglio Rocky?"; icona campana in alto a destra con badge rosso.
- Dog card bianca: foto circolare del cane a sinistra; a destra nome "Rocky" bold; cuore outline rosso in alto a destra; righe meta con icone teal: "4 anni", "Taglia media", "Labrador".
- Sezione Knowledge Score (dentro/sotto la dog card): "Quanto conosco Rocky" bold + percentuale teal a destra (38%); progress bar teal; caption grigia "Sto iniziando a conoscerlo...".
- CTA dominante: card con gradiente blu, titolo bianco uppercase "CAPISCI ROCKY", sottotitolo "Premi e analizza audio + video"; due grandi bottoni circolari bianchi affiancati con icone teal (microfono | videocamera), separati da divisore verticale sottile.
- Card "ultima analisi": icona smiley teal in cerchio, label piccola grigia "Ultima analisi", testo bold "sembra rilassato", timestamp "Oggi, 09:30", chevron a destra.
- Tab bar: Home (attivo, blu), Diario, Rocky.

## Schermata 2 — Risultato (`mockup-result.png`)
- Top bar: back chevron a sinistra, titolo centrato "Risultato".
- Illustrazione amichevole del cane che gioca (cerchio azzurro chiaro dietro).
- Headline bold navy su due righe: "Rocky sembra voler giocare" con piccoli segni teal decorativi.
- Pill di confidenza: sfondo azzurro chiaro, testo teal. **Spec V1: mostrare band (es. "Confidenza alta"), NON percentuale.**
- Sezione "Perché?" con 4 evidence rows in card grigio-chiarissimo: icona teal + testo (es. "Postura di gioco", "Coda rilassata", "Vocalizzazione breve", "Movimento verso di te"). Spec: 3–5 bullet con fonte tipizzata.
- Feedback a tre vie (one-tap), dall'alto: bottone primario blu pieno "Sì, è così" (pollice su); bottone rosso/corallo pieno "Non credo" (pollice giù); bottone neutro grigio chiaro "Non lo so" (icona aiuto). Nessuna penalità UX per "Non lo so".
- Bottone finale outline teal "Salva nel diario" (icona bookmark).

## Schermata 3 — Rocky / Profilo (`mockup-rocky.png`)
- Header con gradiente blu e foto circolare grande del cane con badge matita (edit); ingranaggio settings in alto a destra.
- Nome "Rocky" grande bold; riga meta con icone: "4 anni", "Taglia media", "Labrador".
- "Quanto conosco Rocky" + 67% + progress bar blu; caption "Stiamo costruendo un legame forte! 💙".
- Sezione "Pattern appresi" (icona lampadina): lista righe con icona, titolo pattern, chevron (es. "Guarda la porta prima di uscire", "La sera è più attivo").
- Sezione "Stati frequenti": chip colorate — "Relax" (verde), "Gioco" (blu), "Attenzione" (salmone).
- Tab bar bottom: Home / Diario / Rocky.

## Note di riconciliazione con Spec V1
- Confidenza: pill con band LOW/MEDIUM/HIGH (copy IT: "Confidenza bassa/media/alta"), mai % finché non calibrata (O-07).
- Wording risultati sempre probabilistico: "sembra / probabilmente / possibile".
- Il Knowledge Score % è un prodotto-score (sez. 18) ed è ammesso come numero (non è una confidenza AI).
- Diario e flussi digestivi non sono nel mockup: seguire Spec V1 sez. 5–6 mantenendo lo stesso design language.
