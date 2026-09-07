# TASK MOBILE — per Kimi (app `apps/mobile/`)

**Data:** 2026-09-07 • **Fonte:** audit indipendente sicurezza/privacy + performance immagini.
**Regola:** questi task toccano SOLO `apps/mobile/`. Il task backend correlato (URL media stabili,
miniature, EXIF server-side, retention cron) è in `docs/CURSOR_BACKEND_TASKS.md` sez. "audit 2026-09-07".

## P0 — sicurezza

1. **CHIUSO 2026-09-07 — Callback OAuth senza validazione del deep link.** ~~`app/auth/callback.tsx:23-34` +
   `src/features/auth/oauthCallback.ts:24-33` accettano qualsiasi URL `dogly://…` e passano
   `access_token`/`refresh_token` a `setSession()` senza verificare host/percorso né uno `state`
   legato al login appena iniziato. Su Android qualunque app può iniettare token e far entrare il
   telefono dell'utente nell'account dell'attaccante.~~ Fix applicato: allowlist scheme+host+path in
   `assertValidAuthCallbackUrl` + nonce `dogly_state` generato all'avvio del login, salvato in
   SecureStore (sessionStorage su web), verificato e consumato prima di `setSession`
   (`oauthCallback.ts`, `actions.ts`). Test: `authCallback.test.ts` (15 test).
2. **MAJOR — Logout incompleto.** `src/features/auth/SessionProvider.tsx:190-203` svuota solo cache
   query e token: restano SQLite `cbi-pending-uploads.db` (openUploadQueueDatabase), file video/foto
   in attesa, AsyncStorage (consensi, check-in, notifiche). Fix: `signOut` deve svuotare queue+db,
   cancellare file sensibili in pending, e resettare lo storage locale non sensibile.
3. **MAJOR — Sessione che sopravvive al logout offline.** `clearSession()` rimuove solo le chiavi
   `cbi.session.*`; la chiave `sb-…-auth-token` di Supabase viene pulita solo da `supabase.auth.signOut()`,
   che con rete assente fallisce e lascia la sessione locale (rientro automatico al riavvio).
   Fix: dopo `signOut()`, forzare rimozione locale della chiave `sb-…` (best-effort) anche in caso
   di errore.

## P1 — privacy dati sul dispositivo

4. **MAJOR — File sensibili mai cestinati se l'upload fallisce.** `src/features/behavior/upload.ts:168`,
   `src/features/digestive/upload.ts:49`: il file locale viene cancellato solo a upload riuscito o su
   "Registra di nuovo". Fix: retention locale (es. 7gg) + cleanup all'avvio dell'app.
5. **MAJOR — EXIF/GPS nelle foto.** `src/features/digestive/photo.ts:15-20` scatta e carica senza
   stripping. Fix: `expo-image-manipulator` (re-encode JPEG qualità ~0.8) prima dell'upload; verificare
   anche la share card (`src/features/behavior/share.ts:71-92`).
6. **MINOR — Notifiche sensibili su lock screen.** `src/features/care/notifications.ts:75-76`,
   `src/features/behavior/notify.ts:29-31`: valutare `channelId` con visibilità ridotta + flag
   privacy nelle impostazioni.
7. **MINOR — Feedback AI senza check consenso.** `src/features/core/feedback.ts:38-61`: controllare
   `researchTraining` prima dell'invio (oggi salvato ma mai guardato). Nota: dipende da consensi
   sincronizzati col server (già noto come gap).
