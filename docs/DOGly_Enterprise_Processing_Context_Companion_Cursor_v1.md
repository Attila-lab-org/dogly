# DOGly — Enterprise Processing Context Companion
## Specifica implementativa pronta per Cursor

**Versione:** 1.0  
**Data:** 18 settembre 2026  
**Repository:** `Attila-lab-org/dogly`  
**Branch operativa:** `main`  
**Stato di partenza verificato:** `main` include il Conversation Layer owner-facing e il profilo proprietario/cane già collegato al contesto AI.

---

# 0. ISTRUZIONE OPERATIVA PER CURSOR

Leggi prima lo stato reale più recente di `main` e verifica i file/contratti citati in questo documento. **Non implementare a sentimento e non duplicare logiche già esistenti.**

Lavora direttamente su `main`, coerentemente con il workflow attuale del progetto.

Obiettivo di questo intervento: trasformare la schermata di attesa dell'analisi comportamentale in un **accompagnamento intelligente, semplice e veloce**, che mentre DOGly sta già analizzando il video raccoglie dal proprietario **massimo 3 informazioni contestuali ad alto valore**, tramite pulsanti, senza chat libera e senza rallentare o bloccare il motore.

Principi non negoziabili:

- l'analisi del video deve continuare in parallelo;
- le domande non devono bloccare la pipeline;
- massimo 3 domande durante il processing;
- una domanda alla volta;
- risposta solo tramite opzioni strutturate, niente testo libero in V1;
- sempre disponibile `Salta`;
- non chiedere dati già noti a DOGly;
- non chiedere ciò che il video può osservare direttamente quando la qualità è sufficiente;
- le risposte del proprietario sono sempre `OWNER_REPORTED`, mai trasformate in evidenza visiva;
- un video realmente insufficiente resta insufficiente: le risposte non devono “salvare” artificialmente un media non analizzabile;
- mantenere safety deterministica, Observer, evidence, Knowledge, memoria e Conversation Layer esistenti;
- nessun Live Audio in questo intervento;
- nessun nuovo LLM call solo per scegliere le domande;
- niente nuova dipendenza pesante;
- feature veloce, idempotente, osservabile e testata;
- UI mobile e mobile-web coerenti e allineate;
- se serve una migrazione Supabase, eseguirla tramite MCP mantenendo RLS, ownership e audit coerenti con il progetto.

Al termine: esegui test completi pertinenti, verifica OpenAPI se vengono modificati contratti/API, committa su `main` e riporta **SHA + file modificati + migrazioni + test eseguiti + eventuali limiti rimasti**.

---

# 1. OBIETTIVO DI PRODOTTO

Oggi la schermata di processing comunica correttamente che DOGly sta lavorando, ma è prevalentemente passiva.

Vogliamo mantenere chiaramente la sensazione:

> **“DOGly sta guardando Rocky adesso.”**

ma usare parte di quel tempo per raccogliere informazioni che il video **non può conoscere da solo**.

Il risultato desiderato è:

```text
VIDEO
  ↓
upload / queue
  ↓
DOGly inizia davvero a osservare
  ↓
PROCESSING CONTEXT COMPANION
2-3 domande brevi a tasti mentre l'analisi continua
  ↓
OWNER_REPORTED CONTEXT salvato sull'evento
  ↓
Observer termina
  ↓
Reasoner riceve:
- osservazioni video/audio
- profilo Rocky
- identità proprietario
- memoria personale eleggibile
- lifestyle / today vs usual / recent changes
- knowledge bounded
- risposte raccolte durante il processing
  ↓
RISULTATO NATURALE
  ↓
solo se resta una vera ambiguità:
max 1 domanda finale normalmente,
hard cap 2 conferme post-risultato per sessione
```

L'esperienza **non è un questionario** e **non è una chat**.

È DOGly che accompagna il proprietario mentre continua a lavorare.

---

# 2. COSA ESISTE GIÀ E VA RIUSATO

Prima di implementare, verificare su `main` i nomi reali e gli eventuali aggiornamenti.

La base già presente comprende:

