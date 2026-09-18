# Come funziona l’IA di Dogly

Documento unico su **tutto** ciò che l’intelligenza artificiale fa (e non fa) nel prodotto. Scritto per product, design e engineering. Fonte di verità: codice backend + ADR in `DECISIONS.md`.

Ultimo allineamento: settembre 2026.

---

## 1. In una frase

Dogly **non “traduce il cane”**. Osserva un video o una foto, descrive solo ciò che è visibile/udibile, poi interpreta in modo prudente. Il testo che vede l’utente **non è scritto dal modello**: passa da contratti Pydantic, regole di sicurezza e cataloghi chiusi.

Due pipeline distinte:

| Pipeline | Input | Cosa fa l’IA | Cosa fa il codice |
|----------|--------|--------------|-------------------|
| **Comportamento** | Video 5–20 s (audio incluso) | Gemini osserva i fatti; OpenAI propone un’intenzione | Qualità, safety, knowledge, consiglio, copy utente |
| **Digestivo** | Foto delle feci | OpenAI Vision descrive l’immagine | Triage, baseline, copy utente — **nessun reasoner LLM** |

---

## 2. Principio di architettura: due cervelli, zero libertà

```
MEDIA  →  OSSERVATORE (fatti)  →  MOTORE DETERMINISTICO  →  INTERPRETE (ipotesi)  →  COMPOSER (testo utente)
```

1. **Osservatore** — vede il media. Non può dire “è felice”, “ha paura”, “vai dal vet”. Solo postura, coda, orecchie, vocalizzi, qualità ripresa, o (nel digestivo) colore, consistenza, candidati visivi.
2. **Motore deterministico** — recupera schede scientifiche, applica regole di safety, decide se la qualità è sufficiente, sceglie al massimo **un** consiglio dal catalogo.
3. **Interprete** (solo comportamento) — riceve JSON strutturato, **non il video**. Produce un’ipotesi probabilistica (`sembra / probabilmente / possibile`).
4. **Composer** — traduce tutto in italiano per l’app. Headline, confronto con la baseline, next step: template Python, non testo generato.

Il JSON grezzo di Gemini/OpenAI **non arriva mai al telefono**. Il mobile vede solo contratti curati (`BehaviorEventOut`, `DigestiveEventOut`).

Questa separazione è **LOCKED** (ADR-001, ADR-003, ADR-004).

---

## 3. I modelli in produzione

I model ID stanno in config (`OBSERVER_MODEL`, `REASONING_MODEL`, …), mai hard-coded nel dominio.

| Ruolo | Provider | Modello (prod, `vercel.json`) | Default locale |
|-------|----------|-------------------------------|----------------|
| Osservatore video | Gemini | `gemini-3.8-flash` | `mock-observer-v0` |
| Reasoner comportamento | OpenAI | `gpt-5.2` (reasoning high) | `mock-reasoner-v0` |
| Visione digestiva | OpenAI Vision | `gpt-5.2` | mock |
| Trascrizione storie vocali | OpenAI | `gpt-4o-mini-transcribe` | stesso |

In locale e in CI i provider pagati sono **mock** (fixture JSON). Staging/produzione **falliscono all’avvio** se restano i mock.

---

## 4. Pipeline comportamento — dal tasto “CAPISCI ROCKY” al risultato

### 4.1 Cosa fa l’utente

Dalla Home preme microfono o videocamera. L’app registra un clip **5–20 secondi**. L’audio del video conta: Gemini ascolta i vocalizzi insieme alle immagini. Non c’è un passaggio Whisper separato sul comportamento.

### 4.2 Upload (l’API non tocca i byte)

```
POST /v1/behavior/captures/init     → riserva quota, URL firmato
PUT  video → Supabase Storage       → diretto, senza proxy API
POST /v1/behavior/captures/{id}/complete
     → coda job "behavior_analysis"
```

