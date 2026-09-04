# EVALS — Strategia di valutazione AI

Fonte: Spec V1 sez. 26 (testing/evaluation), 30 (gate G3/G6), 14 (provider routing).
Questo file descrive il **piano** di valutazione. **Nessuna valutazione reale è stata
ancora eseguita**: i provider AI attuali sono mock fixture-backed (gate G1); lo spike
con provider reali è il gate G3. Nessun dato di questa pagina è misurato finora.

Principio vincolante (sez. 26.2 release gate): nessun modello specialista, algoritmo
di pattern discovery o upgrade di modello va in produzione perché "suona più avanzato"
— solo se benchmark/eval mostra miglioramento misurabile senza regressione
inaccettabile di costo/safety.

## 1. Spike comportamentale (gate G3) — 200–300 video reali

**Dataset:**
- 200–300 video reali di cani, con copertura intenzionale di: illuminazione varia,
  morfologie diverse (taglia, orecchie, coda, muso), movimento/motion blur, con/senza
  audio, contesti diversi (bucket sez. 33.7: HOME, OUTDOORS, WALK, PLAY, FEEDING,
  DOOR_EXIT, REST, STRANGER, OTHER_DOG, VEHICLE, HANDLING, UNKNOWN).
- Etichette umane/esperte **in blind** dove disponibili; **mai** valutare per accordo
  con output AI precedenti (sez. 26.2).
- Provenienza e licenza del dataset vanno registrate qui prima dell'uso
  (vincolo dataset/licensing delle fonti scientifiche, sez. 0.1). Stato: **da
  raccogliere — nessun dataset acquisito**.

**Split dog-disjoint:**
- Qualunque componente learned (es. futura similarity/embedding dei pattern, O-08) va
  allenata/valutata con split **dog-disjoint**: nessun cane presente sia in train che
  in eval (sez. 26.2). Anche per il solo spike di provider (nessun training), lo
  split per cane resta la convenzione di reporting per evitare leakage fra slice.

**Metriche (misurare separatamente, sez. 26.2):**

| Metrica | Definizione operativa | Note |
| --- | --- | --- |
| Observation accuracy | accuratezza dell'`ObservationContract` vs etichette blind sui fatti osservabili | Misurata **separatamente** dall'interpretazione: l'observer produce fatti, non intenti (sez. 15) |
| Interpretation usefulness | utilità dell'interpretazione finale per l'utente (valutazione blind su risultato consumer) | Metrica distinta da observation accuracy; wording probabilistico e bande di confidence (O-07: niente % finché non calibrato) |
| Abstention quality | appropriatezza di AMBIGUOUS/INSUFFICIENT quando l'evidenza è debole o conflittuale | L'astensione è un risultato valido (sez. 6.1/16.1) |
| Schema failure rate | % output provider che falliscono la validazione Pydantic/allowlist | Include il path di repair singolo entro budget (sez. 22) |
| Latency | P50/P95 per stage (observer, reasoner, end-to-end) vs target sez. 27 (P50 <10 s, P95 <25 s post-upload) | Target da misurare prima di claim di marketing |
| Costo | costo provider per evento completato; P95 costo evento | Registrato in `internal.ai_cost_events` (sez. 25.1) |
| Error slices | errori segmentati per morfologia e contesto | Per individuare bias osservativi (sez. 15: morphology = variabile di osservabilità/normalizzazione) |

**Criterio di selezione provider/modello (sez. 14.2):** default al modello a costo
minimo che supera l'eval per l'operazione; escalation solo per schema failure,
ambiguità/caso high-value o policy safety. Nuovi modelli girano in **shadow
evaluation** prima dello switch di produzione. Model ID sempre in config (O-03).

**Output atteso del gate G3:** report qualità/costo/latenza + contratto finalizzato
(sez. 30). Template report: tabella per modello × metrica sopra, con slice
morfologia/contesto e decisione finale motivata.

## 2. Spike foto digestive (pre-gate G6)

**Piano (sez. 26.2):**
- Immagini controllate con **review del fecal score** (scala 1–7 come stima, mai
  misura di laboratorio — sez. 19.1).
- **Analisi esplicita dei falsi positivi** sui safety candidate: `fresh_blood_candidate`,
  `melena_candidate`, episodi watery ripetuti, peggioramento rapido (sez. 19.3).
- Invariante da verificare: un modello vision che "non vede" un'anomalia non prova mai
  l'assenza; i flag safety restano routing deterministico con copy revisionata, non
  downgradeabile da testo generato.
- Stato: **non avviato** — nessun set di immagini acquisito, nessuna misura.

## 3. Valutazione Personal Intelligence (pre-gate G5)

- Il pattern discovery (similarity/embedding) resta **infrastruttura-only in P0**
  (O-08); si abilita dietro feature flag solo se l'eval dimostra che non amplifica gli
  errori (sez. 17.4).
- Evidenza richiesta a G5: test anti-feedback-loop, contest/decay/recalc dei pattern
  (sez. 30).
- Split dog-disjoint obbligatorio per qualunque componente learned (sez. 26.2).

## 4. Registro delle valutazioni

| Data | Valutazione | Dataset (provenienza/licenza) | Modello/versione | Risultati | Decisione |
| --- | --- | --- | --- | --- | --- |
| — | Nessuna valutazione eseguita finora | — | provider mock (fixture) | — | — |

Ogni riga futura deve includere provenienza e licenza del dataset, versione esatta del
modello (config, non codice), metriche della sez. 1/2 e la decisione presa con link al
report. Paid evaluation è separata dalla CI, budgeted ed esplicitamente triggerata
(sez. 0.2/26.2).