- `BehaviorProcessingScreen` con polling dello stato;
- `ProcessingCompanion` con animazione e copy “Sto guardando [nome cane]…”;
- stati `QUEUED`, `OBSERVING`, `INTERPRETING`, ecc.;
- `ObservationContract` con `CaptureQuality`, `Scene`, `Body`, `HeadFace`, `Ears`, `Tail`, `Vocalization`, `Timeline`;
- `DogContextSnapshot` con identità, life stage, routine, `today_vs_usual`, `recent_changes`, preferenze, health context;
- `ContextBucket`: `HOME`, `OUTDOORS`, `WALK`, `PLAY`, `FEEDING`, `DOOR_EXIT`, `REST`, `STRANGER`, `OTHER_DOG`, `VEHICLE`, `HANDLING`, `UNKNOWN`;
- `InterpretationContract` con domanda contestuale finale;
- `postBehaviorContext()` e `/v1/behavior/events/{event_id}/context` per il refinement **post-interpretazione**;
- Conversation Layer che ripulisce il consumer copy e usa il nome del proprietario;
- safety deterministica pre-Reasoner;
- memoria personale e Knowledge V3 separati dall'Observer.

**Non usare l'attuale endpoint post-result come contenitore generico senza verificare la semantica.** Oggi rappresenta una risposta a una domanda prodotta dall'interpretazione. Il nuovo processing context è un concetto distinto e deve restare auditabile come tale.

---

# 3. PRINCIPIO FONDAMENTALE: COSA PUÒ E NON PUÒ RECUPERARE IL PROPRIETARIO

## 3.1 Video realmente compromesso — NON recuperabile con domande

Se il media non permette un'osservazione sufficientemente fondata, DOGly deve chiedere una nuova registrazione.

Esempi:

- cane quasi completamente fuori inquadratura;
- cane visibile per una frazione troppo bassa della clip;
- motion blur grave;
- luce insufficiente grave / controluce che elimina i segnali;
- soggetto troppo lontano;
- forte occlusione del corpo per tutta la sequenza;
- clip sotto la durata minima utile;
- registrazione corrotta/interrotta;
- ripresa di uno schermo quando compromette davvero il dettaglio;
- impossibilità di identificare in modo affidabile quale cane è il soggetto in una scena multi-cane.

**Regola:** owner context non può diventare un sostituto del video.

```text
OWNER_REPORTED != OBSERVATION
```

## 3.2 Video degradato ma utilizzabile — parzialmente compensabile

Esempi:

- audio assente o degradato;
- faccia non sempre visibile;
- coda non visibile;
- orecchie poco leggibili;
- trigger fuori campo;
- partner sociale fuori campo;
- scena parzialmente occlusa ma corpo/movimento ancora leggibili.

Qui DOGly può continuare, abbassando la forza dell'inferenza e usando contesto owner-reported quando pertinente.

## 3.3 Video tecnicamente buono ma contesto incompleto — massimo valore delle domande

È il caso più importante.

Il video può mostrare perfettamente:

- postura;
- movimento;
- rigidità;
- avvicinamento/allontanamento;
- direzione della testa;
- coda;
- orecchie;
- vocalizzazione;

ma non sapere:

- cosa è successo 10 secondi prima;
- chi/cosa c'è fuori campo;
- se l'altro cane è conosciuto;
- se Rocky è trattenuto al guinzaglio;
- se c'è una risorsa importante;
- se quel luogo è nuovo;
- se quel comportamento è normale per Rocky;
- se oggi Rocky è diverso dal solito;
- se esiste un dolore/fastidio già noto dal proprietario.

Queste sono le informazioni che dobbiamo raccogliere.

---

# 4. PRIORITÀ DELLE INFORMAZIONI CONTESTUALI

Ordine di valore generale per il Behavior Reasoner:

1. **Cosa è successo immediatamente prima**
2. **Trigger/stimolo non visibile o ambiguo**
3. **Presenza e tipo di partner sociale**
4. **Familiarità con persona/cane/luogo**
5. **Possibilità di avvicinarsi o allontanarsi liberamente**
6. **Presenza di risorse: cibo, gioco, cuccia, oggetto**
7. **Interazione del proprietario: chiamata, contatto, handling, gioco**
8. **Situazione abituale vs insolita per Rocky**
9. **Comportamento già visto vs prima volta**
10. **Cambi recenti di routine/ambiente**
11. **Stato generale di oggi, solo se pertinente**
12. **Appetito, solo se può discriminare discomfort/stato fisico**
13. **Dolore/fastidio owner-reported, solo quando rilevante**
14. **Vocalizzazione riferita dal proprietario quando l'audio manca**

La temperatura/meteo **non è una domanda standard V1**. Va usata solo se già disponibile senza attrito o se un futuro planner ha un motivo concreto per ritenerla discriminante.

---

# 5. QUESTION BANK V1