La quota è atomica lato server: FREE **3 analisi comportamento + 3 digestive / mese**. Se la qualità viene rifiutata o il job fallisce in modo terminale, la quota viene **rimborsata**.

### 4.3 Macchina a stati

```
UPLOADING → QUEUED → OBSERVING → INTERPRETING → COMPLETED
                  ↘ REJECTED_QUALITY   (niente cane / ripresa inutilizzabile)
                  ↘ FAILED_RETRYABLE   (max 5 tentativi)
                  ↘ FAILED_TERMINAL
```

L’analisi è **sempre asincrona**. L’app fa polling su `GET /v1/behavior/events/{id}` e riceve una push a fine lavoro. Target timeout client: ~10 minuti.

### 4.4 Stage A — Osservazione (Gemini)

File: `backend/app/providers/gemini_observer.py`

1. Kill switch + budget giornaliero (ruolo `observer`).
2. Il worker (non il telefono) genera un URL firmato **in lettura**.
3. Scarica il video, lo carica su Gemini Files API, attende stato `ACTIVE`.
4. Chiama `generateContent` con temperature `0.2` e JSON schema chiuso.
5. Normalizza in `ObservationContract` (Pydantic). Un tentativo di repair se lo schema non torna.
6. **Cancella sempre** la copia su Gemini, anche in errore.

**Istruzione al modello (sintesi):**

> Sei un osservatore video di comportamento canino. Descrivi SOLO fatti visibili/udibili. NON inferire intenzioni, emozioni come conclusioni, o consigli. Se non è chiaro, usa `unknown` / `not_visible`. Vocabolari CHIUSI: un solo valore della lista, minuscolo, mai sinonimi.

**Output:** qualità ripresa, scena, corpo, testa/muso, orecchie, coda, vocalizzazione, timeline, `unknowns[]`. **Zero intent.**

**Cancelletto qualità:** se `overall_quality == insufficient` oppure il cane non è visibile (`dog_visible_fraction <= 0`) → `REJECTED_QUALITY`, quota rimborsata, **il reasoner non parte**.

### 4.5 Stage B — Knowledge retrieval (non è RAG)

File: `backend/app/knowledge/retrieval.py`

Match per tag sull’osservazione → fino a **6 schede** dal registry `dogly_knowledge_advice_v2.json`. Niente ricerca su PDF a runtime (ADR-012).

Calcola una **coverage** `LOW / MEDIUM / HIGH` da famiglie di segnali (corpo, coda, orecchie, vocalizzi, contesto), bonus per schede grade-A, penalità per contraddizioni. Ripresa degradata: coverage al massimo `MEDIUM`.

### 4.6 Stage C — Safety deterministica (prima del LLM)

File: `backend/app/knowledge/safety.py`

Esempi:

| Flag | Quando scatta |
|------|----------------|
| `SAFE_DISTRESS_001` | ≥2 tra corpo abbassato, freeze/ritiro, coda sotto, leccata labbra |
| `SAFE_ESCALATION_001` | rigidità + ringhio |
| `SAFE_PAIN_001` | il contesto salute del proprietario menziona dolore |

Queste flag **entrano** nel reasoner come vincoli non degradabili e vengono **rimergiate dopo**: il modello non può cancellarle né abbassarle (ADR-003).

### 4.7 Stage D — Interpretazione (OpenAI)

File: `backend/app/providers/openai_reasoner.py`

Il reasoner **non rivede il video**. Riceve solo JSON:

- osservazione, contesto, memoria personale eligibile (solo pattern consolidati)
- schede knowledge, profilo cane, flag safety, versione policy

**Istruzione al modello (sintesi):**

> Reasoner cauto per un’app consumer. Interpretazione probabilistica. Le schede scientifiche sono autorità di prodotto. I pattern personali personalizzano ma **non sovrascrivono** la safety. Lo stadio di vita e lo stile di vita sono modificatori, non cause. La conoscenza pre-addestrata, se l’osservazione non è coperta, è solo ipotesi `LOW` e **non** può inventare consigli. Astieniti se l’evidenza non basta. Non inventare fatti non osservati. Non scrivere pattern. Non creare advice. Se una sola domanda al proprietario distinguerebbe le letture, `needs_context=true` e al massimo **una** domanda in italiano.

