# DECISIONS — Architecture Decision Records e registro decisioni

Fonte di precedenza (Spec V1 sez. 0.1): Spec V1 > Master Blueprint V4 > Product Spec V2
> Unit Economics V1 > ricerca scientifica. Le decisioni **LOCKED** si implementano come
scritte; solo il Product Owner può riaprirle. Questo file registra ADR con data e
razionale, e le decisioni ancora aperte (O-01…O-09) **senza inventare risoluzioni**.

## ADR

### ADR-001 — Stack tecnologico LOCKED (Spec V1)

- **Data:** 2026-09-04 • **Autorità:** Product Owner (Spec V1 sez. 2) • **Stato:** LOCKED
- **Decisione:** Mobile React Native + Expo + TypeScript (Expo Router, TanStack Query,
  React Hook Form + Zod, Expo SQLite/SecureStore); backend Python 3.12+ FastAPI +
  Pydantic v2; DB Supabase PostgreSQL (migrazioni SQL uniche, SQLAlchemy 2 async via
  pooler, no ORM migrations); Auth Supabase (Apple/Google/email, JWT validato da
  FastAPI); Storage Supabase privato con signed URL diretti (API mai proxy di banda);
  observer Gemini e reasoner OpenAI **via adapter** (model ID in config, mai
  hard-coded); billing RevenueCat; notifiche Expo Push; Sentry/PostHog raccomandati
  dietro wrapper; CI GitHub Actions + EAS.
- **Vincoli espliciti:** NO Capacitor, NO Flask; nessun segreto nel mobile; chiamate AI
  pagate mockate in CI.

### ADR-002 — Hosting Vercel + Vercel Workflows (SPEC_AMENDMENT_V1.1)

- **Data:** 2026-09-04 • **Autorità:** Product Owner (riapre esplicitamente la decisione
  LOCKED della Spec V1 sez. 2/8) • **Stato:** LOCKED (vigente, sostituisce Spec V1)
- **Decisione:**
  - Hosting: **Vercel** — FastAPI deployato su Vercel Python runtime / serverless
    functions (al posto di Google Cloud Run public API + private worker).
  - Async processing: **Vercel Workflows** — job asincroni durevoli, retryable,
    push-based (al posto di Cloud Tasks → Cloud Run worker).
  - Secret management: **Vercel Environment Variables** (classi di segreti Spec V1
    sez. 4.2 invariate: niente segreti nel mobile, chiavi provider solo server-side).
  - Invariati: Supabase (DB/Auth/Storage), mobile Expo, provider AI via adapter,
    RevenueCat, EAS.
  - Cloud Run / Cloud Tasks: **non usati in V1** — mantenuti solo come *future scaling
    path* documentato.
- **Rationale:** la coda resta dietro l'interfaccia `JobQueue` (Spec V1 sez. 8.3);
  l'implementazione V1 è l'adapter Vercel Workflows
  (`backend/app/providers/vercel_workflows.py`). L'**architettura resta migrabile**:
  un futuro passaggio a Cloud Tasks/Run richiede solo un nuovo adapter `JobQueue`,
  senza refactor del dominio. La separazione public API / private worker resta
  concettuale: route pubbliche `/v1/*` (JWT) vs route interne `/tasks/run` protette da
  `x-internal-token`, senza ingress pubblico logico.
- **Conseguenze:** `infra/cloudrun/` → `infra/vercel/`; staging = preview deployments
  Vercel; production = deploy manuale gated; guardrail di costo = limiti di
  concorrenza/spending Vercel + budget provider AI con kill switch (obiettivi Spec V1
  sez. 27 invariati). Guardrail nel codice: nessuna dipendenza GCP in V1 (test
  `test_job_queue.py`).

### ADR-003 — Contratti canonici e confini provider

