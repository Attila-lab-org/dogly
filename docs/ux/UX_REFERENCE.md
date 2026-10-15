# UX Reference — Dogly V1

Fonte visuale vincolante per la direzione grafica: **mock Oreo a 10 schermi**
(ADR-017), insieme alla Spec V1 sez. 5–7 per struttura/contenuti e alle
decisioni prodotto approvate (brand **Dogly**, album privati, confidenza a
bande).

In caso di conflitto tra mockup Rocky storici (HIGGS/ChatGPT con “CAPISCI
ROCKY”, audio+video come modalità equivalenti, confidenza “87%”) e
decisioni vigenti, **vincono ADR-017 + Spec** (O-07: niente percentuali di
confidenza → Low/Medium/High). Web e app nativa devono restare lo stesso
prodotto (`docs/PRODUCT_PARITY.md`).

## Decisioni UX V1 (approvate)

| Tema | Decisione |
| --- | --- |
| Brand | **Dogly** (non CANINE / CBI in UI) |
| Tab | **4:** Home / Diario / {Nome cane} / Social (storie Momenti + luoghi utili) — ADR-017 |
| Confidenza AI | Solo bande bassa/media/alta |
| Knowledge Score | Indicatori di ricchezza dati; niente % di confidenza AI |
| Raw video analisi | TTL **24h** dal completamento; non entra in album |
| Album | Privati di default; condivisione esterna via share sheet OS |
| Momenti vs chat | Album Momenti = solo foto del cane; allegati Ask (es. digestione) restano fuori dai Momenti |
| Profilo pubblico | Opt-in esplicito |
| Home | Conversazione in primo piano + accessi rapidi + momenti recenti (mock Oreo) |
| Routine giornata | Timeline oraria del mock = **in scope** (`/dogs/{id}/routine` + `dog_daily_activities`) |
| Digestione / nutrizione | In V1, wording osservativo |
| Dogly Signals | Posticipato; nessun ingresso visibile nella UX corrente |
| Storie | Shipping v1: Momenti-as-stories (UX Instagram, niente TTL 24h); feed multi-cane/follow post-V1 |
| Admin | Post-V1 (demo distinta da produzione) |

## Design language

- Sfondo chiaro (quasi bianco, tinta fredda, `#F4F7FB`).
- Card bianche con radius grande (16–24px) e ombre morbide.
- Palette prodotto: blu primario `#2563EB`, accento teal `#14B8A6`, testo navy `#0E2A47`.
- Icone outline tondeggianti (teal). Tab attivo blu.
- Icone: set custom disegnato `CuteIcon` (`src/components/CuteIcon.tsx`, SVG due toni
  teal/navy) per evidence semantiche e hero risultato per-intent; Ionicons resta
  per le icone funzionali (tab, azioni, sistema).
- Logo Dogly: splash / app icon / welcome / sign-in; in Home ammesso come badge
  bianco nell'header accanto al saluto (decisione PO 2026-09-05); non ripetuto in
  modal check-in o risultato.
- Slogan di brand: "Il tuo cane, finalmente capito." — header Home e welcome.
- Token unici in `apps/mobile/src/theme/tokens.ts`.
- Brand board di riferimento: `docs/ux/brand-dogly-board.jpg` (identità, non layout quotidiano).
- **Il protagonista è il tuo cane** (regola di coerenza, PO 2026-10-16): in app e nei
  giochi il cane che agisce, reagisce o commenta è sempre la foto del cane
  dell'utente — `AvatarActor` (`src/features/core/AvatarActor.tsx`) applica le
  coreografie delle espressioni (happy/celebrate/sad/focused/neutral) alla foto;
  mai personaggi surrogati (mascotte esterne o altri cani illustrati) al posto suo.
- **Le illustrazioni sono scenografia**: lo stile duotone teal/navy (CuteIcon,
  TummyBuddy, creature e tessere dei giochi, empty state) decora il mondo, non
  interpreta il cane. Vietato introdurre nuovi personaggi/mascotte senza
  aggiornare prima questa regola.

## Mappa schermate V1

| Area | Route | Note |
| --- | --- | --- |
| Welcome / Sign-in | `(auth)/welcome`, `(auth)/sign-in` | Privacy summary + auth |
| Onboarding | `onboarding/dog` | Nome, meta, foto opzionale |
| Home | `(tabs)/home` | Conversazione + accessi rapidi; shortcut a Social |
| Social | `(tabs)/social` | Rail storie (Momenti) + luoghi utili sotto |
| Story viewer | `story/viewer` | Fullscreen Instagram: progress, tap L/R, hold pause |
| Diario | `(tabs)/diary`, `diary/event/[id]` | Behavior + digestione; accesso dall’icona Home |
| Profilo | `(tabs)/rocky` (titolo dinamico) | Hub cane + album preview |
| Edit profilo | `dogs/[dogId]/edit` | Modifica meta e avatar |
| Knowledge | `dogs/[dogId]/knowledge` | Dettaglio copertura |
| Album | `dogs/[dogId]/album/*` | Lista, griglia, viewer, create |
| Dogly Signals | `signals/*` | Sospeso; route reindirizzate alla Home |
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