**Output (`InterpretationContract`):**

- `primary_intent` — una di 12 intenzioni chiuse (vedi §5)
- `confidence_band` — `LOW` / `MEDIUM` / `HIGH` (mai una percentuale)
- `alternatives[]` — 0–2 alternative
- `evidence[]` — 3–5 evidenze se c’è un intent
- `contradictions[]`, `needs_context`, `context_question`, `safety_flags[]`

Post-processing nel worker:

- merge safety (vince il deterministico sulla severity)
- se coverage knowledge è `LOW` → **forza** `confidence_band = LOW`
- `build_advice()` — max **1** item da catalogo (saltato se safety urgente)
- `build_behavior_consumer()` — headline, baseline, copy safety per l’utente

### 4.8 Stage E — “Aggiungi contesto” (senza rivedere il video)

`POST /v1/behavior/events/{id}/context` riusa `observation_json` già salvato e rilancia solo reasoner + composer. **Nessuna seconda chiamata Gemini**, nessuna quota extra utente (il reasoner resta sotto budget).

### 4.9 Dopo COMPLETED — Personal Intelligence

File: `backend/app/domains/personal_engine.py`

L’IA **non scrive** i pattern di Rocky. Un motore deterministico conta ricorrenze:

| Eventi di supporto | Stato |
|--------------------|--------|
| ≥ 2 | `CANDIDATE` |
| ≥ 4 | `PRELIMINARY` |
| ≥ 8 + conferma proprietario | `ESTABLISHED` |

Solo `PRELIMINARY` / `ESTABLISHED` / `STRONG` tornano al reasoner come `eligible_memory`. Una predizione generativa ha **zero autorità** sui pattern (ADR-004).

---

## 5. Cosa può “dire” l’IA sul comportamento

Tassonomia chiusa `intent_taxonomy.v0`:

| Codice | Lettura consumer (ordine di idea) |
|--------|-----------------------------------|
| `PLAY_INTERACTION` | invita al gioco / interazione |
| `ATTENTION_REQUEST` | chiede attenzione |
| `OUTSIDE_REQUEST` | chiede di uscire |
| `ALERT_VIGILANCE` | allerta / vigilanza |
| `DISCOMFORT_AVOIDANCE` | disagio / evitamento |
| `FEAR_INSECURITY` | paura / insicurezza |
| `HIGH_AROUSAL` | eccitazione alta |
| `FRUSTRATION` | frustrazione |
| `RELAX_REST` | relax / riposo |
| `RESOURCE_TENSION` | tensione su una risorsa |
| `AMBIGUOUS` | lettura ambigua |
| `INSUFFICIENT` | evidenza insufficiente (astensione) |

All’utente **non** si mostrano di default: nome modello, ID schede, confidence numerica, tassonomie interne. Si mostra una headline probabilistica (“sembra rilassato”) più, se serve, safety e un next step.

---

## 6. Pipeline digestiva — foto feci

Stesso scheletro di upload (`/v1/digestive/fecal/init` → PUT foto → `complete`), poi job `digestive_analysis`.

### 6.1 Cosa fa l’IA

Solo **visione**. OpenAI guarda l’immagine e riempie `StoolObservationContract`:

- qualità immagine
- stima fecal score 1–7 (o `null`)
- consistenza, colore, forma, umidità
- candidati: sangue, muco, melena, materiale estraneo  
  (`none_observed` | `possible` | `clear_candidate` | `unknown`)
- `confidence_band`

**Istruzione (sintesi):**

> Osservatore visivo cauto. Non diagnosticare, non pretendere certezza da laboratorio, non prescrivere. Se non vedi sangue/muco/melena/corpo estraneo → `none_observed`, **mai** “assenza provata”. Foto sfocata/buia/ostruita → `image_quality: insufficient` e score `null`.