- **Data:** 2026-09-04 • **Autorità:** Spec V1 sez. 3.1 / 14.1 • **Stato:** LOCKED
- **Decisione:** FastAPI/Pydantic è la source of truth dei contratti API pubblici
  (OpenAPI esportato in CI, snapshot `docs/openapi.json`, drift = fallimento CI);
  i contratti delle risposte provider sono modelli Pydantic backend-only (il JSON grezzo
  Gemini/OpenAI non diventa mai contratto mobile); lo schema DB è controllato solo da
  migrazioni Supabase SQL; tassonomie/status in costanti/tabelle versionate. Interfacce
  provider `VideoObserver` / `Reasoner` / `DigestiveVision` / `PersonalEngine` /
  `CostMeter` / `StorageProvider` / `JobQueue` sostituibili (dettagli in
  `docs/AI_CONTRACTS.md`).

### ADR-004 — Personal Intelligence firewall anti-feedback-loop

- **Data:** 2026-09-04 • **Autorità:** Spec V1 sez. 17 • **Stato:** LOCKED
- **Decisione:** una predizione del modello non è mai "ciò che Rocky fa": separazione
  delle fonti (observer = evidenza, reasoner = ipotesi, owner = etichetta utile non
  ground truth, outcome osservato = evidenza indipendente); gli update dei pattern
  passano solo da un servizio deterministico di Personal Intelligence; la predizione
  generativa ha **zero autorità** sui pattern (release blocker P0, Spec V1 sez. 31.2);
  precedenza evidenza: video corrente → contesto → policy generale → memoria personale
  eligibile.

### ADR-005 — Subscription senza "unlimited" e quota atomica server-side

- **Data:** 2026-09-04 • **Autorità:** Spec V1 sez. 21 / 7.3 • **Stato:** LOCKED
- **Decisione:** FREE 3+3 analisi/mese, PREMIUM €9.99/mese o €89.99/anno 30+30/mese;
  nessun usage illimitato; entitlement server-side (mirror RevenueCat + usage ledger);
  riserva quota atomica lato DB prima del job, refund solo per rejection qualità o
  fallimento tecnico terminale; nessun rollover.

### ADR-006 — Dogly Daily Check-in (owner signals + baseline personale)

- **Data:** 2026-09-05 • **Autorità:** Product Owner • **Stato:** LOCKED (UX V1.1, rivisto 2)
- **Decisione:**
  - Modal all’apertura app (poi sparisce): “Come ti sembra {nome}?” con
    “Sembra sereno” / “Non come al solito” (niente bene/male secco in Home).
  - Se non come al solito → CTA “Fai un video” o “Guarda la digestione”.
  - Contesto salvato → capture/result personalizzati.
  - Risultato analisi: headline probabilistica, confidenza a banda,
    sezione “Perché?” con evidenze e feedback a tre vie.
- **Rationale:** immediatezza emotiva + utilità clinica soft senza questionario.

### ADR-007 — Accesso alle storie dalla Home

- **Data:** 2026-09-05 • **Autorità:** Product Owner • **Stato:** SUPERSEDED da ADR-014
- **Decisione:**
  - Non mostrare il Knowledge Score nelle superfici principali Home/Profilo.
  - Tab primarie: Home / Fotocamera / {nome cane}; Diario raggiungibile dalla Home.
  - Le storie si vedono nei cerchi in alto nella Home e si scorrono nel viewer.
  - La tab Fotocamera permette scatto o scelta dalla galleria; la storia dura 24h
    ed è separata dagli album.
- **Rationale:** rendere immediati sia la creazione sia il punto di accesso alle
  storie, senza superare il limite di tre tab.

### ADR-008 — Flusso digestivo orientato all’utente

- **Data:** 2026-09-05 • **Autorità:** Product Owner • **Stato:** LOCKED (UX V1.1)
- **Decisione:**
  - Capture con foto reale, anteprima e tre indicazioni visive brevi.
  - Processing ridotto allo stato corrente, senza step tecnici esposti.
  - Risultato con sintesi, confronto personale e metriche essenziali.
  - Mostrare soltanto candidati rilevanti; safety flag deterministici sempre
    prioritari.
  - Disclaimer breve nel flusso; testo esteso nelle policy.
- **Rationale:** rendere l’osservazione digestiva comprensibile e utilizzabile
  senza trasformarla in un referto o in una schermata tecnica.

### ADR-009 — Agenda salute e promemoria contestuali