8. **MINOR — File share in cache mai cancellati.** `src/features/behavior/share.ts:76,128`: rimuovere
   `dogly-share-dog` / `dogly-<eventId>.svg` dopo la condivisione (o all'avvio).
9. **MINOR (web only)** — token in `localStorage` (`src/lib/supabase.ts:18-28`): accettabile per la
   build web/dev; documentare che la web non è una superficie supportata in V1.

## P1 — performance immagini (da fare DOPO il task backend 8/9 degli URL stabili + miniature)

10. **expo-image installato ma inutilizzato.** Tutte le immagini usano `Image` di react-native
    (zero import di `expo-image`, verificato). Migrare galleria/album/avatar/storie a `expo-image`
    con `cachePolicy`, `transition`, placeholder; `priority` alta per avatar e copertine.
11. **Nessuna gestione errore/scadenza URL.** Nessun `onError` sulle Image: URL firmati scaduti
    (10 min lato server) → foto nere silenziose. Fix: handler onError → refetch query foto
    (rinnova URL) con backoff; stato "immagine non disponibile" con retry.
12. **Nessun prefetch nel viewer foto.** `app/dogs/[dogId]/album/photo/[photoId].tsx`: precaricare
    foto adiacenti quando l'endpoint stabile (backend task 8) esiste.


---

## Audit "app di prima classe" (2026-09-07) — fluidità, rete, stabilità

Fonte: tre audit comparativi (le app migliori fanno X — Dogly lo fa?). Nessuna sovrapposizione con le sezioni precedenti.

### P0

13. **CHIUSO 2026-09-07 — Timeout rete e upload cancellabile.** `apiClient.ts` interrompe le richieste dopo 15 s e normalizza timeout/offline; `signedUpload.ts` usa `createUploadTask` cancellabile con limite 60 s (web incluso). Test: `requestTimeout.test.ts`, `signedUpload.test.ts`.
14. **CHIUSO 2026-09-07 — Error Boundary globale.** `AppErrorBoundary.tsx` protegge l'albero React, invia il crash a Sentry e offre una schermata di recupero con reload sicuro.

### P1 — fluidità

15. **CHIUSO 2026-09-07 — Diario virtualizzato.** La timeline usa `FlatList` con finestra limitata e `onEndReached` collegato alla paginazione cursor.
16. **Album foto: griglia non virtualizzata + endpoint senza paginazione.** `app/dogs/[dogId]/album/[albumId].tsx:60-70`, `src/features/photos/components.tsx:56-76`; backend `gallery.py:97-103` restituisce tutto. Fix: FlatList numColumns (o FlashList) + paginazione server (task correlato in CURSOR_BACKEND_TASKS sez. 2026-09-07, item 9).
17. **Zero React.memo sulle righe.** Ricerca diario: ogni tasto ri-renderizza tutta la lista (`diary.tsx:76-111,179`). Fix: `React.memo` su `DiaryRow`, callback `useCallback`, date precalcolate nel mapping.
18. **Avvio: await in serie.** `src/features/auth/SessionProvider.tsx:115-127` — SecureStore → setState → fetch cani in sequenza. Fix: `Promise.all` per le operazioni indipendenti; mostrare subito UI con skeleton.

### P1 — rete

19. **CHIUSO 2026-09-07 — Retry upload bounded e network-aware.** Il drain riparte al ritorno della rete, applica backoff 5/15/45/120 s e dopo 5 errori passa a `terminal_error`, evitando loop infiniti.
20. **Upload senza resume.** `src/lib/signedUpload.ts:30-34` BINARY_CONTENT intero: interruzione = ricomincia dal byte 0. Fix: chunked/resumable (o accettare e mostrare "% caricato" onesto).
21. **Doppio submit feedback diario.** `app/diary/event/[eventId].tsx:141-144` fire-and-forget senza guard; idempotency key con `Date.now()` (`src/features/behavior/api.ts:119`) → due tap = due scritture. Fix: flag "in corso" che disabilita + chiave stabile per evento.
22. **CHIUSO 2026-09-07 — Errore rete distinto da profilo vuoto.** `SessionProvider` usa lo stato `authenticated-dog-status-unknown` e porta a una schermata di recupero; un timeout non rimanda più l'utente all'onboarding.
23. **CHIUSO 2026-09-07 — Polling adattivo e offline-aware.** Polling behavior 2/4/8 s; `onlineManager` è sincronizzato con `expo-network`, quindi query e polling si fermano offline.

### P1 — stabilità/privacy operativa

24. **Promise non gestite nei punti critici.** `SessionProvider.tsx:162-167` (onAuthStateChange senza try/catch → loading infinito), `app/settings/index.tsx:110` (signOut), `app/diary/event/[eventId].tsx:143` (feedback), `app/settings/privacy.tsx:84,262` (consensi + openURL), `src/features/behavior/ProcessingCompanion.tsx:26`. Fix: `.catch` ovunque + try/catch nel callback auth.
25. **CHIUSO 2026-09-07 — Metadati upload persistenti.** SQLite conserva durata, audio, content type e capture ID; un riavvio non altera più i dati inviati al backend.
26. **CHIUSO 2026-09-07 — Nessun rinnovo ricorsivo URL.** Un URL scaduto entra nel retry bounded con backoff; non richiama più ricorsivamente il processor.

### P2 — accessibilità e igiene

27. **CHIUSO 2026-09-07 — Contrasto testo muted.** `textMuted` è `#64748B`; il precedente `#94A3B8` resta disponibile come `iconMuted` solo per elementi decorativi.
28. **Touch target sotto 44pt.** `app/signals/experiment.tsx:529-536` (40×40, no hitSlop), `app/(tabs)/diary.tsx:190` (~34pt effettivi). Fix: hitSlop generoso / min 44pt.
29. **Troncamenti con font grande del telefono.** `numberOfLines={1}` in `CareEventCard.tsx:38`, `rocky.tsx:334`, `StoriesRail.tsx:56,88`, `digestive/result/[eventId].tsx:414,465`. Fix: testare con "Larger Accessibility Sizes" e lasciare espandere dove possibile.
30. **Manca quasi del tutto `accessibilityHint`**; `app/notifications/index.tsx:74,88,134` ruolo senza label. Fix: passata screen reader con VoiceOver/TalkBack attivo.
31. **CHIUSO 2026-09-07 — Processing recuperabile.** Lo stato errore spiega che l'analisi continua e offre `Riprova`; il polling riparte senza ricreare l'evento.
32. **Igiene**: `react-hook-form` in `package.json:47` mai importato (rimuovere); share card in base64 nel JS thread (`src/features/behavior/share.ts:80-88`) → comprimere/ridimensionare prima dell'encode; agenda senza limite storico (`app/care/index.tsx:25-27`); upload foto senza resize (`src/features/photos/api.ts:119-147`, ~1600–2048px lato lungo); nessun indicatore "aggiornato alle X" (`dataUpdatedAt` mai usato).


---

## Gap AI — superficie V2/V5 (audit 2026-09-07)

Fonte: audit mobile vs `SPEC_BEHAVIOR_INTELLIGENCE_V2.md` (accettazione sez. 14) e V5.
L'involucro UX è buono (evidence chiusi, zero gergo, digestione conforme, voce con
conferma); questi gap riguardano il cuore "intelligente". I task backend correlati
sono nella sezione "Gap AI" di `docs/CURSOR_BACKEND_TASKS.md` (numeri 44-52).