### 6.2 Cosa NON fa l’IA

Non c’è un secondo LLM. Tutto il resto è Python:

- `contextual_safety_flags()` — regole sul contesto (vomito, episodi 24h, cibo, storia)
- `build_digestive_intelligence()` — headline, stato, next step
- aggiornamento baseline digestiva personale

Stati di triage: `ROUTINE` → `MONITOR` → `ATTENTION` → `VET_CONTACT`.

Esempi di escalation:

- sangue chiaro o candidato melena → `VET_CONTACT`
- diarrea acquosa + ≥2 episodi/24h + vomito → `VET_CONTACT`
- sangue/melena/corpo estraneo possibile → `ATTENTION`

Copy fissa in app: *«Osservazione automatica, non diagnosi veterinaria»*, *«Una foto senza segnali evidenti non può escludere un problema»*, *«stima dalla foto, non misura di laboratorio»*.

---

## 7. Storie del proprietario (voce) — IA solo per trascrivere

Percorso: `POST /v1/dogs/{dog_id}/owner-stories/prepare-audio`

1. Audio base64 → OpenAI transcription, lingua `it` (~2.75 MB max).
2. Estrazione fatti **euristica** (frasi + keyword: HEALTH, DIET, ROUTINE, PREFERENCE, GENERAL) — **nessun LLM**.
3. Il proprietario **modifica e conferma**. Solo i fatti `OWNER_CONFIRMED` entrano nel `dog_context` dei reasoner futuri.
4. L’audio **non viene persistito**.

Le Storie in Home (rail 24h, “La tua”, Rocky) sono **contenuto social/viewer**, non analisi IA (ADR-007 / 014).

---

## 8. Cosa l’IA non tocca (oggi)

| Area | Come funziona |
|------|----------------|
| Etichetta cibo | Upload + verifica manuale del proprietario. Nessun OCR/LLM in backend. |
| Consigli | Catalogo chiuso, max 1. Il LLM non può inventarli. |
| Pattern personali | Solo Personal Engine deterministico. |
| Copy consumer | Composer Python (`behavior_intelligence.py`, `digestive_intelligence.py`). |
| Dogly Signals | POSTICIPATO (ADR-010). Nessun osservatore automatico dei suoni. |
| Messaggio giornaliero | Solo mock mobile. Nessuna route AI. |
| RAG su paper PDF | Non esiste. Solo schede taggate. |

---

## 9. Guardrail, soldi, kill switch

### Kill switch (env)

`AI_KILL_SWITCH`, `OBSERVER_KILL_SWITCH`, `REASONER_KILL_SWITCH`, `DIGESTIVE_VISION_KILL_SWITCH`, `OWNER_TRANSCRIPTION_KILL_SWITCH`

### Budget giornaliero USD (prima di ogni chiamata)

Lock advisory Postgres su `internal.ai_cost_events`. Se si sfora → `AI_BUDGET_EXCEEDED`, **nessun retry**, quota utente rimborsata.

Default (sovrascrivibili): observer $50/giorno, reasoner $50, digestivo $25, trascrizione $5.

### Altri paletti

- Media raw: TTL **24h** dopo lo stato terminale (salvo “tieni”).
- Prompt injection: il contenuto del media è **untrusted**.
- Rate limit sulle route di init.
- Cron ogni 15 min: sweep eventi bloccati (`vercel.json`).
- Retry worker: max 5.
- All’utente **mai** un numero di confidenza (O-07).

---

## 10. Cosa viene salvato

**Visibile / usato dal prodotto**

- `behavior_events` — status, intent, confidence, `observation_json`, `interpretation_json` (consumer, advice, audit knowledge)
- `fecal_events` — osservazione, intelligence, safety, score stimato
- `personal_patterns` — solo dal Personal Engine
- `owner_reported_observations` — fatti confermati
- `digestive_baselines`, ledger quote, feedback YES/NO/UNKNOWN (etichetta utile, **non** ground truth)

