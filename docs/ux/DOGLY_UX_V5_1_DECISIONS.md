# Dogly UX V5.1 — decisioni esecutive

Data: 2026-09-07
Stato: source of truth per l'implementazione consumer

Questa integrazione riconcilia:

- `Dogly_Enterprise_UX_Master_Implementation_Spec_V5_Cursor.docx`;
- le 15 reference incorporate nella V5;
- la reference a 8 schermate della nuova Digestive Intelligence;
- il comportamento reale del repository.

## Ordine delle fonti

1. Questo documento decide conflitti, semplificazioni e comportamento.
2. Le reference decidono gerarchia, proporzioni e linguaggio visivo.
3. `apps/mobile/src/theme/tokens.ts` decide tutti i colori.
4. Il codice reale decide dati, safety e flussi da preservare.

“Fedele alla reference” significa fedeltà alla gerarchia e alla composizione,
non copia cieca di pulsanti, schermate duplicate o informazioni non supportate.

## Regole non negoziabili

- Nessuna nuova palette: restano i token Dogly correnti.
- Foto reale del cane per identità, Home, Profilo, risultati e Diario quando
  realmente disponibile.
- Illustrazioni Dogly per onboarding, istruzioni, attese ed empty state.
- Mai usare foto stock di un cane diverso come se fosse il cane dell'utente.
- Nessun dato mock in real mode per ottenere la grafica.
- Nessun termine tecnico nella superficie consumer: provider, modello, AI,
  confidence, baseline, schema, contract, taxonomy, retrieval e score restano
  interni.
- La UI non mostra una certezza che foto, video o dati non possono sostenere.
- Safety, accessibilità, errori, retry, offline, quota e idempotenza prevalgono
  sempre sull'estetica.

## Navigazione

La decisione V5.1 sostituisce ADR-007 per la tab bar consumer:

1. Home
2. Diario
3. Profilo

La route Fotocamera resta disponibile per creare Storie dalla `StoriesRail`,
ma non occupa una tab primaria. Il video comportamentale parte dalla CTA
“Scopri i segnali di {nome}”. Digestione e voce restano capacità secondarie.

## Riduzione delle schermate

- Behavior result e “Dettaglio analisi” sono una sola route con sezioni chiuse.
- “Le analisi” e “Diario/Ricerca” usano una sola lista compatta e un solo
  dataset.
- Routine intro e categorie diventano un solo ingresso facoltativo; nessuna
  completion consumer.
- Voice usa due momenti: registra/scrivi, poi controlla e conferma.
- Digestione usa capture, processing e result. Contesto, significato e azione
  non diventano schermate obbligatorie separate.
- Gli eventi Behavior e Digestive sono salvati automaticamente nel Diario:
  non mostrare CTA “Salva nel Diario”.

## Home

Ordine:

1. header reale;
2. `StoriesRail`;
3. identità visuale del cane;
4. CTA dominante “Scopri i segnali di {nome}”;
5. ultima analisi;
6. accesso compatto “Dimmi qualcosa di {nome}”;
7. strumenti realmente utili e non duplicati.

Se Diario è una tab non viene duplicato negli strumenti. Quota normale,
completion delle routine e nag persistenti non occupano la superficie.

## Risultato comportamentale

Prima vista:

- foto del cane o media realmente disponibile;
- una headline probabilistica;
- sintesi breve;
- un solo consiglio controllato;
- feedback a tre vie;
- condivisione.

Evidence, alternative e contesto contributivo vivono in un unico
“Approfondisci”, chiuso di default. L'outcome del consiglio viene chiesto più
tardi, non appena appare il risultato.

## Diario

Una sola vista compatta, raggruppata temporalmente, con filtri consumer:

- Tutte;
- Comportamento;
- Digestione.

Ricerca, miniature o media preview si mostrano solo quando supportati da dati
reali e URL sicuri. Nessun ID, stato tecnico, provider o tassonomia grezza.

## Profilo e Routine

Il Profilo è una pagina personale, non una dashboard AI. Contiene identità,
informazioni di base, Salute, preferenze, Routine opzionale, foto/momenti,
note personali e impostazioni.

Routine:

- può restare vuota;
- non mostra “2 di 5”, “incompleto” o “completato”;
- non torna come nag dopo “Non ora”;
- usa i dati Nutrizione reali senza duplicarli.