Tutte le domande devono essere versionate con un `question_id` stabile. Le opzioni devono avere `answer_id` stabili. Il client non deve inviare testo arbitrario: invia gli ID e il server risolve la semantica canonica.

Le formulazioni sotto sono consumer copy di riferimento: possono essere adattate leggermente allo stile esistente, senza cambiarne il significato.

## Q01 — `before_moment`

**Domanda**  
`Cosa stava succedendo subito prima?`

**Risposte**

- `nothing_special` — `Niente di particolare`
- `interaction_play` — `Stavamo interagendo o giocando`
- `new_stimulus` — `È successo o comparso qualcosa`
- `not_sure` — `Non lo so`

**Valore:** altissimo.  
**Usare:** HOME, UNKNOWN, REST, OUTDOORS e quando non esiste già un contesto forte.

---

## Q02 — `other_dog_present`

**Domanda**  
`C'erano altri cani vicino a Rocky?`

**Risposte**

- `yes_close` — `Sì, vicini`
- `yes_distance` — `Sì, ma a distanza`
- `no` — `No`
- `not_sure` — `Non lo so`

**Usare:** WALK, OUTDOORS, OTHER_DOG, UNKNOWN.  
**Non usare:** se il contesto già conferma in modo affidabile la presenza/assenza di altri cani.

---

## Q03 — `target_known`

**Domanda**  
`Rocky conosceva già quella persona o quel cane?`

**Risposte**

- `yes` — `Sì`
- `no` — `No`
- `partly` — `Lo aveva già visto qualche volta`
- `not_sure` — `Non lo so`

**Usare:** STRANGER, OTHER_DOG, social context.

---

## Q04 — `freedom_to_move`

**Domanda**  
`Rocky poteva allontanarsi liberamente?`

**Risposte**

- `free` — `Sì`
- `leashed` — `Era al guinzaglio`
- `confined` — `Era trattenuto o in uno spazio chiuso`
- `not_sure` — `Non lo so`

**Valore:** altissimo per distinguere evitamento, frustrazione, tensione sociale e approccio forzato.

---

## Q05 — `outside_trigger`

**Domanda**  
`C'era qualcosa fuori dalla porta o dalla finestra?`

**Risposte**

- `person` — `Una persona`
- `dog` — `Un cane`
- `sound` — `Un rumore`
- `nothing_known` — `Niente che io abbia notato`

**Usare:** DOOR_EXIT, HOME con orientamento verso porta/finestra, vigilanza.

---

## Q06 — `resource_nearby`

**Domanda**  
`C'era qualcosa di importante per Rocky lì vicino?`

**Risposte**

- `food` — `Cibo`
- `toy_chew` — `Gioco o masticativo`
- `resting_place` — `Cuccia o posto dove riposa`
- `none` — `No`

**Usare:** FEEDING, RESOURCE-like situations, tensione vicino a oggetti/spazi.

---

## Q07 — `owner_interaction`

**Domanda**  
`Tu cosa stavi facendo con Rocky in quel momento?`

**Risposte**

- `playing` — `Stavamo giocando`
- `calling` — `Lo stavo chiamando`
- `touching_handling` — `Lo stavo toccando o gestendo`
- `nothing` — `Non stavo interagendo`

**Usare:** PLAY, HANDLING, ATTENTION-like situations.

---

## Q08 — `usual_situation`

**Domanda**  
`Per Rocky era una situazione normale?`

**Risposte**

- `usual` — `Sì, abituale`
- `unusual` — `No, insolita`
- `first_time` — `Era la prima volta`
- `not_sure` — `Non lo so`

**Valore:** altissimo per confronto con baseline personale.

---

## Q09 — `familiar_place`

**Domanda**  
`Rocky conosce già questo posto?`

**Risposte**

- `familiar` — `Sì, lo conosce bene`
- `somewhat` — `Ci è già stato qualche volta`
- `new` — `No, è nuovo`
- `not_sure` — `Non lo so`

**Usare:** OUTDOORS, WALK, VEHICLE, luogo nuovo.

---

## Q10 — `behavior_seen_before`

**Domanda**  
`Ti è già capitato di vedere Rocky fare così?`

**Risposte**

- `often` — `Sì, più volte`
- `sometimes` — `Qualche volta`
- `first_time` — `È la prima volta`
- `not_sure` — `Non ricordo`

**Non usare:** se la memoria personale DOGly ha già pattern eleggibili e sufficienti sullo stesso contesto.

---

## Q11 — `recent_change`

**Domanda**  
`È cambiato qualcosa per Rocky negli ultimi giorni?`