**Interno (service role)**

- osservazioni/interpretazioni raw, job, `ai_cost_events` (provider, model, token, `$`)
- `audit_log` — **senza** prompt raw e senza media

Quando il video/foto scade, restano gli eventi strutturati: quello è il valore prodotto.

---

## 11. Demo locale vs produzione

| | Locale / CI | Staging / Prod |
|--|-------------|----------------|
| Observer | `MockVideoObserver` + fixture | Gemini |
| Reasoner | `MockReasoner` | OpenAI |
| Digestivo | `MockDigestiveVision` | OpenAI Vision |
| Coda | in-memory | Vercel Workflows |
| Storage | mock | Supabase |

Fixture: `backend/app/providers/fixtures/`. Trigger mock qualità: `video_ref` che contiene `"nodog"` → percorso `REJECTED_QUALITY`.

L’app mobile-web con `?demo=1` usa dati UI di sviluppo: **non** è la pipeline Gemini/OpenAI.

---

## 12. Limitazioni da dire con chiarezza

1. **Non è una diagnosi** veterinaria, né comportamentale né digestiva.
2. Non vedere sangue/muco in foto **non prova** che non ci sia.
3. Lo score 1–7 è una **stima da foto**, non un esame di laboratorio.
4. Non esiste “analisi illimitata”.
5. Un singolo evento **non** crea un pattern personale.
6. Il modello **non scrive consigli**.
7. Non c’è traduzione universale dell’abbaio (Signals rimandato).
8. Non c’è ancora un eval di qualità chiuso in produzione (`docs/EVALS.md`, gate G3 aperto): i cavi sono reali, le metriche di accuratezza **non** sono ancora misurate.
9. “Aggiungi contesto” non fa rivedere il video.
10. Le storie vocali: trascrizione sì, strutturazione fatti = euristica + conferma umana.

---

## 13. Mappa file (per chi deve toccare il codice)

| Cosa | Dove |
|------|------|
| Job comportamento / digestivo | `backend/app/worker/handlers.py` |
| Gemini observer | `backend/app/providers/gemini_observer.py` |
| OpenAI reasoner | `backend/app/providers/openai_reasoner.py` |
| Visione feci | `backend/app/providers/openai_digestive_vision.py` |
| Trascrizione | `backend/app/providers/openai_transcription.py` |
| Factory provider | `backend/app/providers/factory.py` |
| Knowledge + advice | `backend/app/knowledge/retrieval.py`, `advice.py`, `safety.py` |
| Copy utente comportamento | `backend/app/domains/behavior_intelligence.py` |
| Copy utente digestivo | `backend/app/domains/digestive_intelligence.py` |
| Pattern | `backend/app/domains/personal_engine.py` |
| Budget | `backend/app/providers/budget.py` |
| Contratti | `backend/app/contracts/observation.py`, `interpretation.py`, `digestive.py` |
| Tassonomie | `backend/app/contracts/taxonomy.py` |

Documenti correlati: `ARCHITECTURE.md`, `AI_CONTRACTS.md`, `DECISIONS.md`, `DATA_MODEL.md`, `SPEC_BEHAVIOR_INTELLIGENCE_V2.md`, `EVALS.md`, `RUNBOOK.md`.

---

## 14. Flusso mentale da ricordare

```
L’utente non parla con ChatGPT.
Parla con Dogly.

Dogly:
  1. fa vedere il media a un osservatore specializzato
  2. filtra con scienza + safety scritte da noi
  3. (solo sul comportamento) chiede a un reasoner un’ipotesi
  4. decide da solo cosa si può dire, come dirlo, e se serve il vet

Se qualcosa è incerto, Dogly si astiene o chiede UNA domanda.
Se qualcosa è pericoloso, le regole vincono sul modello.
```