### P0 — bloccano la beta AI

33. **CHIUSO 2026-09-07 — Check-in arriva al backend.** Modal Home + `PATCH /v1/dogs/{id}/lifestyle` `today_vs_usual` all'invio e retry prima della capture. Banner locale resta fallback offline.
34. **CHIUSO 2026-09-07 — `context_bucket` non è più UNKNOWN fisso.** Hint REST di notte, altrimenti UNKNOWN così il worker deriva dal video.
35. **CHIUSO 2026-09-07 — Blocco "Per {nome}".** `baseline_note` dal composer, card sotto la sintesi.
36. **CHIUSO 2026-09-07 — Feedback-correzione V2.** Dopo "Non proprio" chiede
   cosa stava facendo (3–5 alternative + Altro). La correzione resta personale;
   il backend la marca utilizzabile per ricerca solo col consenso server attivo.

### P1 — prima della produzione

37. **CHIUSO 2026-09-07 — Safety behavior in UI.** Card dal DTO `safety` (azione owner), non dal codice tecnico né da intent cablati.
38. **CHIUSO 2026-09-07 — processing in 4 step.** Lo step 3 esplicita
   "Li confronto con quello che so di Rocky"; la preparazione della risposta è il quarto.
39. **CHIUSO 2026-09-07 — "Da osservare" visibile** sotto "Prova così" (`AdviceCard`).
40. **CHIUSO 2026-09-07 — audio voce cancellato dal device.** Il file temporaneo
   viene rimosso in `finally` dopo il tentativo di trascrizione, anche in anteprima.
41. **CHIUSO 2026-09-07 — percorso prudente per fatti HEALTH.** Prima della conferma
   appare una card deterministica che invita al parere veterinario per cambiamenti nuovi,
   intensi o persistenti.
42. **CHIUSO 2026-09-07 — Note personali nel Profilo.** Le note confermate sono
   caricate dal backend e possono essere modificate o eliminate dall'utente.

### MINOR

43. Copy V2: card consiglio "Prova così" (oggi "Cosa puoi fare adesso"), feedback "Ti
   sembra proprio Rocky?" (oggi "Ti torna?") — allineare a V2 §5/§23 quando si toccano i
   componenti. Digestione: metriche "In breve" sempre aperte prima del confronto col
   solito (`digestive/result/[eventId].tsx:254-266`) — invertire con la card confronto.