**Risposte**

- `people_animals` — `Persone o animali`
- `routine_place` — `Routine o ambiente`
- `other_change` — `Qualcos'altro`
- `no` — `No`

**Non usare:** se `recent_changes` contiene già una risposta recente e confermata pertinente.

---

## Q12 — `activity_today`

**Domanda**  
`Oggi Rocky è attivo come al solito?`

**Risposte**

- `usual` — `Sì`
- `less` — `Meno del solito`
- `more` — `Più del solito`
- `not_sure` — `Non lo so`

**Usare solo se:** il comportamento osservato può essere influenzato da stato generale/discomfort o il check-in segnala “non è come al solito”.

---

## Q13 — `appetite_today`

**Domanda**  
`Oggi ha mangiato come al solito?`

**Risposte**

- `usual` — `Sì`
- `less` — `Ha mangiato meno`
- `more` — `Ha mangiato più del solito`
- `not_yet_or_unsure` — `Non ancora / non lo so`

**Non è una domanda universale.**  
Usare solo quando può cambiare la lettura di discomfort, bassa attività o comportamento insolito.

---

## Q14 — `discomfort_today`

**Domanda**  
`Oggi hai notato qualche fastidio fisico in Rocky?`

**Risposte**

- `no` — `No`
- `possible` — `Forse sì`
- `known_issue` — `Sì, c'è già qualcosa che sto seguendo`
- `not_sure` — `Non lo so`

**Usare con prudenza:** handling, comportamento improvvisamente diverso, bassa attività, evitamento non abituale, health context pertinente.

Questa risposta resta owner-reported e **non costituisce diagnosi**.

---

## Q15 — `owner_heard_vocalization`

**Domanda**  
`Hai sentito Rocky vocalizzare in quel momento?`

**Risposte**

- `bark` — `Abbaiava`
- `growl` — `Ringhiava`
- `whine` — `Guaiava o piagnucolava`
- `none` — `No`

**Usare solo se:** `has_audio=false` oppure audio noto come non disponibile/degradato.

**Regola:** questa risposta non diventa `Vocalization` osservata; resta `OWNER_REPORTED`.

---

# 6. REGOLE DI SELEZIONE — NON FARE UN QUESTIONARIO STATICO

Creare un `ProcessingContextPlanner` deterministico e testabile.

Non serve un LLM.

Input minimo:

```text
event_id
dog_id
context_bucket
capture.has_audio
DogContextSnapshot
check-in / analysisContext se pertinente
eligible personal memory summaries
existing processing answers
opzionale: observation quality/unknowns se già disponibili senza attesa extra
```

## 6.1 Regola di eligibility

Una domanda può essere proposta solo se:

1. la risposta può materialmente cambiare o restringere l'interpretazione;
2. l'informazione non è già presente con provenance sufficiente;
3. non chiede al proprietario di “interpretare” il comportamento;
4. non chiede di stimare posture, coda, orecchie o emozioni;
5. esistono opzioni semplici e non ambigue;
6. non è già stata fatta nello stesso evento;
7. non supera il limite massimo di domande.

## 6.2 Priorità suggerita

Implementare un ranking semplice e leggibile, ad esempio:

```text
+3 può distinguere ipotesi principali
+2 forte match con context_bucket
+2 rilevanza safety/context
+1 informazione non disponibile nel video
+1 dato assente nello storico personale
-10 già noto/confermato
-5 domanda duplicata
-3 basso valore nel contesto corrente
```

Non serve necessariamente usare esattamente questi pesi; serve però una logica deterministica equivalente e coperta da test.

## 6.3 Limiti

- `MAX_PROCESSING_QUESTIONS = 3`
- una domanda visibile alla volta;
- nessuna domanda obbligatoria;
- `Salta` non è una risposta semantica: registra solo che la domanda è stata saltata oppure passa alla successiva senza creare un fatto;
- niente loop infinito;
- niente ripetizione della stessa domanda al rientro nell'app se già risposta/skippata.

---

# 7. MAPPING INIZIALE PER CONTEXT BUCKET

Questa matrice serve al planner, non alla UI.