- Header: badge logo Dogly; campana e accesso Diario a destra.
- Hero vivente in cima ("il cane ti parla"): fumetto in prima persona con il
  saluto integrato, altrimenti — solo con dati reali — promemoria agenda entro
  7 giorni, abitudine recente o controllo digestione da rifare; sfondo con
  gradiente legato al momento della giornata; nessuna animazione con
  riduzione del movimento attiva.
- Storie Instagram: tab **Social** (Momenti-as-stories + luoghi utili).
- Dog card senza Knowledge Score.
- Nessun check-in fisso in pagina.
- Nessun modal di check-in all’apertura.
- CTA “SCOPRI I SEGNALI DI {NOME}”, digestione, ultima analisi, quota.
- Dogly Signals non compare nella Home finché il servizio è sospeso.
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
2. Una domanda; se “non come al solito” → invita ad aprire la chat (video o digestione).
3. Nessun ingresso diretto a capture/result: la lettura nasce in conversazione.

## Media chat-first (decisione 2026-10-15)

Video e digestione **non** sono analisi secche con schermata risultato come fine esperienza.

1. **Ingresso** — solo da Ask (CTA «Carica un video» / «Carica una foto»).
   Capture e fotocamera digestiva restano passaggi tecnici, non destinazioni prodotto.
   Landing «Controllo digestione» con tips → redirect ad Ask.
2. **Durante** — processing breve, poi ritorno in Ask.
3. **Lettura** — in chat, conversazionale: si discute il momento, non un referto.
4. **Diario** — cronologia wow: titolo leggero + **una frase** di riassunto.
   Tap sulla card → Ask sull’episodio (`intent=revisit`), non result screen.
5. Home insights e notifiche «risultato pronto» → stesso handoff Ask.
6. Live resta voce; se serve video/foto, invita Ask Testo.

Pipeline AI invariata (Gemini observer + reasoner / digestive vision).
Cambia solo **dove** l’umano vive la lettura.

## Risultato — esperienza AI (aggiornato)

DOGly ragiona in profondità e parla come amica esperta che vuole bene al cane.
La lettura primaria è **in Ask**. Il Diario conserva memoria, non ripete il referto.

In chat, dopo un media:
1. Interpretazione immediata e naturale («Oreo ti sta cercando nel gioco»).
2. Se serve, una sola domanda che cambia la lettura.
3. Sicurezza sempre in cima quando c’è urgenza.
4. Sugli abbai: traduttrice realista; sul resto: tono caldo da amica.

Nel Diario:
- Headline consumer + snippet corto (niente jargon, niente pappardella).
- Tap = continua la conversazione su quel momento.

La chat Ask conosce già i cani; noi diamo il dossier di questo cane più situazione.
Azioni soft opzionali (ricorda, Momenti, alimento) con conferma umana.
Niente finta osservazione video in diretta in Live.

## Profilo / Album

- Pagina personale e visiva: header gradiente, avatar editabile e meta dinamiche.
- Azioni rapide: Storia, Album, Diario.
- “I suoi momenti”: preview fotografica + Vedi tutti, senza testo esplicativo.
- Benessere: stato sintetico di digestione, alimentazione, agenda e Signals.
- Niente Knowledge Score, stati frequenti, pattern o policy nella pagina principale.

## Dogly Signals

> **POSTICIPATO:** nessun ingresso in Home o Profilo; deep link disattivati.
> Questa sezione conserva soltanto il riferimento per una futura rivalutazione.

- Promessa: conoscere il modo in cui il cane risponde a segnali sonori
  selezionati. Non tradurre abbai in parole e non promettere obbedienza.
- Sequenza device: camera preview → baseline 3 s → riproduzione automatica
  una volta (massimo 2,5 s) → osservazione 5 s.
- Il proprietario tocca “Ha reagito” per misurare la latenza e seleziona solo
  comportamenti chiaramente visibili. Il risultato non è precompilato.
- Il breve video di supporto resta nella cache durante la sequenza e viene
  eliminato alla fine; il backend salva solo osservazione e latenza.
- Categorie V1: attenzione, gioco, contatto, curiosità. Tenere fuori disagio,
  minaccia e segnali agonistici.
- Flusso: invito → inquadratura → osservazione prima → segnale → osservazione
  dopo → risultato osservabile → feedback Sì / No / Non saprei.
- Risultati: “Rocky ha girato la testa e alzato le orecchie”, non “questo
  significa vieni”.
- Mappa personale nel profilo: stati “Da scoprire”, “Sto imparando”,
  “Ricorrente”; conteggi e ultimo riassunto per categoria.

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

## Ask Live — Voce (in shipping)

> Conversazione realtime a voce. Costa crediti/minuti. Non è dettatura.
> Coerente con Hero Home: atmosfera chiara, respiro, presenza — mai orb dark/purple.
> Route: `/ask/live`. Preferenza voce M/F in Profilo (`ask_voice_gender` → marin/cedar).

