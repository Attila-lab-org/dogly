# DOGly Consumer Intelligence Contract

## Promessa

DOGly aiuta il proprietario a capire meglio il proprio cane. Ogni analisi deve
rispondere, in questo ordine:

1. **Cosa ho osservato**
2. **Cosa può significare per questo cane**
3. **Se è in linea con il suo solito o rappresenta un cambiamento**
4. **Cosa fare adesso**

Il risultato non è un referto e non è una conversazione con un modello
generico. È una decisione DOGly, costruita da osservazioni, storia personale,
contesto confermato, conoscenza verificata e regole di sicurezza.

## Regole del risultato

- Una headline, massimo due frasi di sintesi e una sola azione principale.
- Prima l'utilità; dettagli, fonti e limiti restano disponibili in secondo piano.
- `Osservato`, `Raccontato` e `Imparato nel tempo` non vengono mai confusi.
- Un'ipotesi non diventa una causa. Una coincidenza non diventa una diagnosi.
- Se manca un dato che cambierebbe la decisione, DOGly fa una sola domanda.
- Se il dato non cambierebbe la decisione, DOGly non interroga il proprietario.
- Una safety rilevante è sempre visibile e non può essere ridotta dal modello.
- “Tutto regolare” descrive la lettura di oggi; “come al solito” richiede una
  baseline personale sufficiente.

## Foto delle feci

Il proprietario vuole sapere:

- come appaiono oggi le feci;
- se la foto mostra qualcosa di insolito;
- se sono diverse dal solito del suo cane;
- se il cambiamento si sta ripetendo;
- se coincide con alimentazione, quantità, extra, farmaci o cambi recenti;
- quali segnali osservare nelle ore successive;
- quando è prudente sentire il veterinario.

DOGly può proporre: `mantieni`, `monitora`, `rispondi a una domanda`,
`completa/verifica l'alimentazione`, `parlane con il veterinario`.

DOGly non aumenta o diminuisce grammi da una foto. Un'indicazione sulla quantità
richiede almeno alimento e quantità verificati, peso e andamento recenti, e deve
restare coerente con etichetta e indicazione professionale.

## Video comportamentali

Il proprietario vuole sapere:

- quali segnali DOGly ha visto e sentito;
- quale lettura è più plausibile in quella situazione;
- se esistono alternative importanti;
- se quel comportamento è abituale per il suo cane;
- come rispondere senza aumentare disagio o rischio;
- cosa osservare se si ripete;
- quando chiedere supporto professionale.

Le azioni devono essere quotidiane e concrete: dare spazio, ridurre uno stimolo,
proporre interazione o attività, interrompere una situazione, osservare,
raccogliere un nuovo video o contattare un professionista.

## Stati consumer comuni

- **Regolare** — nessun segnale che richieda attenzione nella lettura disponibile.
- **Da seguire** — cambiamento non urgente da osservare o confrontare.
- **Serve un dettaglio** — una risposta del proprietario può cambiare la lettura.
- **Attenzione** — segnale che richiede una gestione più prudente.
- **Supporto professionale** — è opportuno contattare veterinario o professionista.

## Criterio di qualità

Due cani con foto o video simili possono ricevere risultati diversi soltanto se
profilo, situazione, sintomi o storia personale giustificano la differenza.
Due risultati diversi devono poter essere spiegati con fatti visibili o dati
confermati. Se DOGly non può spiegare la differenza, non deve inventarla.


## Canine Intelligence condivisa

Il proprietario parla con DOGly, non con modelli di dominio separati. Dietro le
quinte:

1. **Reasoner centrale** — il modello genera, confronta e sceglie ipotesi usando
   conoscenza canina generale, scienza, storia personale, contesto, evidenza e
   sequenza temporale. La tassonomia descrive il risultato: non limita il
   pensiero.
2. **Realtà in ingresso** — Observer, proprietario e memoria hanno provenance
   distinta. Un controllo di grounding impedisce di presentare come visto o
   ricordato ciò che non è disponibile.
3. **Forza dei claim** — i registry distinguono `SUPPORTED`,
   `PARTIALLY_SUPPORTED`, `NOT_COVERED`, `CONTRADICTED` e `FORBIDDEN`.
   `NOT_COVERED` non significa falso e l'overlap lessicale resta solo audit.
4. **Safety di confine** — interviene soltanto quando cambia davvero l'azione,
   senza rifare l'interpretazione comportamentale o sostituire una risposta
   contestuale con un fallback generico.
5. **Memoria rigorosa** — rispondere e imparare sono soglie diverse. I pattern
   richiedono episodi indipendenti, ricorrenza e conferma; un refinement
   sostituisce la firma precedente dell'evento.

Il percorso è: evidenza → Reasoner → pochi guardrail di confine → risposta.
Le etichette consumer restano osservato / raccontato / imparato. Una coincidenza
temporale cibo-feci non viene presentata come causa.