- **Data:** 2026-09-05 • **Autorità:** Product Owner • **Stato:** LOCKED (UX V1.1)
- **Decisione:**
  - L'Agenda vive nel profilo del cane, dentro Benessere; non è una quarta tab.
  - Home mostra solo appuntamenti entro sette giorni.
  - Creazione guidata con categorie e valori già selezionati: visita,
    giorno successivo alle 10:00 e promemoria un giorno prima.
  - Il permesso OS viene richiesto al primo promemoria, non durante onboarding.
  - Gli eventi sono owner-scoped, persistiti in `care_events` e disponibili
    via API versionata; completamento o eliminazione annullano il reminder.
  - Campanella e preferenze notifiche sono superfici distinte.
- **Rationale:** dare utilità quotidiana senza appesantire navigazione e
  onboarding, mantenendo il controllo del promemoria sempre esplicito.

### ADR-010 — Dogly Signals: mappa sonora personale

- **Data:** 2026-09-05 • **Autorità:** Product Owner • **Stato:** POSTPONED
- **Decisione:**
  - Dogly Signals non è un traduttore uomo-cane e non attribuisce parole a un
    abbaio o a un segnale.
  - La promessa è personale e osservabile: Dogly aiuta a conoscere il modo in
    cui quel cane risponde a segnali sonori selezionati.
  - Categorie V1 consumer-safe: gioco, attenzione, curiosità, contatto.
    Disagio, minaccia e segnali agonistici restano fuori dalla V1.
  - Ingresso rapido in Home, accanto alle capacità secondarie, senza diventare
    una quarta tab. Mappa completa nel profilo del cane.
  - Copy Home: “Conosci il suo modo di rispondere” + “Un esperimento semplice,
    personale, guidato da Dogly.”
  - Feedback a tre vie “Sì / No / Non saprei”; il risultato salva solo
    reazioni osservabili nella mappa personale del cane.
  - Il telefono riproduce il segnale automaticamente dopo una baseline breve;
    il tap “Ha reagito” misura il tempo di risposta.
  - Nessun risultato AI viene simulato: un osservatore video automatico potrà
    essere aggiunto solo con un provider reale validato.
- **Rationale:** rendere Dogly più identitario e monetizzabile senza false
  certezze: misuriamo comportamenti visibili e progressivi, non significati
  universali inventati.
- **Aggiornamento 2026-09-05:** servizio sospeso per evitare complessità e una
  libreria sonora non ancora validata. Home, Profilo e deep link non lo
  espongono; eventuale riattivazione richiede una nuova decisione prodotto.

### ADR-011 — Admin Control Center web (V0)

- **Data:** 2026-09-05 • **Autorità:** Product Owner • **Stato:** LOCKED
- **Decisione:**
  - Console web interna in `apps/admin/`: Next.js 15 + TypeScript + npm,
    app standalone, deploy come progetto Vercel separato.
  - Dati via read-model dedicati: mock tipizzati in V0, poi endpoint `/v1/admin/*`
    con RBAC server-side (6 ruoli previsti).
  - Brand Dogly (design token in `app/globals.css`, logo mark condiviso).
  - Nessuna modifica al backend consumer in questa fase; security boundary:
    niente service-key nel browser, azioni privilegiate solo server-side,
    audit append-only.
- **Rationale:** governance di business, utenti, AI, costi e privacy su una
  superficie dedicata, senza toccare l'app consumer né il suo backend; il
  read-model separato consente di introdurre RBAC e audit senza accoppiamento.
- **Riferimenti:** `docs/ADMIN_CONTROL_CENTER.md` (route map, fasi, ruoli).

### ADR-012 — Knowledge Base scientifica + Advice Engine V2 come fonti registrate

