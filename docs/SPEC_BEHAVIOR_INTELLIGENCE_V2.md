

DOGLY
Behavior Intelligence V2
Information, Decision & Consumer Experience Architecture
Principio guida
Il motore può essere sofisticato, scientifico e tecnico. Il cliente non deve vederlo. Il cliente deve ricevere poche informazioni, comprensibili e utili: cosa sembra stia succedendo, cosa significa per il suo cane, cosa conviene fare adesso e quando è necessario chiedere aiuto.

Versione
V2 Enterprise — allineata al codice corrente su main e alle decisioni di prodotto più recenti
Ambito
Analisi comportamentale consumer basata su video, con audio opzionale come modalità interna del video; personalizzazione progressiva; safety; consigli; feedback e storico.
Nota di governance
Questo documento distingue esplicitamente tra complessità interna e superficie consumer. La parte tecnica resta nel motore, nell’audit e nell’admin; non viene esposta al proprietario salvo quando è utile per trasparenza o sicurezza.
INTERNAL PRODUCT SPECIFICATION

1. Executive decision
La direzione corretta non è mostrare al proprietario più “ragionamento AI”. È esattamente il contrario: Dogly deve usare più conoscenza internamente per poter dire meno, ma meglio, al cliente.
Internamente Dogly deve sapere
Al cliente interessa
postura, movimento, coda, orecchie, sguardo, vocalizzazioni, qualità del video
Che cosa sembra stia succedendo
contesto, età, fase di vita, routine, cambi recenti, trigger, preferenze
Se è normale per il suo cane o diverso dal solito
evidenza scientifica, alternative, contraddizioni, copertura, confidence
Quanto fidarsi della lettura solo quando serve
pattern personali e storico
Se Dogly riconosce qualcosa di già visto
safety flags e regole di escalation
Cosa fare adesso e quando chiedere aiuto

Decisione non negoziabile
Confidence, tassonomie, source IDs, nomi dei modelli, punteggi interni, “evidence coverage”, alternative numeriche e dettagli di pipeline non sono contenuto consumer di default. Servono per governare il sistema, non per impressionare il cliente.

2. Stato attuale: cosa funziona e cosa va cambiato
Il motore comportamentale attuale è concettualmente solido: separa osservazione da interpretazione, usa una tassonomia chiusa, recupera conoscenza pertinente, considera il profilo del cane, supporta astensione, safety deterministica, consigli separati dall’interpretazione e feedback. La principale criticità di prodotto è che la superficie consumer mostra ancora troppo la struttura interna del risultato.
Area
Valutazione
Decisione V2
Observer
Buona separazione tra fatti e interpretazione
Conservare; nessun tecnicismo in UI
Knowledge
Buona base scientifica e prudenziale
Usarla per decidere cosa dire, non per mostrare fonti grezze
Reasoner
Corretto uso probabilistico + contesto
Produrre output strutturato per il composer consumer
Safety
Presente prima del reasoner
Deve governare wording e escalation
Personal context
Già previsto ma non sempre sfruttato nel percorso mobile
Portarlo al centro della risposta
Result UI
Troppo orientata a confidence/evidence/alternative
Riprogettare attorno a utilità e azione

3. Architettura decisionale interna
Il motore può restare sofisticato. La nuova architettura deve formalizzare la separazione tra “Decision Intelligence” e “Consumer Response”.
Layer interno
Responsabilità
1. Observation
Estrarre ciò che è realmente visibile o udibile, senza attribuire intenzioni o emozioni come fatti.
2. Context
Assemblare situazione, fase di vita, routine, cambi recenti, ambiente, profilo e dati owner-reported rilevanti.
3. Knowledge
Recuperare soltanto evidenze e regole pertinenti ai segnali osservati.
4. Personal Baseline
Confrontare l’episodio con ciò che Dogly ha già imparato su quel cane.
5. Safety
Identificare condizioni in cui la priorità non è “capire l’intento” ma ridurre rischio o suggerire assistenza.
6. Interpretation
Costruire una o più ipotesi compatibili, con astensione quando gli elementi non bastano.
7. Advice
Selezionare una sola azione consumer, prudente e coerente con il caso.
8. Consumer Composer
Ridurre tutto a poche informazioni utili, in linguaggio naturale e non tecnico.

Regola di riduzione
Più il motore sa, meno il cliente deve essere costretto a leggere. La complessità è una responsabilità del prodotto, non dell’utente.

