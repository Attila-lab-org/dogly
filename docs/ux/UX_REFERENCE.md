# UX Reference — Dogly V1

Fonte visuale vincolante per la direzione grafica, insieme alla Spec V1 sez. 5–7
per struttura/contenuti e alle decisioni prodotto approvate (brand **Dogly**,
album privati, messaggio quotidiano interattivo, confidenza a bande).

In caso di conflitto tra mockup storici HIGGS/ChatGPT e Spec/decisioni V1,
**vincono Spec + decisioni** (es. confidenza: mockup HIGGS mostrava "87%" ma
O-07 vieta percentuali → usare Low/Medium/High mantenendo lo stile pill).

## Decisioni UX V1 (approvate)

| Tema | Decisione |
| --- | --- |
| Brand | **Dogly** (non CANINE / CBI in UI) |
| Tab | Max 3: Home / Fotocamera / {Nome cane}; Diario dalla Home |
| Confidenza AI | Solo bande bassa/media/alta |
| Knowledge Score | % prodotto ammessa (sez. 18), formula versionata |
| Raw video analisi | TTL **24h** dal completamento; non entra in album |
| Album | Privati di default; condivisione esterna via share sheet OS |
| Profilo pubblico | Opt-in esplicito |
| Messaggio quotidiano | Non in Home. Eventuale tono “voce cane” solo come output di un’analisi, non card giornaliera |
| Daily Check-in | Modal all’apertura (poi sparisce): “Come ti sembra {nome}?” → Sereno / Non come al solito → CTA video o digestione. Contesto passato all’analisi |
| Digestione / nutrizione | In V1, wording osservativo |
| Storie | Cerchi in Home; foto da fotocamera/galleria; viewer sequenziale; durata 24h |
| Admin | Post-V1 |

## Design language

- Sfondo chiaro (quasi bianco, tinta fredda, `#F4F7FB`).
- Card bianche con radius grande (16–24px) e ombre morbide.
- Palette prodotto: blu primario `#2563EB`, accento teal `#14B8A6`, testo navy `#0E2A47`.
- Icone outline tondeggianti (teal). Tab attivo blu.
- Logo Dogly: splash / app icon / welcome auth — non ripetuto in Home, modal check-in o risultato.
- Token unici in `apps/mobile/src/theme/tokens.ts`.
- Brand board di riferimento: `docs/ux/brand-dogly-board.jpg` (identità, non layout quotidiano).

## Mappa schermate V1

| Area | Route | Note |
| --- | --- | --- |
| Welcome / Sign-in | `(auth)/welcome`, `(auth)/sign-in` | Privacy summary + auth |
| Onboarding | `onboarding/dog` | Nome, meta, foto opzionale |
| Home | `(tabs)/home` | Storie, modal check-in all’apertura, CTA Capisci, ultima analisi |
| Fotocamera | `(tabs)/camera` | Crea una storia da fotocamera o galleria |
| Storie | `stories/[storyId]` | Viewer sequenziale, tap sinistra/destra |
| Diario | `(tabs)/diary`, `diary/event/[id]` | Behavior + digestione; accesso dall’icona Home |
| Profilo | `(tabs)/rocky` (titolo dinamico) | Hub cane + album preview |
| Edit profilo | `dogs/[dogId]/edit` | Modifica meta e avatar |
| Knowledge | `dogs/[dogId]/knowledge` | Dettaglio copertura |
| Album | `dogs/[dogId]/album/*` | Lista, griglia, viewer, create |
| Capture / result | `behavior/*` | State machine + band + feedback |
| Digestive / nutrition | `digestive/*`, `nutrition/*` | Secondario |
| Agenda salute | `care/*` | Vaccini, visite e promemoria del cane |
| Settings | `settings/*`, `paywall` | Privacy 24h, export, billing |

## Profilazione

