

DOGLY
Enterprise UX Master
Implementation Specification V5 — Pixel-faithful consumer experience
DOCUMENTO VINCOLANTE PER CURSOR
La reference grafica approvata allegata decide layout, gerarchia e semplicità. Il codice reale decide funzionalità e dati. I token GitHub decidono i colori. Nessun agente deve reinterpretare liberamente la UX.

Reference UX approvata — base visiva primaria del documento.
Audit codice: repository Attila-lab-org/dogly • main verificato al commit 178766cc867baa92ecc6d06f0a76abf31783bc4e • 7 settembre 2026
1. Decisione esecutiva
Cosa Cursor deve considerare “source of truth” e cosa non può cambiare.
Tema
Decisione vincolante
UX primaria
La reference grafica approvata in questo documento. Va replicata nella struttura, nelle priorità, nel linguaggio e nella progressive disclosure.
Colori
Solo apps/mobile/src/theme/tokens.ts. Non copiare il verde/crema della reference: usare blu #2563EB, teal #14B8A6, navy #0E2A47, background #F4F7FB e token esistenti.
Codice
Riutilizzare route, API, hook, state machine, storage, quota, AI, safety e dati già esistenti. Non riscrivere backend per esigenze puramente grafiche.
Home
Mantenere l’header attuale approvato e la riga Storie subito sotto. La reference Home si applica alla gerarchia successiva.
Dogly
Dogly NON parte da zero: possiede conoscenza canina generale/strutturata. L’uso serve a personalizzare la conoscenza di Rocky.
Routine
Facoltative, progressive, mai “profilo incompleto”, mai 2/5, mai nag persistente.
Voce
Nuova funzione: “Raccontami di Rocky”. Voice in → conferma visiva → solo dopo salvataggio. Provenienza owner-reported separata dall’osservazione video.
Digestione
Dominio già esistente: capture, upload, vision, processing, safety, result, diario, baseline e nutrizione. Va preservato e ripresentato con la nuova UX.
Risultati
Prima lettura umana e semplice; dettagli tecnici solo dietro tap. Nessun effetto referto medico.

North star
Molta intelligenza dietro, pochissima complessità davanti. “Mostrami Rocky. Ti dico cosa penso. Ti spiego perché se vuoi. Ti consiglio cosa provare. E mi ricordo com’è andata.”

2. Reference UX approvata
Le otto schermate seguenti non sono “ispirazione”: sono il target visuale e gerarchico.