4. Nuovo contratto informativo consumer
Ogni risultato comportamentale deve rispondere a un massimo di quattro domande. Non è obbligatorio mostrare tutte e quattro se una non aggiunge valore.
Domanda consumer
Output ideale
1. Cosa sembra stia succedendo?
Una headline probabilistica, specifica ma non assoluta.
2. Cosa significa per il mio cane?
Confronto con baseline personale o dichiarazione che Dogly sta ancora imparando.
3. Cosa posso fare adesso?
Una sola azione chiara, a basso rischio, selezionata dal motore.
4. Cosa devo osservare?
Un breve follow-up utile per capire se l’ipotesi è corretta o se la situazione cambia.

Non devono essere presenti di default:
“Confidenza media / alta / bassa” come elemento protagonista.
Elenco completo di tutti i segnali rilevati.
Tutte le alternative generate dal reasoner.
Punteggi, percentuali, card scientifiche, fonte tecnica, modello, provider o schema.
Lunga spiegazione del ragionamento che ha portato alla conclusione.
5. UX del risultato: gerarchia obbligatoria
La schermata principale deve essere breve. I dettagli esistono solo come approfondimento opzionale.
Blocco
Quando appare
Esempio
Headline
Sempre
“Rocky sembra voler attirare la tua attenzione”
Sintesi
Sempre, 1–2 frasi
“Ti guarda e torna verso di te più volte, cercando di mantenere l’interazione.”
Per Rocky
Quando esiste una baseline utile
“È simile ad altri episodi che hai già confermato.”
Prova così
Quando esiste un consiglio a basso rischio
“Dedicagli qualche minuto e osserva cosa fa dopo.”
Da osservare
Se migliora la decisione
“Se va verso la porta o un gioco, salvalo: aiuta Dogly a distinguere meglio.”
Ti torna?
Sempre dopo il risultato
“Sì / Non proprio / Non so”
Approfondisci
Solo su richiesta
“Perché lo penso / Altre possibilità / Contesto considerato”

6. Context Intelligence: chiedere meno, capire di più
Il contesto è essenziale, ma non deve diventare un questionario. Dogly deve raccoglierlo automaticamente quando possibile e chiedere una sola cosa quando la risposta può cambiare materialmente l’interpretazione.
Fonte
Esempi
Regola UX
Video
persona presente, altro cane, gioco, ciotola, porta, ambiente
Nessuna domanda se osservabile
Profilo
età, taglia, razza/mix, sesso, peso
Usare solo se rilevante
Routine
passeggiate, sonno, tempo solo, socialità, attività
Rilevante soprattutto se oggi è diverso
Check-in
“oggi non è come al solito”
Portarlo nel ragionamento come dato del proprietario
Storico
episodi simili, frequenza, variazioni
Preferire baseline personale quando sufficiente
Domanda mirata
“Eravate vicino alla porta?”
Massimo una, solo se cambia davvero la conclusione

Importante
“Oggi non è come al solito” deve entrare nel motore come OWNER-REPORTED CHANGE, non restare solo un banner locale. Non è una diagnosi, ma è una informazione ad alto valore perché segnala una deviazione percepita dalla baseline.

7. Personal Baseline: il vero vantaggio di Dogly
La risposta non deve essere soltanto “cosa significa questo comportamento in generale”, ma “cosa significa oggi per questo cane”.
Stato personale
Copy consumer
Pattern riconosciuto
“È simile a comportamenti che hai già confermato quando Rocky voleva interagire.”
Variazione
“Questa volta il comportamento è diverso dal suo solito.”
Nuovo cane / pochi dati
“Sto ancora imparando il suo modo di comunicare: questa lettura si basa soprattutto su ciò che vedo ora.”
Pattern contestato
“In situazioni simili le tue risposte sono state diverse: questa volta evito una conclusione forte.”

Internamente la baseline può usare frequenza, ricorrenza, contesto, feedback, durata, intensità e contraddizioni. Al cliente basta la conclusione utile.
8. Safety & escalation
La sicurezza deve cambiare la priorità della risposta. Quando esiste un segnale di rischio, Dogly non deve “continuare a spiegare il comportamento” come se fosse una normale interpretazione.
Scenario
Risposta consumer
Tensione / possibile escalation
Prima indicazione gestionale: aumentare distanza, non forzare il contatto, non testare il cane.
Possibile disagio o dolore
Segnalare che un cambiamento nuovo o persistente può meritare valutazione veterinaria.
Paura/distress persistente
Suggerire un professionista qualificato e una gestione a basso stress.
Bassa qualità / segnali insufficienti
Astensione chiara: “Non ho abbastanza elementi. Prova un altro breve video.”