- Razza selezionata da un catalogo locale ricercabile, disponibile anche offline.
- “Non lo so” e “È un mix” sono scelte esplicite e amichevoli.
- La stessa selezione viene riutilizzata nella modifica del profilo.
- Età selezionata da menu, mai inserita come testo libero.
- Compleanno facoltativo tramite calendario; se presente aggiorna l’età
  automaticamente e abilita gli auguri nella Home.

## Home

- Header: saluto + campana.
- Riga Storie orizzontale + aggiunta rapida.
- Dog card senza Knowledge Score.
- Nessun check-in fisso in pagina.
- All’apertura: modal tenero (scodinzolio) che sparisce dopo la risposta.
- CTA "CAPISCI {NOME}", digestione, ultima analisi, quota.
- Il prossimo appuntamento compare solo nei sette giorni precedenti, senza
  trasformare l'Agenda in una quarta tab.

## Agenda salute

- Punto di accesso principale: Profilo del cane → Benessere → Agenda.
- La schermata apre con il prossimo appuntamento, poi eventi futuri e storico.
- Tipi preselezionati: vaccino, visita, antiparassitario, controllo, terapia,
  altro. Ogni tipo propone anche un titolo modificabile.
- Nel nuovo promemoria sono già selezionati: visita veterinaria, domani alle
  10:00 e avviso un giorno prima.
- Luogo e nota restano facoltativi e chiusi finché l'utente non li richiede.
- Salvare il primo promemoria è il momento contestuale in cui chiedere il
  permesso notifiche del sistema operativo.
- Un appuntamento può essere segnato come fatto o eliminato; entrambe le
  azioni aggiornano o cancellano il promemoria locale.
- La campanella Home apre il centro notifiche. Le preferenze vivono in
  Impostazioni → Notifiche e ogni switch salva immediatamente.

## Daily Check-in (principi)

1. Solo modal all’apertura, non un blocco in Home.
2. Una domanda; se “non come al solito” → offerta video o digestione.
3. L’analisi eredita il motivo (feed personalizzato, tono premuroso).
4. Risultato: headline + band + perché (evidence) + feedback tre vie — come Spec/UX_REFERENCE.

## Risultato

- Headline probabilistica ("sembra / probabilmente").
- Pill confidenza a **band** (mai %).
- Evidence 3–5, alternative 0–2.
- Feedback a tre vie; "Non lo so" senza penalità.
- Condividi card sanitizzata (niente raw video).

## Profilo / Album

- Pagina personale e visiva: header gradiente, avatar editabile e meta dinamiche.
- Azioni rapide: Storia, Album, Diario.
- “I suoi momenti”: preview fotografica + Vedi tutti, senza testo esplicativo.
- Benessere: stato sintetico di digestione e alimentazione.
- Niente Knowledge Score, stati frequenti, pattern o policy nella pagina principale.

## Digestione

- Capture fotografica reale con anteprima; suggerimenti brevi su luce e inquadratura.
- Processing essenziale: un solo stato corrente e avanzamento visivo.
- Risultato leggibile a colpo d’occhio: stato generale, confronto personale,
  consistenza, colore e stima visiva.
- Mostrare soltanto i candidati da osservare; non elencare una serie di
  “non osservato”.
- Safety flag sempre prioritari e deterministici.
- Disclaimer medico breve; dettagli legali e policy fuori dal flusso principale.

## Media: tre categorie separate

1. **Raw analisi** — TTL 24h dal completamento, non condivisibile, non in album.
2. **Album personale** — persistente, scelto dall'utente.
3. **Storia** — foto separata dall’album, visibile per 24h.
4. **Card share** — sanitizzata per share sheet OS (niente URL bucket permanenti).

## Post-V1 (documentato, non implementato)

- Reazioni alle storie e feed multiutente.
- Console admin (eventi, audit, privacy, costi, moderazione).

## Riconciliazione mockup HIGGS

- Tenere layout onboarding, home evoluta, result, pattern, settings.
- Rifare feed camera (07–09, 13, 15) con scene autentiche.
- Rebrand splash/welcome a Dogly.
- Correggere razza/foto coerenti (Golden Retriever ≠ Labrador nei asset storici).
