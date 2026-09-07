# AUDIT GAP FUNZIONALE — Dogly mobile (ogni tasto, funzione, flusso)

**Data:** 2026-09-05 • **Metodo:** audit statico read-only di ogni elemento interattivo, dalla prima pagina (welcome) al login, onboarding, Home, storie, capture/analisi, diario, digestione, nutrizione, profilo, impostazioni, paywall, care, album, notifiche, patterns • **~280 elementi auditati**

> **STORICO / SUPERATO (2026-09-07).** Questo documento fotografa il
> 2026-09-05 e non rappresenta lo stato corrente. Cinque dei sei blocker
> originali risultano chiusi nel codice; per stato e rischi aperti usare
> `PROJECT_STATE.md` e `docs/CURSOR_BACKEND_TASKS.md`.

Legenda: ✅ reale · 🟡 mock atteso (documentato) · 🟠 mock pericoloso (sembra vero, non lo è) · 🔴 rotto/vicolo cieco · ⚪ mancante vs spec

## Totale generale

| ✅ | 🟡 | 🟠 | 🔴 | ⚪ |
|---|---|---|---|---|
| ~164 | ~33 | ~58 | ~11 | ~14 |

Buone notizie: **nessuna navigazione punta a route inesistenti** (unica eccezione funzionale: photo viewer dal profilo), auth reale completa, onboarding esemplare, pipeline upload SQLite di livello produzione, disciplina contratti UX (band, mai %, safety copy).

---

## 🔴 ROTTO / VICOLI CIECHI (da fixare subito)

1. **Il Diario non riceve mai dati veri** — analisi completate via API non appaiono mai; aprire un id reale nel dettaglio dà "Episodio non trovato". Le CTA "Torna al Diario" promettono qualcosa che non esiste. (`(tabs)/diary.tsx`, `diary/event/[eventId].tsx:24`)
2. **Flusso digestivo interamente simulato** — qualsiasi foto → sempre lo stesso risultato "tutto regolare" dopo 800ms. Feature salute: falso negativo garantito. Lo stato `upload_failed` è irraggiungibile (try/catch su un setTimeout). (`digestive/capture.tsx:32-41`)
3. **Redirect mock hardcoded** — processing behavior porta sempre a `evt-play` dopo ~5s: le schermate REJECTED_QUALITY/FAILED_TERMINAL/FAILED_RETRYABLE non sono demo-abili. (`behavior/processing/[eventId].tsx:67`)
4. **Preview foto profilo → "Foto non trovata"** — manca `albumId` nel push dal profilo Rocky. (`rocky.tsx:169`)
5. **"Mostra eventi precedenti" non tappabile** — Chip senza onPress, sembra un bottone. (`(tabs)/diary.tsx:183`)
6. **Route orfane**: `/patterns` (nessun ingresso; il flag `PATTERNS_ENABLED` citato nel mock non esiste), `dogs/[dogId]/knowledge` (nessun ingresso). `DailyMessageCard` interamente morta, con "Salva nel diario" no-op.
7. **Notifiche care mai cablate** — `configureCareNotifications`/`subscribeToCareNotificationResponses` mai chiamate: tap sul promemoria non apre nulla. (già H-8 audit enterprise)

## 🟠 MOCK PERICOLOSI (l'utente crede, il sistema no)