• Le proporzioni, il peso visivo, l’ordine dei blocchi, le card e la progressive disclosure vanno seguiti il più fedelmente possibile.
• Eccezione deliberata Home: header attuale + StoriesRail restano in alto prima della parte Home mostrata nella reference.
• I colori dell’immagine NON sono vincolanti: la palette viene dai token del repository.
• Le nuove funzioni non presenti nell’immagine (voce e digestione) devono sembrare appartenere allo stesso prodotto, non moduli aggiunti dopo.
3. Audit del codice attuale
Mappa “esistente → target” prima di toccare la UI.
Tema
Decisione vincolante
Home
apps/mobile/app/(tabs)/home.tsx — header, StoriesRail, dog card, lifestyle card, CTA video, digestione, care, ultima analisi.
Tab
apps/mobile/app/(tabs)/_layout.tsx — oggi Home / Fotocamera / Rocky; Diario è nascosto. Il target approvato porta Home / Diario / Profilo.
Processing
apps/mobile/app/behavior/processing/[eventId].tsx — polling reale e companion esistono; va rifatto il linguaggio/visuale.
Result
apps/mobile/app/behavior/result/[eventId].tsx + BehaviorResultView/Advice — logica reale da conservare, presentazione da semplificare.
Diario
apps/mobile/app/(tabs)/diary.tsx — timeline behavior + digestione, oggi funzionale ma amministrativa.
Profilo
apps/mobile/app/(tabs)/rocky.tsx — oggi hero gradiente, album e wellness; va portato alla gerarchia della reference.
Routine
apps/mobile/app/dogs/[dogId]/lifestyle.tsx — dati veri, ma UX form-like; types.ts usa ancora concetto 2/5/Completato da eliminare dalla superficie.
Digestione
apps/mobile/app/digestive/* + backend digestive*.py — flusso reale già strutturato.
Vision feci
backend/app/providers/openai_digestive_vision.py + factory.py — adapter OpenAI reale disponibile, con schema chiuso, budget gate e kill switch.
Voce owner
Nessuna route/feature dedicata trovata nel repo corrente: è una nuova capability da progettare senza confonderla con l’audio del video.

Regola di implementazione
Prima di ogni modifica Cursor deve mappare il componente attuale e riusare ciò che già funziona. Vietato sostituire dati reali con mock per ottenere la grafica.

4. Navigazione globale
La nuova IA non deve produrre una navigazione più complessa.
Tema
Decisione vincolante
Tab 1
Home
Tab 2
Diario
Tab 3
Profilo / nome cane
Storie
Restano in Home. “+” sulla StoriesRail apre camera/galleria per creare una storia; non serve una tab Fotocamera primaria.
Video behavior
Parte solo da CAPISCI ROCKY.
Digestione
Accesso secondario da Home/Salute e dal Profilo, mai tab primaria.
Voce
Accesso secondario “Raccontami di Rocky”, mai sostituto del video e mai tab primaria.

Scelta tecnica consigliata:
• Rendere `(tabs)/diary` visibile e nascondere `(tabs)/camera` dalla tab bar, mantenendo comunque la route camera per la creazione delle storie.
• Il profilo continua a usare la route `(tabs)/rocky`, con label visuale “Profilo” o nome del cane secondo il componente tab.
5. Home
Reference 1 — focus sul valore. Eccezione: header e Storie correnti restano sopra.

Reference approvata: la sezione Home da replicare sotto Header + Stories.
Ordine finale vincolante
• Header attuale approvato
• StoriesRail attuale
• Hero/identità Rocky visuale
• CTA dominante CAPISCI ROCKY — “Mostrami cosa sta facendo”
• Ultima analisi
• Raccontami di Rocky — accesso compatto, secondario
• Strumenti utili: Salute / Agenda / Diario oppure Salute / Digestione / Diario secondo lo spazio
• Eventuale prossimo appuntamento solo quando contestuale
Da eliminare dalla superficie
• Card persistente “Aiutami a conoscere meglio Rocky” basata sul concetto di profilo lifestyle incompleto.
• Copy che suggerisce che Dogly debba ancora imparare il comportamento canino.
• Quota esposta in primo piano quando non è vicina all’esaurimento.
Copy cold start corretto
Dogly sa già molto
“Conosco già molti segnali del comportamento canino. Più conosco Rocky, più posso interpretarli nel suo modo personale.”

6. Analisi in corso
Reference 2 — semplice, rassicurante, non una pipeline tecnica.

Tema
Decisione vincolante
Titolo
Sto guardando Rocky
Step 1
Analizzo il video
Step 2
Riconosco i segnali principali
Step 3
Li confronto con quello che so di Rocky
Step 4
Preparo la mia risposta
Messaggio basso
Ci vogliono solo pochi secondi… Nel frattempo puoi rimanere qui.
Logica
Conservare polling, status reali, error handling, retry e notifiche. Cambiare solo presentazione/copy.

• Non mostrare Gemini, OpenAI, ObservationContract, taxonomy, knowledge cards o “confidence” durante l’elaborazione.
7. Risultato comportamentale
Reference 3 — risposta umana, poi approfondimenti solo se richiesti.

Tema
Decisione vincolante
Hero
Media/foto del cane se disponibile + headline consumer.
Headline
Esempio: “Rocky sembra voler attirare la tua attenzione”.
Sintesi
2–4 righe naturali. Dire cosa si vede e quale lettura è compatibile, senza tono clinico.
Azione
Card “Prova così” con UN consiglio controllato dal Advice Engine.
Dettagli
Righe chiuse: “Perché lo penso” e “Potrebbero esserci altre spiegazioni”.
Feedback
“Ti sembra proprio Rocky?” — Sì / Non proprio / Non so se utile al modello attuale.
Azioni finali
Salva nel Diario / Condividi.

Confidenza
• Mantenere LOW/MEDIUM/HIGH internamente e nell’audit. Non renderla il centro della schermata.
• Se serve comunicare incertezza: “Non è ancora del tutto chiaro” / “Ci sono buoni indizi”, non “Confidenza 67%”.
8. Storico analisi
Reference 4 — lista visiva e immediatamente leggibile.

Tema
Decisione vincolante
Titolo
Le analisi di Rocky
Filtri
Tutte / Comportamento / Salute. “Salute” è label consumer: non obbliga a cambiare il dominio backend DIGESTIVE.
Gruppi
Per mese, non per singolo giorno salvo necessità.
Riga
Thumbnail, titolo consumer, data/ora, stato emotivo/attenzione sintetico.
No
ID evento, stato tecnico, provider, modello, confidence numerica, tassonomia grezza.

Razionalizzazione con il Diario
• Questa schermata può essere una modalità/list view del Diario, riusando gli stessi dati e componenti. Evitare due datastore o due timeline indipendenti.
9. Profilo Rocky
Reference 5 — le info essenziali, in modo leggero.

Tema
Decisione vincolante
Hero
Avatar, nome, età, razza, modifica profilo. Niente grande dashboard AI.
Informazioni di base
Dati anagrafici/morfologici già esistenti.
Salute
Hub leggero che apre Digestione, Alimentazione, Agenda e altre funzioni salute reali.
Le sue preferenze
Area personale; inizialmente può usare enrichment/social già presenti. Non inventare campi backend senza specifica.
Routine e abitudini
Esplicitamente “Opzionale”; nessun 2 di 5 / Completato.
Foto e momenti
Riusa album/storie.
Note personali
Nuova area owner-reported; collegabile anche al flusso voce.

Principio
Il Profilo è il posto dove l’utente ritrova Rocky. Non deve sembrare la console di configurazione dell’AI.

10. Routine e abitudini — ingresso
Reference 6A — discreta, facoltativa, non invasiva.

Tema
Decisione vincolante
Titolo
Conosciamo meglio Rocky?
Spiegazione
“Queste informazioni ci aiutano a darti consigli più personalizzati. Puoi aggiungerle ora o anche più tardi.”
CTA
Aggiungi qualche informazione
Secondaria
Non ora
Regola
Dopo “Non ora” nessuna card persistente torna solo perché mancano dati.

Quando riproporre informazioni mancanti
• Solo contestualmente: quando un’analisi potrebbe beneficiare di un dato specifico, Dogly può fare UNA domanda breve.
• Oppure l’utente entra spontaneamente dal Profilo.
• Mai trasformare il mancato dato in errore, warning o task incompleto.
11. Routine e abitudini — categorie
Reference 6B — “scegli solo quello che vuoi condividere”.

Tema
Decisione vincolante
Passeggiate
Quanto cammina / livello attività. Riusa `activity` dove compatibile.
Sonno
Come dorme. Riusa `sleep`.
Alimentazione
Mostrare il cibo/feeding reale; non duplicare dati verificati del modulo Nutrizione.
Tempo da solo
Riusa `timeAlone`.
Attività preferite
Riusa/estende `enrichment` con schema approvato.
Socialità
Può vivere come categoria o dentro preferenze, usando `social`.
Note libere
Nuovo owner-reported context, con provenienza esplicita.

Modifica tecnica necessaria
Rimuovere dalla UX i concetti `isLifestyleComplete`, “2 di 5” e “Completato”. Possono restare metriche interne se servono, ma non devono guidare Home/Profile.

12. Dettaglio dell’analisi
Reference 7 — complessità disponibile solo quando l’utente la chiede.

Tema
Decisione vincolante
Tab
Sintesi / Segnali / Contesto / Consigli
Sintesi
Headline + breve spiegazione + Prova così.
Segnali
Evidence tradotte in linguaggio umano.
Contesto
Età/life stage, situazione, routine e memoria personale SOLO se hanno contribuito, con provenienza chiara.
Consigli
Advice controllato + cosa monitorare; niente diagnosi.
Scienza
Non mostrare card IDs/evidence grade a meno di futura modalità “Fonti”. L’audit resta backend.

13. Diario / ricerca storico
Reference 8 — memoria visiva di Rocky, non registro amministrativo.

Tema
Decisione vincolante
Search
Ricerca per titolo/termine consumer.
Mesi
Chip orizzontali con conteggio.
Card
Thumbnail o media preview se disponibile, titolo, data, breve sintesi.
Dominio
Behavior + Digestive nello stesso Diario, differenziati con label/iconografia semplice.
Voice notes
NON mischiare automaticamente i racconti vocali con le “analisi”. Le note confermate vivono nel Profilo/Note personali; possono essere richiamate nel contesto se rilevanti.

Due viste, un solo dataset
• “Le analisi di Rocky” = lista compatta per scorrere rapidamente.
• “Diario” = vista ricca con ricerca, mesi e card visuali.
• Entrambe devono usare gli stessi endpoint/timeline e componenti condivisi, non duplicare la logica.
14. Nuova funzione — Raccontami di Rocky
Il microfono serve a raccogliere contesto personale, non a sostituire il video.

Extension mockup derivato dalla reference, già tradotto nella palette attuale del codice.
Tema
Decisione vincolante
Promessa
“Dimmi cosa hai notato.” Nessun form obbligatorio.
Home
Accesso compatto sotto Ultima analisi o negli Strumenti utili, sempre secondario rispetto a CAPISCI ROCKY.
Routine
CTA “Oppure raccontamelo a voce” nell’ingresso/categorie.
Profilo
Richiamabile da Routine e Note personali.
Non è
Audio-only behavior analysis; il behavior consumer continua a partire da video.

15. Voce — registrazione
Una singola azione, nessun questionario.

• Un tap avvia; un tap termina. Mostrare timer e waveform discreta.
• Permesso microfono chiesto contestualmente al primo uso, con copy umano.
• Audio raw temporaneo: retention minima necessaria alla trascrizione; non diventa memoria personale di default.
• Se l’audio fallisce, offrire “Scrivilo” come fallback equivalente.
• Non promettere interpretazione emotiva della voce del proprietario: serve solo a trascrivere/estrarre informazioni dichiarate.
16. Voce — conferma visiva
Voice in → visual out: nessuna informazione estratta viene salvata in silenzio.

Tema
Decisione vincolante
Output
Card editabili: Sonno, Tempo da solo, Preferenza, Cambi recenti, Nota libera, ecc.
Provenienza
Ogni dato è `OWNER_REPORTED`, separato da `DOG_OBSERVED` e `PERSONAL_PATTERN`.
Conferma
Solo “Conferma e salva” rende il dato persistente.
Correzione
L’utente può cambiare, eliminare o non confermare singole card.
Health mention
Se il racconto contiene un possibile segnale di salute, non diagnosticare: mostrare un percorso prudente / eventuale vet escalation.

17. Architettura funzionale della voce
Proposta implementativa coerente con l’architettura Dogly esistente.
Pipeline
MIC → audio temporaneo → trascrizione → estrazione strutturata → schermata “Ho capito questo” → conferma utente → persistenza owner-reported → DogContextSnapshot / note personali

Contratto minimo consigliato
• `owner_report_id`, `user_id`, `dog_id`, `source_type=VOICE|TEXT`, `created_at`.
• `raw_transcript` opzionale con policy retention; `confirmed_summary` persistente.
• `extracted_facts` strutturate e versionate; ogni fatto ha category, value, provenance, confirmed_at.
• Non scrivere direttamente Personal Patterns. I pattern restano deterministici e richiedono osservazioni/feedback nel tempo.
• Quando un fatto mappa a lifestyle esistente, aggiornare solo dopo conferma; mantenere comunque audit della provenienza owner-reported.
• Alimentazione verificata non va sovrascritta da speech extraction: se l’utente nomina un cibo, proporre di aggiornare Nutrizione.
Provider
• Implementare dietro un’interfaccia STT/extraction provider-agnostic. Cursor deve verificare l’Expo SDK/package corrente e usare un modulo di registrazione supportato, evitando dipendenze deprecate.
18. Digestione — capture
Funzione già esistente: nuova presentazione coerente con il master UX.

Extension target — la logica è già nel codice, cambia la gerarchia visiva.
Tema
Decisione vincolante
Esiste già
`/digestive/capture`: camera permission, scatto, preview, retry upload, quota, processing.
Copy
“Controlla la digestione” / “Una foto, poi la confronto con il solito di Rocky.”
Tips
Buona luce / Da vicino / Dall’alto.
Safety
Disclaimer breve; non trasformare il capture in schermata medica.
Home
Accesso secondario. In Profilo vive sotto Salute.

19. Digestione — risultato
La stessa regola del comportamento: prima una risposta semplice, dettagli dopo.

Tema
Decisione vincolante
Hero
Esempio: “Oggi sembra più morbida rispetto al solito di Rocky”.
Personalizzazione
Il confronto Rocky-vs-Rocky è più importante del punteggio nudo.
Safety
Se c’è un safety flag, viene prima della UX semplificata e usa copy deterministico revisionato.
Dettagli chiusi
Consistenza, colore, stima 1–7, candidati visivi, cibo attivo.
No referto
Non mostrare una griglia di metriche come prima cosa se non serve.

20. Digestione — audit tecnico aggiornato
Il documento precedente era già superato: oggi il repository ha un provider reale selezionabile.
Tema
Decisione vincolante
Provider
`build_digestive_vision()` seleziona `mock` oppure `openai`; `OpenAIDigestiveVision` esiste e produce `StoolObservationContract`.
Guardrail
OpenAI digestive osserva solo proprietà visibili; safety/medical routing resta deterministico nel dominio.
Costi
Il provider chiama il budget gate prima dell’analisi e supporta kill switch.
Backend contract
`DigestiveEventOut` espone image quality, warnings, candidates, active food e baseline comparison.
Gap mobile reale
`apps/mobile/src/features/digestive/api.ts` definisce ancora un tipo API ridotto e forza warnings/candidates/active food a unknown/null. Questo va riallineato al contratto backend.
Profilo
`rocky.tsx` usa ancora mock per digestive baseline/food nel rendering corrente: collegare ai dati reali prima di considerare il nuovo Profilo completo.

P0 Digestione
Non reinventare il dominio. Correggere il mapper mobile e la lettura dati Profile, poi rifare capture/processing/result nella nuova UX.

21. Salute, Digestione, Nutrizione e Agenda
Come entrano nel nuovo Profilo senza sovraccaricarlo.
Tema
Decisione vincolante
Profilo → Salute
Una sola riga leggera apre un hub salute.
Digestione
Foto feci, risultati, trend e storico.
Alimentazione
Cibo attivo, scansione/verify label, periodi alimentari.
Agenda
Visite, vaccini, promemoria.
Home
Mostrare solo strumenti utili sintetici; non duplicare tutto il Profilo.
Diario
Digestione compare insieme alle analisi behavior con label consumer “Salute/Digestione”.

• Nessun flusso deve far sembrare Dogly un sostituto del veterinario.
• La conoscenza veterinaria/linee guida alimenta safety e decisioni prudenziali; il consumer vede copy semplice e azioni chiare.
22. Messaggio di prodotto e conoscenza
Dogly deve apparire competente dal primo minuto, senza promettere certezza assoluta.
Copy guida
Dogly conosce già molti segnali del comportamento canino. Più conosce Rocky — età, routine, contesto e storia personale — più può rendere la lettura utile per lui.

Tre fonti che l’UX deve mantenere distinte
Fonte
Significato
Osservato da Dogly
Video/foto e feature realmente visibili.
Raccontato da te
Voce, testo, note, routine inserite dal proprietario.
Imparato nel tempo
Pattern longitudinali e baseline personali validati dal motore deterministico.

• Mai presentare un owner report come “Dogly ha osservato”.
• Mai presentare una singola inferenza AI come tratto stabile del cane.
• Razza ed età modificano il contesto; non determinano da sole il comportamento.
23. Sistema di copy consumer
Semplificare la lingua, non il cervello.
Tema
Decisione vincolante
Tecnico
“Confidenza alta” → “Lettura abbastanza chiara” solo se serve.
Tecnico
“Segnali osservati” → “Perché lo penso”.
Tecnico
“Alternative hypotheses” → “Potrebbero esserci altre spiegazioni”.
Tecnico
“Advice outcome” → “Com’è andata?” da chiedere DOPO che l’utente ha avuto tempo di provare.
Tecnico
“Processing observer/reasoner” → “Sto guardando Rocky / metto insieme i segnali”.
Digestione
“Fecal score estimate” → dettaglio “Stima visiva 1–7”, non hero principale.

Feedback temporale
• “Ti sembra proprio Rocky?” può stare subito dopo il risultato perché valuta la lettura.
• “Ti è stato utile?” / outcome del consiglio va chiesto dopo, nel Diario o alla riapertura, non immediatamente.
24. Stati, errori e accessibilità
La nuova grafica non può cancellare la robustezza già costruita.
• Loading: skeleton/placeholder coerenti, niente schermata vuota.
• Offline: mostrare dati cached; nuove analisi richiedono connessione; retry esplicito.
• Processing esistente: Home mostra un banner discreto e riapre l’evento.
• Quota: non inventare numeri se API non caricata; paywall solo quando necessario.
• Insufficient video/foto: spiegare come migliorare e rifare senza penalizzare.
• Safety: priorità assoluta su estetica e “tono leggero”.
• Voice permission/error: fallback testo e nessuna perdita silenziosa del racconto.
• Touch target >=44px, accessibilityLabel, contrasto basato sui token correnti, Dynamic Type dove compatibile.
25. Piano di implementazione per Cursor
Ordine di lavoro che riduce regressioni e impedisce una riscrittura inutile.
Tema
Decisione vincolante
Fase 0 — Audit
Confermare main, route, componenti, API e test. Salvare questa reference nel repo come `docs/ux/Dogly_UX_Target_Approved_2026-09-07.png`.
Fase 1 — Navigation
Home / Diario / Profilo; camera storia resta raggiungibile dalla StoriesRail.
Fase 2 — Home
Header + Stories invariati; hero/CTA/last insight/voice/tools secondo target; rimuovere nag lifestyle.
Fase 3 — Behavior
Processing + Result + Details progressive disclosure.
Fase 4 — Diary
Search/month chips/card visuali + list mode analyses.
Fase 5 — Profile
Portare Rocky al layout leggero; collegare Health/album/lifestyle reali.
Fase 6 — Lifestyle
Intro opzionale + category chooser + detail per categoria; niente completion semantics consumer.
Fase 7 — Voice
Capture/STT/extraction/confirmation/provenance/persistence; test privacy e mapping.
Fase 8 — Digestive
Mapper mobile completo + Profile data reali + nuovo capture/processing/result visuale.
Fase 9 — E2E
Video, voce, digestione, diario, profile e error states su device reale.

26. Cosa riusare, cosa modificare, cosa creare
Confine tecnico esplicito.
Tema
Decisione vincolante
RIUSARE
Theme tokens, auth/session, API client, behavior capture, polling, AI/KB/advice, storage signed upload, quota, notifications, Diary data, album, care, nutrition, digestive backend.
MODIFICARE
`(tabs)/_layout.tsx`, Home hierarchy, processing/result presentation, diary visual layer, Rocky layout, lifestyle UX/types consumer completion, digestive mobile mapper/profile reads.
CREARE
Voice owner-report flow, confirmation UI, provenance storage/API, notes/personal context view, eventuale Diary analysis list state se non condivisibile con route corrente.
NON CREARE
Nuova palette, secondo backend, nuovo vector DB per UX, nuove API duplicate del Diary, audio-only behavior analysis.

27. Acceptance criteria pagina per pagina
La reference è verificabile, non soggettiva.
Area
PASS se…
Home
Header e Stories restano; CTA behavior domina; nessun completion nag; ultima analisi visibile; voice secondario; digestione accessibile.
Processing
Zero gergo AI; 4 step consumer; uscita/notification continua a funzionare.
Result
Hero + sintesi + Prova così visibili senza scorrere troppo; evidence/alternative chiusi; no referto.
History/Diary
Visuale, month grouping/search, behavior+digestive, no ID tecnici.
Profile
Identità leggera + 6 righe principali; Salute apre funzioni vere; Routine marcata Opzionale.
Lifestyle
Qualsiasi categoria può restare vuota; “Non ora” reale; nessun 2/5 in Home/Profile.
Voice
Nulla salvato prima di conferma; provenance OWNER_REPORTED; fallback text; audio raw non diventa memoria permanente per default.
Digestive
OpenAI/mock provider invariati per config; mapper mobile consuma contratto completo; safety deterministica; first layer human.

28. Definition of Done
Il lavoro non è finito quando “assomiglia” all’immagine.
• TypeScript typecheck, unit test, lint/build mobile verdi.
• Backend Ruff/pytest/OpenAPI drift/Supabase test verdi se toccati.
• Nessun colore hardcoded nuovo fuori dai token esistenti, salvo overlay già approvati.
• Tutte le route target aperte su Android reale/web dev senza crash.
• E2E behavior: capture → processing → result → feedback → Diary.
• E2E voice: record → transcript/extract → edit → confirm → persisted owner context → visibile in Profile / usabile nel DogContext.
• E2E digestive: photo → upload → real provider quando configurato → result → safety → Diary → Profile summary reale.
• Verifica visuale screenshot-by-screenshot contro le 8 reference approvate.
• Verifica che Storie, Album, Agenda, Nutrizione, privacy e quota non abbiano regressioni.
• Il prodotto deve essere comprensibile senza sapere cos’è un modello AI.
Go / No-Go
NO-GO se Cursor consegna una reinterpretazione grafica, cambia palette, lascia mock dove esistono dati reali, rende obbligatorie le abitudini, salva automaticamente estrazioni vocali o mantiene il risultato con aspetto da referto.

29. Istruzione finale da dare a Cursor
Questo documento e l’immagine allegata sono il contratto di implementazione.
PROMPT
Leggi integralmente `Dogly_Enterprise_UX_Master_Implementation_Spec_V5_Cursor.docx` e usa l’immagine “Dogly UX Target Approved” come reference visuale vincolante. Prima fai un audit del main corrente e una mappa dei componenti da riusare. Poi implementa per fasi senza cambiare backend, AI, safety o palette salvo quanto esplicitamente richiesto. La reference decide layout/gerarchia; `tokens.ts` decide i colori; il codice corrente decide funzionalità e dati. Header e Stories Home restano. Routine è opzionale. Integra la nuova funzione “Raccontami di Rocky” con conferma e provenance owner-reported. Digestione esiste già: preservala, completa i gap mobile e ridisegnala nello stesso linguaggio. Al termine esegui tutti i test e produci screenshot di ogni pagina target per confronto.

NON procedere per “ispirazione”. Procedere per corrispondenza verificabile alla UX approvata.