Regola di escalation
Veterinario, educatore o professionista del comportamento non devono comparire come disclaimer generico in ogni analisi. Devono apparire quando il caso lo giustifica. L’escalation deve essere una decisione del motore, non un blocco testuale fisso.

9. Feedback: trasformarlo in apprendimento utile
Il feedback deve restare semplice, ma quando l’utente dice che Dogly non ha capito, dobbiamo raccogliere un’informazione utile senza trasformare il flusso in un form.
Momento
UX
Uso interno
Dopo l’interpretazione
“Ti sembra proprio Rocky? Sì / Non proprio / Non so”
Conferma o contesta l’ipotesi
Se “Non proprio”
Mostrare 3–5 alternative pertinenti + “Altro”
Salvare correzione utile per pattern personali
Dopo un consiglio
“Ti è stato utile?”
Valutare l’efficacia del consiglio separatamente dall’interpretazione
Più avanti nel Diario
Riproporre outcome solo se il consiglio richiedeva tempo
Apprendimento differito

10. Pattern di risposta per i principali casi
La tassonomia resta interna. Il cliente riceve wording naturale. Di seguito il comportamento desiderato del composer consumer.
Caso interno
Headline consumer
Azione tipica
PLAY_INTERACTION
“Rocky sembra voler giocare con te”
Proporre interazione breve e osservare se il gioco resta fluido e reciproco.
ATTENTION_REQUEST
“Rocky sembra voler attirare la tua attenzione”
Dedicare un momento e osservare verso cosa orienta poi il comportamento.
OUTSIDE_REQUEST
“Potrebbe voler uscire”
Verificare se si dirige verso porta/guinzaglio; evitare affermazione assoluta.
ALERT_VIGILANCE
“Rocky è molto attento a qualcosa”
Individuare stimolo e osservare se torna rapidamente alla calma.
FEAR / DISCOMFORT
“Rocky sembra poco a suo agio”
Dare spazio, ridurre pressione, non forzare.
HIGH_AROUSAL
“Rocky è molto attivato in questo momento”
Ridurre intensità e offrire una situazione più calma.
FRUSTRATION
“Potrebbe essere frustrato”
Gestione a basso rischio + alternativa positiva.
RELAX_REST
“Rocky sembra tranquillo e rilassato”
Nessun consiglio se non serve; evitare over-coaching.
RESOURCE_TENSION
“Rocky sembra chiedere più spazio intorno a questa risorsa”
Non avvicinarsi/forzare; priorità alla sicurezza.
AMBIGUOUS
“Ci sono due spiegazioni possibili”
Chiedere una sola informazione se può sciogliere l’ambiguità.
INSUFFICIENT
“Non ho abbastanza elementi per capirlo bene”
Richiedere nuovo video o un singolo contesto utile.

11. Esempi di risultato V2
Esempio A — richiesta di attenzione
Rocky sembra voler attirare la tua attenzione
Ti guarda e torna verso di te più volte, cercando di mantenere l’interazione. È simile ad altri episodi che hai già confermato.Prova così: dedicagli qualche minuto e osserva cosa fa dopo. Se va verso la porta, un gioco o la ciotola, salvalo: aiuterà Dogly a distinguere meglio cosa sta chiedendo.

Esempio B — possibile tensione
Rocky sembra chiedere più spazio
Il suo corpo appare più rigido mentre qualcuno si avvicina alla ciotola e vocalizza con un ringhio.Cosa fare adesso: non insistere nell’avvicinamento e non provare a togliere la ciotola per testarlo. Se questo comportamento si ripete, salvalo nel Diario e valuta un confronto con un professionista qualificato.

Esempio C — non abbastanza elementi
Non ho abbastanza elementi per capirlo bene
Rocky è parzialmente fuori dall’inquadratura e non riesco a vedere alcuni segnali importanti. Prova un altro breve video mantenendo visibili corpo e testa. Non forzo una risposta quando l’immagine non basta.

