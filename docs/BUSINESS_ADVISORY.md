# Note business & product — Dogly (advisory 2026-09-07)

Fonte: audit advisor indipendente su billing, retention, growth. Destinatario: PO/founder.
Contesto: app non ancora monetizzata (paywall bellissimo ma store non collegato, `app/paywall.tsx:154-162`).

## Pagella

| Area | Voto | Nota |
| --- | --- | --- |
| Free tier (3+3/mese) | 6/10 | Onesto ma manca il trial: la categoria converte con trial 7gg, non quota gratis eterna |
| Paywall (design) | 7/10 | Appare solo dopo il primo valore (rispetta il lock); Free sempre visibile, no dark pattern |
| Paywall (realtà) | 2/10 | Non collegato = zero fatturato. È il gap #1 |
| Retention | 2/10 | Solo promemoria agenda; il DailyMessageCard esiste ma è morto nel cassetto (mock, non usato) |
| Churn | 7/10 | Dati protetti a scadenza (buono); nessun win-back (manca) |
| Pricing (€9,99/mese, €89,99/anno) | 5/10 | Annuale ≈ 3x il benchmark categoria (~30$/anno); senza trial è un salto di fede; limite 1 cane a pagamento frena famiglie |
| Margini | 9/10 | Costo AI stimato €0,01-0,03/analisi vs €9,99/mese; contatore costi AI e tetti giornalieri già implementati (raro) |
| KPI/analytics | 1/10 | Solo crash (Sentry). Zero eventi prodotto: non saprete MAI perché non converte |

## Tre mosse prima del lancio

1. **Collegare RevenueCat + trial 7 giorni sull'annuale** (RevenueCat supporta trial nativo; conversione trial→paid nella categoria 15-25%).
2. **Accendere il Daily Message reale** — componente già esiste (`src/features/dailyMessage/DailyMessageCard.tsx`); serve solo un job backend che rilegge le analisi recenti del cane. È l'unico loop giornaliero.
3. **5 eventi analytics minimi**: `onboarding_completato`, `prima_analisi_riuscita`, `paywall_visto (motivo)`, `acquisto_iniziato/completato`, `D1/D7/D30`. PostHog gratis fino a volumi beta basta.

## Idee prodotto (sforzo/impatto)

- **Report settimanale "La settimana di Rocky"** (M/alto): push domenicale + card; aggrega dati già raccolti, nessuna AI nuova. Con avvisi intelligenti solo su cambi baseline (triage già deterministico).
- **Badge provenienza evidenze** (S/alto): "L'ho visto nel video / me l'hai raccontato / studi sui cani / come reagisce di solito Rocky" — le `EvidenceSource` ci sono già nel contratto. Trasparenza = differenziazione.
- **"L'ultima volta che…"** (M/alto): "l'ultima volta che abbaiava così era a Capodanno" — la memoria del suo cane, irriproducibile da Google.
- **Traguardi teneri** (S/medio): "prima osservazione digestiva!", compleanno — celebrazioni già previste da ADR-013.
- **Condivisione veterinario** (M/alto): riepilogo read-only del diario da portare in visita → credibilità + acquisizione B2B2C. Sblocca naturalmente il piano multi-cane (i vet hanno tanti pazienti).
- **Canili/rifugi** (L/alto): scheda-ricordo che viaggia con l'adozione. Da decidere entro 90gg se è IL canale (alternativa agli ads).
- **Classifica gentile vs cani simili** (L/medio): solo con volume utenti.
- **Piano Famiglia** (3 cani, +€30/anno): upsell puro, medio termine.
- **SEO dalla KB**: le 35 schede scientifiche → 35 pagine "perché il cane abbaia/mangia erba…" (M/alto a regime, matura in 3-6 mesi — avviare subito).

## Decisione da prendere entro 90 giorni

**Canale di crescita: veterinari o rifugi?** Va pilotato con 5-10 strutture reali (andare a parlare, non scrivere codice). Determina pricing, roadmap e copy dello store.