```text
HOME
  before_moment
  usual_situation
  outside_trigger se pertinente

OUTDOORS
  familiar_place
  other_dog_present
  freedom_to_move

WALK
  other_dog_present
  target_known
  freedom_to_move

PLAY
  owner_interaction
  usual_situation
  behavior_seen_before

FEEDING
  resource_nearby
  owner_interaction
  appetite_today solo se pertinente

DOOR_EXIT
  outside_trigger
  usual_situation
  freedom_to_move

REST
  before_moment
  activity_today se comportamento anomalo
  discomfort_today solo se pertinente

STRANGER
  target_known
  freedom_to_move
  owner_interaction

OTHER_DOG
  target_known
  freedom_to_move
  resource_nearby se scena compatibile

VEHICLE
  familiar_place / familiar_context
  usual_situation
  recent_change se pertinente

HANDLING
  owner_interaction
  discomfort_today
  usual_situation

UNKNOWN
  before_moment
  usual_situation
  other_dog_present oppure trigger contestuale più utile
```

Il planner deve poter scegliere meno domande quando già conosce abbastanza.

---

# 8. UX ENTERPRISE — PROCESSING CONTEXT COMPANION

## 8.1 Obiettivo visuale

La pagina deve continuare a comunicare inequivocabilmente:

> **DOGly sta analizzando il video.**

Le domande sono un accompagnamento, non una pagina separata.

Non trasformare la schermata in un form.

## 8.2 Struttura raccomandata

Riutilizzare `ProcessingCompanion` e i token/design system esistenti.

```text
┌──────────────────────────────────┐
│  ✕        Sto guardando Rocky    │
│                                  │
│          [animazione DOGly]      │
│                                  │
│  Sto mettendo insieme i segnali… │
│  Analisi in corso                │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ Intanto mi aiuti a capire    │ │
│ │ meglio questo momento?       │ │
│ │                              │ │
│ │ Per Rocky era una situazione│ │
│ │ normale?                     │ │
│ │                              │ │
│ │ [ Sì, abituale ]             │ │
│ │ [ No, insolita ]             │ │
│ │ [ Era la prima volta ]       │ │
│ │ [ Non lo so ]                │ │
│ │                              │ │
│ │            Salta             │ │
│ └──────────────────────────────┘ │
│                                  │
│  ✓ Video ricevuto               │
│  ● Sto osservando               │
│  ○ Sto mettendo insieme…        │
└──────────────────────────────────┘
```

## 8.3 Micro-interazioni

Dopo una risposta:

- `Perfetto, questo mi aiuta.`
- `Ok, continuo a guardare.`
- `Questo dettaglio può essere utile.`

Durata breve: 400–800 ms, poi domanda successiva se esiste.

Non usare conferme eccessive o infantili.

## 8.4 Visual design

Obbligatorio:

- usare `colors`, `spacing`, `radius`, `typography`, shadows e componenti già presenti;
- nessuna nuova palette arbitraria;
- niente chat bubbles;
- card pulita, una sola gerarchia visiva;
- touch target minimo coerente con accessibilità;
- copy breve;
- nessun testo tecnico;
- animazione di processing sempre visibile o chiaramente percepibile;
- stepper/stato analisi non deve sparire dietro le domande;
- responsive mobile + mobile-web;
- nessun layout che salti durante il polling;
- ridurre motion rispettando `reduceMotion` già gestito;
- niente skeleton pesanti o librerie animation aggiuntive.

## 8.5 Percezione di velocità

La UI deve dare l'impressione corretta che **DOGly stia già lavorando**, non che stia aspettando le risposte.

Copy consigliato:

`Sto guardando Rocky con attenzione…`

poi:

`Intanto una cosa può aiutarmi.`

Non usare:

`Rispondi alle domande per avviare l'analisi.`

L'analisi è già iniziata.

---

# 9. ARCHITETTURA BACKEND / DATA

## 9.1 Separare processing context e refinement post-result

Mantenere due concetti distinti:

```text
PROCESSING_CONTEXT
owner facts raccolti mentre il video viene analizzato

POST_RESULT_CONTEXT
una domanda prodotta dal Reasoner dopo la prima interpretazione
```

Non confonderli nello stesso semantico.

## 9.2 Persistenza richiesta

Le risposte processing devono essere:

- event-scoped;
- owner-confirmed;
- versionate;
- idempotenti;
- auditabili;
- non permanenti come “memoria del cane” per default;
- separate dalle observation del video;
- disponibili al Reasoner prima dell'interpretazione se arrivate in tempo.

Preferenza architetturale enterprise: struttura tipizzata dedicata, per esempio una tabella evento-level equivalente a:

```text
behavior_processing_context_answers
  id
  event_id
  user_id
  question_id
  answer_id
  question_version
  source = OWNER_REPORTED
  answered_at
  created_at
```