12. Informazioni da nascondere / rendere opzionali
Informazione
Default consumer
Dove può vivere
Confidence band
Nascosta salvo bassa affidabilità rilevante
Dettaglio “Affidabilità” / audit
Evidence completa
Nascosta
“Perché lo penso” con massimo 2–3 elementi
Alternative
Nascoste
Solo se cambiano l’azione o spiegano un’ambiguità
Fonti scientifiche
Nascoste
Pagina metodologia / trasparenza, non nel risultato
Contraddizioni
Nascoste
Usate internamente per abbassare forza della conclusione
Modello/provider/token/costo
Mai
Admin / observability
Tassonomia tecnica
Mai
Backend / admin / analytics
Knowledge score interno
Mai come numero tecnico nel risultato
Profilo, tradotto in linguaggio semplice

13. Priorità di implementazione
La V2 deve essere implementata in ordine di impatto. Non serve rifare il motore di base: serve chiudere i gap di contesto e costruire il nuovo consumer composer.
Priorità
Intervento
Risultato
P0
Smettere di inviare sempre context UNKNOWN; derivare quando possibile e chiedere solo se materialmente utile.
Reasoner più pertinente
P0
Portare “oggi non è come al solito” nel contesto backend come owner-reported change.
Variazioni personali realmente considerate
P0
Nuovo consumer result contract / composer.
Cliente vede utilità, non pipeline
P1
Nascondere confidence/evidence/alternative dalla prima superficie.
UX più semplice e premium
P1
Usare personal baseline in un blocco “Per Rocky”.
Differenziazione rispetto a generica AI video
P1
Usare context_question quando serve e supportare risposta one-tap.
Ambiguità risolta con minimo attrito
P1
Quando feedback = NO, raccogliere correzione semplice.
Apprendimento supervisionato più utile
P2
Raffinare composer per intent, life stage e safety.
Wording coerente e controllato
P2
Riorganizzare Diario su pattern, cambi e ricorrenze.
Valore longitudinale percepibile

14. Acceptance criteria — quando la Behavior Intelligence V2 è pronta
Un utente può capire il risultato principale in meno di 10 secondi senza conoscere termini tecnici.
La prima schermata non mostra più confidence, tassonomia o 3–5 evidence come contenuto principale.
Dogly distingue chiaramente “simile al suo solito”, “diverso dal suo solito” e “sto ancora imparando”.
Il contesto non è sempre UNKNOWN e le domande sono limitate a quelle che cambiano davvero l’interpretazione.
“Oggi non è come al solito” entra nella decisione come informazione owner-reported.
Un safety flag modifica l’azione proposta anche se l’interpretazione primaria sembra innocua.
Se gli elementi non bastano, Dogly si astiene senza inventare un’intenzione.
Feedback su interpretazione e utilità del consiglio restano distinti.
La stessa clip può produrre una risposta consumer diversa quando cambia la baseline personale o il contesto rilevante.
Ogni consiglio consumer è breve, singolo e azionabile; il ragionamento completo resta interno.
North Star
Dogly non deve sembrare “un’AI che spiega come ha ragionato”. Deve sembrare un assistente che conosce i cani, impara Rocky nel tempo e ti dice la cosa utile nel momento giusto.

15. Governance interna e fonti
Questa specifica è allineata alla struttura attuale del motore: ObservationContract, InterpretationContract, Knowledge Registry V2, Safety Engine, Dog Context, Advice Engine, feedback e mobile result flow. Le decisioni recenti di prodotto prevalgono sulle parti storiche del Product Spec quando in conflitto.
Riferimenti interni principali:
backend/app/contracts/observation.py — osservabili strutturati e normalizzazione.
backend/app/contracts/interpretation.py — interpretazione, alternative, evidence, context question, safety.
backend/app/knowledge/retrieval.py — recupero evidenze e coverage per famiglie.
backend/app/knowledge/safety.py — safety deterministica pre-reasoner.
backend/app/providers/openai_reasoner.py — reasoner probabilistico con knowledge e contesto personale.
backend/app/domains/dog_context.py — life stage, routine, cambi, preferenze, health context.
backend/app/knowledge/data/dogly_knowledge_advice_v2.json — fonti scientifiche, card e advice policy.
apps/mobile/src/features/core/components.tsx — superficie risultato attuale da sostituire nella gerarchia informativa.
apps/mobile/src/features/behavior/upload.ts — attuale context_bucket UNKNOWN nel percorso upload.
apps/mobile/src/features/checkin/store.ts — “oggi non è come al solito” attualmente locale da portare nel motore.
Principio scientifico di riferimento: osservare segnali e contesto, evitare significati univoci da un singolo segnale, usare convergenza di evidenze, personalizzazione progressiva e astensione quando l’evidenza non è sufficiente.
END OF SPECIFICATION