- **Data:** 2026-09-06 • **Autorità:** Product Owner • **Stato:** LOCKED
- **Decisione:**
  - Le fonti scientifiche V1/V2 sono copiate in `docs/kb/` e fungono da
    "Scientific / Dataset Intelligence research" (fonte n.5 della gerarchia
    Spec V1 sez. 0.1): KB V1 (35 knowledge card, evidence registry, dataset e
    licenze) + Advice Engine V2 (DogContextSnapshot, life stage, lifestyle,
    catalogo consigli, outcome learning).
  - **Tassonomia: confermata quella del repo** — `backend/app/contracts/taxonomy.py`
    (12 IntentCode) resta la source of truth; le label concettuali della
    ricerca non la sostituiscono (brief V2 sez. 6). Chiude il potenziale
    conflitto tassonomia KB vs Spec 16.2.
  - Retrieval KB strutturato e limitato (card, tag-based); **nessun RAG runtime
    su PDF** in V1 (coerente con Spec sez. 1.2 out-of-scope).
  - Consigli consumer: max 1 per risultato, azione dal catalogo (mai inventata
    dall'LLM), priorità safety > vet > gestione; outcome feedback owner come
    evidenza personale, non verità scientifica.
  - Dataset con licenza CC BY-NC/NC-SA (DogFLW, DogSpeak): solo
    ricerca/benchmark, **mai training commerciale** senza licenza separata.
  - Implementazione: brief repo-aware in `docs/kb/CURSOR_IMPLEMENTATION_BRIEF_*.md`
    (moduli `backend/app/knowledge/`, `domains/dog_context.py`, 2 migrazioni,
    API lifestyle/advice; UX mobile: profiling progressivo, card "Cosa puoi fare
    adesso", outcome "Ti è sembrato utile?").
- **Rationale:** smettere di affidare la conoscenza cinofila al pretraining dei
  provider: le card scientifiche versionate diventano l'evidenza autorevole di
  prodotto; il provider resta solo generatore di ipotesi per i casi scoperti.

### ADR-013 — "Piacevole per tutti": linguaggio, delight e accessibilità come requisiti

- **Data:** 2026-09-06 • **Autorità:** Product Owner • **Stato:** LOCKED
- **Decisione:**
  - **Linguaggio**: frasi corte, app in prima persona ("Sto guardando Rocky…"),
    zero gergo. Vietato: "confidenza", "arousal", "errore del server",
    percentuali. Consentito: "Ne sono abbastanza sicuro", "è molto eccitato",
    "Non ci sono riuscito — riprova, non hai speso nulla". Test di accettazione:
    ogni schermata comprensibile a un ragazzino di 12 anni. L'astensione è
    presentata come cura ("non ho abbastanza elementi, mostramelo meglio"),
    mai come fallimento.
  - **Delight voluto**: icone disegnate (`CuteIcon`), micro-animazioni on-brand
    (attesa analisi "viva" col cane che osserva, niente spinner nudi),
    celebrazioni dei momenti del cane (compleanno, traguardi di conoscenza).
  - **Share card branded**: la condivisione del risultato è una card grafica
    con foto del cane, risultato in linguaggio semplice e logo Dogly — asset di
    marketing organico ("Guarda cosa ha capito Dogly del mio cane"). Mai raw
    media, mai dati tecnici.
  - **Accessibilità = piacevolezza per tutti**: dynamic type, contrasto
    leggibile all'aperto, target ≥44pt, mai affidarsi solo al colore per gli
    stati, nessuna gesture nascosta (tutto raggiungibile con un tap visibile).
  - **Free tier completo in qualità, limitato in quantità**: la prima analisi
    gratis è l'esperienza piena (coerente con ADR-005 e paywall mai prima del
    primo valore).
- **Rationale:** il target sono proprietari di cani non tecnici (tutte le età);
  la semplicità calda e l'onestà sono il livello di servizio e il
  differenziale di brand.

### ADR-014 — Enterprise UX V5.1 e navigazione consumer

- **Data:** 2026-09-07 • **Autorità:** Product Owner • **Stato:** LOCKED
- **Decisione:**
  - Tab primarie: Home / Diario / Profilo.
  - Fotocamera Storie raggiungibile dalla `StoriesRail`; capture behavior dalla
    CTA “Capisci {nome}”.
  - Palette esclusivamente dai token Dogly correnti.
  - Foto reali del cane nelle superfici personali; illustrazioni Dogly per
    onboarding, istruzioni, attese ed empty state.
  - Reference V5 fedele per gerarchia e proporzioni, non per duplicazioni,
    pulsanti privi di funzione o dati non disponibili.
  - Risultati e flussi ridotti al minimo senza rimuovere safety, error handling,
    retry, offline, quota o accessibilità.
- **Rationale:** rendere il valore di Dogly immediato e personale, mantenendo
  complessità e dettagli tecnici fuori dalla superficie consumer.
- **Riferimento:** `docs/ux/DOGLY_UX_V5_1_DECISIONS.md`.

### ADR-015 — Digestive Intelligence V2

- **Data:** 2026-09-07 • **Autorità:** Product Owner • **Stato:** LOCKED
- **Decisione:**
  - La foto è una fonte; il risultato combina osservazione, contesto,
    alimentazione, baseline personale, andamento e triage.
  - Observer, normalizzazione, context builder, baseline, knowledge retrieval,
    safety/triage, reasoner e consumer composer restano separati.
  - Triage interno deterministico: `ROUTINE`, `MONITOR`, `ATTENTION`,
    `VET_CONTACT`; l'AI generativa non può scegliere o attenuare escalation.
  - Il consumer vede cosa cambia, poche osservazioni, confronto personale e una
    sola azione. Score, confidence e audit restano interni.
  - Nessuna diagnosi, prova di assenza o causalità da semplice correlazione.
- **Rationale:** trasformare la funzione da classificazione fotografica a
  memoria digestiva personale, prudente e utilizzabile.
- **Riferimento:** `docs/ux/DOGLY_UX_V5_1_DECISIONS.md`.

### ADR-016 — “Raccontami” e provenienza owner-reported

- **Data:** 2026-09-07 • **Autorità:** Product Owner • **Stato:** LOCKED
- **Decisione:**
  - L’ingresso vive in Home con priorità secondaria forte, dopo l’ultima
    analisi e prima degli strumenti.
  - Il proprietario può parlare o scrivere; l’audio breve viene trascritto e
    non viene persistito.
  - I fatti estratti sono modificabili ed eliminabili e diventano durevoli
    solo dopo conferma esplicita.
  - Ogni fatto conserva provenienza `OWNER_REPORTED`, non sovrascrive dati
    verificati e non diventa automaticamente un pattern personale.
- **Rationale:** raccogliere conoscenza utile sul cane senza confondere una
  dichiarazione del proprietario con un’osservazione AI o una verità
  scientifica.
- **Riferimento:** `docs/ux/DOGLY_UX_V5_1_DECISIONS.md`.

## Decisioni aperte (Spec V1 sez. 32) — NON inventare risoluzioni

| ID | Decisione | Si può codificare? | Regola vigente |
| --- | --- | --- | --- |
| O-01 | Brand/app display name e bundle/package ID di produzione finali | Sì | **Chiuso per V1 product brand: Dogly** (`com.attilalab.dogly` su Expo). Store listing copy legale resta in O-02. |
| O-02 | Wording finale legale/privacy/disclaimer medico | Sì | Slot di copy versionati, architettura consensi e template safety; copy legale bloccato prima del public release. |
| O-03 | Model ID esatti OpenAI/Gemini | Sì | Selezione via config dopo lo spike (G3); nessun hardcoding. |
| O-04 | Vendor analytics/feature-flag finale | Sì | Raccomandati PostHog + Sentry; interfacce wrapper mantengono sostituibilità. |
| O-05 | Durate finali di retention dei raw media | Sì | **Beta V1: 24h dal completamento terminale** (config `raw_media_ttl_hours`); keep/research consent esplicito resta. |
| O-06 | Upload da galleria per behavior post-launch | Sì | Non implementare nella V1 iniziale. |
| O-07 | Percentuale numerica di confidence | Sì | Non shippare percentuali fino al calibration gate; usare bande Low/Medium/High. |
| O-08 | Algoritmo di similarity/embedding dei pattern | Sì | Solo infrastruttura in P0; abilitare discovery dopo eval. |
| O-09 | Multi-dog / family tier | Sì | Schema già compatibile; il piano V1 limita a 1 cane attivo. |

> Qualunque elemento non deciso e non presente in questo registro va marcato
> **OPEN** nei documenti operativi e riportato qui — mai risolto per congettura
> (Spec V1 sez. 0.1 conflict rule).