La scelta del nome/schema finale deve rispettare l'architettura esistente del repository.

Vincoli minimi:

- ownership verificata lato server;
- RLS coerente se tabella pubblica;
- una risposta per `(event_id, question_id, user_id)` oppure upsert idempotente;
- client non può inventare `question_id/answer_id` non presenti nella Question Bank server-side;
- niente testo libero salvato dal client in V1;
- provenance esplicita `OWNER_REPORTED`.

## 9.3 Endpoint suggerito

Non è obbligatorio usare questo path se il routing esistente suggerisce una forma migliore, ma la semantica deve essere questa:

```text
GET  /v1/behavior/events/{event_id}/processing-context
POST /v1/behavior/events/{event_id}/processing-context
```

GET può restituire:

```json
{
  "event_id": "...",
  "analysis_status": "OBSERVING",
  "question": {
    "id": "usual_situation",
    "text": "Per Rocky era una situazione normale?",
    "options": [
      {"id": "usual", "label": "Sì, abituale"},
      {"id": "unusual", "label": "No, insolita"},
      {"id": "first_time", "label": "Era la prima volta"},
      {"id": "not_sure", "label": "Non lo so"}
    ]
  },
  "answered_count": 1,
  "max_questions": 3
}
```

POST:

```json
{
  "question_id": "usual_situation",
  "answer_id": "unusual"
}
```

Il server risolve label e significato canonico.

Se il risultato è già terminale, il server non deve corrompere lo stato: vedere se riusare in sicurezza il refinement esistente o restituire uno stato coerente senza perdere l'answer. Nessun re-run dell'Observer.

---

# 10. INTEGRAZIONE NEL PIPELINE AI

## 10.1 Regola principale

Il Reasoner deve leggere le risposte processing **immediatamente prima della fase di interpretazione**.

```text
Observer
  ↓
ObservationContract
  ↓
load latest processing owner context
  ↓
DogContextSnapshot + Memory + Knowledge + OWNER_REPORTED processing context
  ↓
Safety deterministic
  ↓
Reasoner
```

Non ritardare artificialmente l'Observer in attesa dell'utente.

Non aspettare indefinitamente la terza risposta.

Se zero risposte sono disponibili, il comportamento deve rimanere equivalente a oggi.

## 10.2 Risposte arrivate tardi

Caso:

- Reasoner ha già iniziato o concluso;
- proprietario tocca una risposta quasi contemporaneamente.

Comportamento richiesto:

- nessuna perdita silenziosa della risposta;
- nessun secondo Observer;
- evitare loop di reinterpretazione;
- se l'architettura corrente consente un singolo refinement sicuro usando l'ObservationContract già salvato, riusarlo;
- altrimenti la risposta resta auditata ma non deve fingere di aver modificato il risultato.

La UI deve essere onesta.

## 10.3 Struttura da passare al Reasoner

Non fondere i dati nelle evidence visive.

Esempio concettuale:

```json
{
  "processing_owner_context": [
    {
      "question_id": "target_known",
      "answer_id": "no",
      "label": "No",
      "provenance": "OWNER_REPORTED"
    }
  ]
}
```

Il prompt deve mantenere la regola:

> owner-reported context may modify interpretation, but never overwrite contradictory observable evidence or deterministic safety.

---

# 11. VIDEO QUALITY → COMPORTAMENTO DEL COMPANION

Usare ciò che già esiste nel `CaptureQuality` e negli `unknowns`.

Campi già utili:

```text
dog_visible_fraction
framing
lighting
motion_blur
audio_quality
overall_quality
warnings
facial_visibility
eye_visibility
ears.visible
tail.visible
vocalization.present
unknowns
```

## 11.1 Se overall quality è insufficiente

Non trasformare la schermata in un questionario.

Mostrare rapidamente il fallback già coerente con DOGly:

> `Non riesco a vedere abbastanza bene Rocky per darti una lettura affidabile. Riproviamo con una ripresa più chiara.`

Quota/refund e comportamento esistente non devono cambiare senza motivo.

## 11.2 Se audio assente/degradato

Il processing planner può proporre `owner_heard_vocalization` se ancora utile.

La risposta resta owner-reported.

## 11.3 Se un singolo distretto non è visibile

Esempio coda non visibile ma corpo/movimento buoni:

- non chiedere “come aveva la coda?”;
- continuare con gli altri segnali;
- chiedere contesto esterno solo se discriminante.

Il proprietario non deve diventare un annotatore tecnico.

---