## Dimmi qualcosa di {nome}

La voce raccoglie dichiarazioni del proprietario; non analizza il comportamento
dal solo audio.

Flusso:

1. registra oppure scrivi;
2. trascrivi ed estrai fatti strutturati;
3. mostra card modificabili/eliminabili;
4. salva solo dopo conferma.

Ogni fatto persistito mantiene provenienza `OWNER_REPORTED`. Non sovrascrive
alimentazione verificata e non diventa automaticamente `PERSONAL_PATTERN`.
L'audio raw usa retention minima e non diventa memoria permanente.

## Digestive Intelligence V2

Il consumer vede solo:

1. cosa cambia oggi rispetto al solito del cane;
2. massimo tre osservazioni rilevanti;
3. confronto personale oppure dichiarazione che non è ancora disponibile;
4. una sola azione e cosa monitorare;
5. una domanda facoltativa solo se può cambiare il triage.

Fecal score, reliability, observation tecnica, riferimenti, versioni e
provenienza restano nel motore o in un dettaglio strettamente necessario.

Il confronto personale richiede una baseline sufficiente e versionata. Se non
esiste, Dogly dice che sta imparando il normale del cane.

Il triage interno è deterministico:

- `ROUTINE`;
- `MONITOR`;
- `ATTENTION`;
- `VET_CONTACT`.

L'AI generativa non sceglie e non attenua l'escalation. Razza, stagione,
temperatura, alimento e coincidenze temporali sono contesto, non cause.

Copy vietato:

- “tutto regolare” senza qualificazione;
- “sangue non rilevato” come prova di assenza;
- “questo alimento ha causato”;
- diagnosi o promessa di sostituire il veterinario.

Copy preferito:

- “non evidente nella foto”;
- “rispetto alle osservazioni recenti”;
- “coincide nel tempo, ma non indica da solo una causa”;
- “controlla la prossima evacuazione”.

Disclaimer minimo:

> Questo aiuta a osservare i cambiamenti e non sostituisce il veterinario.

## Gate di rilascio

- Nessun flusso reale regredisce.
- Test mobile/backend e OpenAPI verdi.
- Stati insufficient/offline/error/retry verificati.
- Screenshot per ogni reference su web e Android.
- Nessun mock in real mode.
- Regole di triage e copy sanitario revisionati prima del rilascio clinico
  definitivo.

## Vincoli strutturali (addendum audit 2026-09-07)

Aggiunti dopo audit indipendente: vincoli "sotto la superficie" che il redesign
non deve cancellare. Hanno la stessa forza dei vincoli UX.

1. **Diario con lista virtualizzata.** Le timeline del Diario e la griglia
   album/storico DEVONO usare FlatList/SectionList/FlashList (windowing), mai
   ScrollView che monta tutti gli elementi: il Diario cresce ogni giorno e con
   100+ card visive V5 una ScrollView rende scroll e apertura a scatti. Criterio
   di accettazione: scrolling fluido con 300+ elementi caricati.
2. **Contrasto WCAG AA sui token.** "Contrasto basato sui token correnti" vale
   solo se il token supera 4,5:1 per il testo. `textMuted` (#94A3B8, ~2,9:1) NON
   è conforme: va alzato (es. #64748B, già `textSecondary`) per tutto il testo;
   il grigio chiaro resta solo per icone decorative. Da fare nello stesso lavoro,
   non dopo.
3. **Robustezza come definition of done.** Oltre a test e screenshot:
   (a) nessuna schermata resta in caricamento infinito per errore di rete —
   timeout esplicito (10–15s) e stato di errore con retry sulle chiamate API;
   (b) un errore di rendering in una schermata non deve chiudere l'app — Error
   Boundary con schermata di recupero; (c) il drain della coda upload riprende da
   solo al ritorno della rete (senza chiudere/riaprire l'app).

Note di coordinamento: i vincoli 1-3 sono già tracciati come task in
`docs/MOBILE_TASKS.md` (sez. fluidità/rete/stabilità); questo addendum li porta
dentro il perimetro del lavoro V5 così si chiudono insieme al redesign invece
che dopo. Le attività di sicurezza/GDPR (callback OAuth, retention cron, rate
limiting) restano in `docs/CURSOR_BACKEND_TASKS.md` e NON sono in scope UX.