1. **Quota analisi in Home finta anche in produzione** — sempre "1 analisi rimasta"; il gate paywall della CTA si basa su dati statici. Blocca il modello di business. (`home.tsx:44`, `mocks/core.ts:46-52`)
2. **Feedback 3-vie fail-silent** — offline/errore → badge "Salvato" mostrato comunque, nulla persistito, nessun retry. (`features/core/feedback.ts:36-39`)
3. **Switch consensi privacy non salvano nulla** — solo stato locale, nessuna API consensi. Rischio compliance GDPR. (`settings/privacy.tsx:71-78`)
4. **Preferenze notifiche placebo** — "salvate subito" è falso (in-memory); 4 switch su 6 non governano alcun invio. (`settings/notifications.tsx`)
5. **"Registrati con email" non registra** — porta a un login password; nuovo utente col ramo password è in un vicolo logico. (`welcome.tsx:91` → `sign-in.tsx`)
6. **"Ti avviso quando il risultato è pronto"** — nessuna notifica schedulata. (`behavior/processing/[eventId].tsx:189`)
7. **Edit profilo in demo: "Salva" non salva** — solo router.back, modifiche perse senza feedback. (`dogs/[dogId]/edit.tsx:169-188`)
8. **"Elimina account" in demo mente** — mostra "eliminazione avviata, accesso revocato" mentre l'utente è ancora loggato. (`settings/privacy.tsx:254-257`)
9. **Abbonamento: fallback silenzioso a Free** — errore rete → utente Premium vede "Piano Free" + usage finti senza errore. (`settings/subscription.tsx:35`)
10. **"Conferma e attiva" cibo non persiste** — dichiara attivazione ma è solo setState. (`nutrition/foods/[foodId]/verify.tsx:187`)
11. **Check-in placebo** — "Sembra sereno" senza effetto osservabile; frequenza/smart reminders mai letti dal modal; "Guarda la digestione" perde il contesto (`from=checkin` ignorato). (`features/checkin/*`)
12. **Home statica in produzione** — "Ultima analisi" sempre "sembra rilassato 09:30"; banner "analisi in corso" e card cold-start nuovo utente mai visibili (hardcoded). (`mocks/core.ts:251-252`)
13. **Retake dopo errore upload lascia il video in coda SQLite** — al prossimo resume parte l'upload di un video che l'utente credeva scartato. (`behavior/capture.tsx:188-194`)
14. **Quota digestiva mai applicata; gate behavior bypassabile** via deep-link a `/behavior/capture`; rifiuto server per quota → generico "Upload non riuscito" invece del paywall. (ADR-005)
15. **Stato offline Home irraggiungibile in produzione** — nessun network monitor; il retry "risolve" senza controllare la rete.
16. **Scan etichetta senza fotocamera** — "Inquadra l'etichetta" simula una scansione mai avvenuta (atteso ML Kit, ma la UX mente). (`nutrition/foods/scan/index.tsx`)
17. **Album demo: errori ingoiati come "vuoto"**; copertine mai renderizzate (`coverUri` mai passato).
18. **Testi "Rocky" hardcoded** in paywall, privacy, patterns, processing copy, diario, foods.
19. **Care: "prossimo appuntamento" può essere nel passato** — `nextCareEvent()` corretto esiste ma non è usato (rocky.tsx:56, care/index.tsx:18).
20. **Pattern review finta** — "Corretto/Contesta/Archivia" non chiama il POST dichiarato. (`patterns/[patternId].tsx:138-154`)

## ⚪ MANCANTI (richiesti da spec/documenti)

- **Sign in with Apple** — ADR-001 LOCKED prescrive Apple/Google/email; assente → **bloccante App Store** con login di terze parti.
- **Condividi card risultato sanitizzata** — UX_REFERENCE:115, assente dalla schermata Risultato.
- **Paywall: nessun acquisto possibile** — "Acquista"/"Ripristina" solo alert "store non collegato" (RevenueCat pianificato). Monetizzazione zero.
- **Centro notifiche mostra solo promemoria care** — mai risultati pronti, pattern, trend.
- **Paginazione diario** (cursor annunciato, assente).
- **Messaggio quotidiano interattivo** — citato come tratto distintivo (UX_REFERENCE:5) ma la card è morta e la collocazione non decisa.
- **Modifica appuntamento care** assente.
- **Network monitor offline reale** (sez. 6).

## ✅ Eccellenze da tenere

Auth reale completa (OAuth Google con dedup, OTP, gate a 3 stati, mock solo `__DEV__`); onboarding con tutti gli stati mandatory; capture video behavior (macchina a stati, hard cap 20s, permessi just-in-time); pipeline upload SQLite con idempotenza e retention; processing behavior con polling reale e stati errore dedicati; upload foto album con cleanup; export/delete real-mode con doppia conferma e polling; care/new conforme a UX_REFERENCE riga per riga; UX-lock enforced dai test; accessibilità sopra la media.

## Priorità di fix suggerita

**P0 — "non mentire all'utente"**: feedback fail-silent, consensi privacy, preferenze notifiche, elimina account demo, edit demo, quota Home reale, digestive onesto (almeno upload reale + errore vero).
**P1 — flussi rotti**: diario con dati veri, redirect mock processing, photo viewer dal profilo, notifiche care + "ti avviso quando è pronto", retake pulisce la coda, chip paginazione.
**P2 — mancanti bloccanti store**: Sign in with Apple, RevenueCat, condividi card risultato, network monitor.
**P3 — igiene**: route orfane (patterns/knowledge/dailyMessage → decidere: collegare o rimuovere), "Rocky" hardcoded, nextCareEvent, copertine album.