# 12. DOMANDE CHE NON VOGLIAMO

Non chiedere:

- `Aveva la coda alta o bassa?`
- `Le orecchie erano indietro?`
- `Sembrava aggressivo?`
- `Era impaurito?`
- `Secondo te voleva giocare?`
- `Quanto era stressato da 1 a 10?`
- `Che confidence daresti?`

Queste domande contaminano il ground truth con interpretazioni del proprietario e duplicano il lavoro dell'Observer/Reasoner.

Vogliamo **fatti contestuali**, non etichette emotive.

---

# 13. PERFORMANCE E COST CONTROL

Requisiti enterprise:

- nessuna nuova chiamata LLM per generare le domande;
- question bank deterministicamente versionata;
- GET/POST piccoli;
- nessun payload video duplicato;
- nessun re-upload;
- nessun re-run Observer per risposta owner;
- polling analysis e fetch processing context coordinati senza race pesanti;
- React Query/cache coerente con repository;
- optimistic transition della UI consentita, ma mai mostrare “salvato” se POST fallisce;
- debounce/double-tap protection;
- endpoint idempotente;
- metriche minime: question shown, answered, skipped, late answer, planner version;
- nessun log con dati sensibili o testo arbitrario owner.

---

# 14. MOBILE + MOBILE-WEB

L'esperienza deve essere funzionalmente equivalente.

Riusa la stessa logica Question Bank / planner / mapping.

Evitare due implementazioni divergenti.

Se mobile e mobile-web hanno cartelle duplicate, estrarre/riusare dove l'architettura corrente lo consente senza avviare un refactoring generale del progetto.

Non fare un redesign del resto dell'app.

---

# 15. ACCESSIBILITÀ

- opzioni con `accessibilityRole="button"`;
- `accessibilityState` se selezionate/disabilitate;
- copy leggibile con Dynamic Type ove già supportato;
- stato “domanda aggiornata” annunciabile senza interrompere eccessivamente screen reader;
- `Salta` sempre raggiungibile;
- motion ridotto rispettato;
- niente timer che costringe a rispondere;
- niente perdita della risposta se il processing cambia stato mentre si tocca un'opzione.

---

# 16. TEST OBBLIGATORI

## Planner

- non propone più di 3 domande;
- non ripete domande già risposte/skippate;
- non chiede dati già noti;
- `OTHER_DOG` prioritizza familiarità / libertà di movimento;
- `HANDLING` può prioritizzare discomfort se pertinente;
- `has_audio=false` rende eleggibile owner vocalization;
- appetite non viene chiesto universalmente;
- weather/temperature non compare come domanda standard;
- memoria personale può sopprimere `behavior_seen_before`;
- recent changes già confermati sopprimono domanda duplicata.

## Backend/API

- ownership obbligatoria;
- ID domanda/risposta allowlisted;
- duplicate POST idempotente;
- altro utente non può scrivere/leggere risposte;
- `Salta` non crea un fatto owner-reported;
- risposta arrivata durante processing viene caricata nel context del Reasoner;
- nessuna risposta = behavior identico al flusso precedente;
- video `REJECTED_QUALITY` non diventa interpretabile grazie alle risposte;
- owner context non viene messo in `EvidenceSource.OBSERVATION`;
- safety deterministica non viene degradata.

## UI

- processing animation/status resta visibile;
- domanda una alla volta;
- pulsanti 2-4 + Salta;
- tap salva e passa alla successiva senza bloccare polling;
- errore rete non finge successo;
- risultato pronto interrompe correttamente il companion;
- nessun codice interno/tecnico in UI;
- mobile e mobile-web coerenti;
- test snapshot/component non fragile sui tempi dell'animazione.

## Regression

- capture 5–20 s invariato;
- upload invariato;
- quota/refund invariati;
- Observer invariato salvo lettura context se necessaria;
- post-result context esistente continua a funzionare;
- Conversation Layer continua a sanitizzare il copy;
- OpenAPI aggiornato se i contratti cambiano;
- CI completa verde.

---

# 17. ACCEPTANCE CRITERIA

La feature è accettabile solo se tutti i seguenti punti sono veri:

1. Dopo il video DOGly entra subito in processing: non aspetta il questionario.
2. L'utente vede chiaramente che l'analisi sta continuando.
3. DOGly propone 0–3 domande, mai più di 3.
4. Le domande sono contestuali, non sempre uguali.
5. Nessuna domanda duplica dati già disponibili.
6. Ogni domanda può essere saltata.
7. Le risposte sono owner-reported e auditate.
8. Le risposte disponibili prima del Reasoner entrano nella prima interpretazione.
9. Il Reasoner non confonde owner facts e osservazioni video.
10. Un video insufficiente resta insufficiente.
11. Il risultato consumer resta semplice, naturale e coerente col Conversation Layer.
12. Dopo il risultato normalmente non serve alcuna domanda; se serve, resta il meccanismo di chiarimento mirato esistente, con target massimo 1 e hard cap 2 per sessione.
13. Nessun nuovo LLM call è introdotto per il planner.
14. Nessun aumento percepibile della latenza dovuto all'attesa delle risposte.
15. UI pulita, premium, coerente e responsive.
16. Tutti i test e CI pertinenti sono verdi.

---

# 18. ESEMPIO COMPLETO DESIDERATO

## Caso: Rocky abbaia verso una porta

### Processing

DOGly continua l'analisi.

```text
Sto guardando Rocky con attenzione…

Intanto una cosa può aiutarmi.

Per Rocky era una situazione normale?

[ Sì, abituale ]
[ No, insolita ]
[ Era la prima volta ]
[ Non lo so ]

Salta
```

Owner: `Sì, abituale`

Micro-copy:

```text
Perfetto, questo mi aiuta.
```

Seconda domanda, se utile:

```text
C'era qualcosa fuori dalla porta?

[ Una persona ]
[ Un cane ]
[ Un rumore ]
[ Niente che abbia notato ]

Salta
```

Owner: `Un cane`

Nel frattempo Observer produce, ad esempio:

```text
body: stiff
orientation_target: door
approach: yes
vocalization: bark
```

Reasoner riceve separatamente:

```text
OBSERVED
- corpo rigido
- orientamento verso porta
- avvicinamento
- abbaio

OWNER_REPORTED
- situazione abituale
- presenza di un cane fuori
```

### Risultato

```text
Cosa penso

Rocky sembra molto concentrato su qualcosa fuori dal suo spazio.
Il fatto che tu abbia confermato la presenza di un altro cane rende più
compatibile una lettura di forte vigilanza/attivazione in quel momento.

Cosa potrebbe volerti comunicare

«Ehi, c'è qualcuno qui fuori.»

Rispetto al suo solito

Questo episodio assomiglia ad altri momenti che hai già confermato,
se esiste davvero memoria personale eleggibile.

Cosa puoi fare
...
```

Nessun dump di postura, confidence o codici nella vista principale.

---

# 19. ESEMPIO: AUDIO ASSENTE

Capture ha `has_audio=false`.

Il planner può usare:

```text
Hai sentito Rocky vocalizzare in quel momento?

[ Abbaiava ]
[ Ringhiava ]
[ Guaiava o piagnucolava ]
[ No ]
```

Se owner seleziona `Ringhiava`:

```text
OWNER_REPORTED: growl heard by owner
```

NON:

```text
OBSERVED vocalization.type = growl
```

Questa distinzione deve essere visibile nell'audit e nel payload del Reasoner.

---

# 20. ESEMPIO: VIDEO INSUFFICIENTE

Observer:

```text
overall_quality = insufficient
dog_visible_fraction very low
```

Anche se l'owner ha risposto a tre domande, risultato:

```text
Non riesco a vedere abbastanza bene Rocky per darti una lettura affidabile.
Riproviamo con una ripresa più chiara.
```

Le risposte restano event-scoped/auditate se già raccolte, ma **non autorizzano una diagnosi comportamentale**.

---

# 21. NON SCOPE

Non implementare in questo lavoro:

- Live Audio;
- conversazione vocale realtime;
- bark translation realtime;
- chat libera;
- nuovo modello scientifico;
- nuovo sistema di memoria globale;
- auto-salvataggio permanente di tutte le risposte;
- training dataset automatico;
- scoring consumer percentuale;
- refactoring generale dell'app;
- redesign completo delle schermate non coinvolte.

---

# 22. OUTPUT RICHIESTO A CURSOR

Dopo l'implementazione riportare:

```text
Commit SHA:

File modificati:

Migrazioni Supabase:

Nuovi endpoint/contratti:

Question Bank implementata:

Come il planner evita domande inutili:

Come il Reasoner riceve OWNER_REPORTED processing context:

Comportamento delle late answers:

Test eseguiti e risultato:

CI / OpenAPI:

Eventuali limiti rimasti:
```

**Non proseguire con Live Audio dopo questo commit. Fermati e attendi review.**