### Posizionamento

| Modalità | Ruolo | Dove |
| --- | --- | --- |
| **Testo** | Scrivere, foto, video, detta | `/ask` composer |
| **Dettatura** | Trascrive nel campo | mic nel composer |
| **Voce (Live)** | Conversazione realtime a minuti | `/ask/live` stanza dedicata |

Live non è un quinto bottone nel composer. È **un’altra stanza** di “Parla con DOGly”.

### Come ci arrivano (scoperta premium)

1. **Primario** — in header Ask, segmented `Testo · Voce`. Toccare Voce = ingresso rituale.
2. **Scoperta** — chat vuota: una sola card “Preferisci parlare? Hai X min.” + CTA.
3. **Contestuale** — dopo una risposta densa, invito soft una volta/sessione: “Continuiamo a voce?”.

Copy consumer: **Voce** / **Parla**, non “Live” / “GPT”.

### Rituale di ingresso (i crediti devono sentirsi preziosi)

1. Switch Voce → breve gate (≈800–1200 ms), non paywall grezzo.
2. Centro: avatar di `{nome}` che **cresce** (shared-element feel) e diventa presenza.
3. Sotto: `Hai 4:00 · Si consumano solo mentre parli`.
4. CTA unica: **Inizia**. Annulla torna a Testo senza addebito.
5. Al tap: wash atmosferico (stessa famiglia del DogHero: cielo soft, drift lento) + haptic leggero → stanza Live.

Se minuti = 0: stesso gate, CTA diventa **Ottieni minuti** → paywall. Nessun errore tecnico in faccia.

### Stanza Live (una composizione, non una dashboard)

Primo viewport solo:

- presenza centrale (avatar + alone respirante)
- una riga di stato (“Ti ascolto” / “DOGly parla” / “Un attimo…”)
- anello minuti in alto (elegante, non countdown da timer da cucina)
- un controllo: **Termina**

Niente transcript a schermo pieno, niente chat sotto, niente chip promo, niente secondi decimali.

### Sistema motion (wow coerente, non rumore)

Stessa grammatica di `DogHero` (Reanimated, reduce-motion rispettato):

| Stato | Motion |
| --- | --- |
| Idle connesso | Alone teal/blu che respira (scale 1 → 1.04, ~1.4 s) |
| Utente parla | Anelli concentrici morbidi legati al livello audio (ampiezza clampata) |
| DOGly parla | Alone primario più ampio + leggero drift dell’avatar (come Hero) |
| Pensiero / rete | Tre punti soft sotto lo stato (stesso thinking del Hero) |
| Ultimi 30 s | Anello minuti passa soft da primary → warning; copy “Quasi finiti” una sola volta |
| Termina | Dissolve della presenza → ritorno Ask con card riassunto che entra in FadeInUp |

Vietato: glow viola, particelle infinite, Lottie generiche “AI orb”, dark full-screen, badge flottanti sui minuti.

### Crediti — UX onesta (ADR-005 spirit)

- Reserve all’**Inizia**, commit per secondi usati, refund se fallisce prima dell’audio.
- Il consumo è visibile solo come anello + `m:ss` discreto — non un ticker aggressivo.
- A esaurimento: fade out audio, messaggio caldo “I minuti di oggi sono finiti”, CTA **Ottieni minuti** o **Torna alla chat**.
- Mai addebitare in background se l’utente ha lasciato l’app senza sessione attiva (lifecycle esplicito).

### Uscita premium

1. Termina → conferma soft solo se >15 s parlati (“Chiudere la conversazione?”).
2. Rientro in Ask in modalità Testo.
3. Una bubble sistema: *“Abbiamo parlato di {tema breve}. Vuoi che me lo ricordi?”* + azioni soft già previste da Ask.
4. Nessun dump di transcript grezzo; eventuale dettaglio in “Perché?” / memoria solo su conferma.

### Accessibilità

- `reduce-motion`: presenza statica, stati solo testuali, niente anelli audio.
- Tutti gli stati annunciati a VoiceOver/TalkBack.
- Termina sempre raggiungibile, area touch ≥44 pt.

### Abbai in Live (onesto)

- Sì: lettura del momento in «parole umane» da contesto + tono + storia del cane.
- No: dizionario universale abbaio→frase, né finta udizione video in diretta.
- Se serve più certezza: invita un video breve in chat Testo (pipeline behavior).

### Fuori scope di questa direzione

- Traduttore letterale realtime degli abbai, analisi video embedded in Live, Signals.
- Live come tab propria o ingresso Home permanente.

## Riconciliazione mockup HIGGS

- Tenere layout onboarding, home evoluta, result, pattern, settings.
- Rifare feed camera (07–09, 13, 15) con scene autentiche.
- Rebrand splash/welcome a Dogly.
- Correggere razza/foto coerenti (Golden Retriever ≠ Labrador nei asset storici).
