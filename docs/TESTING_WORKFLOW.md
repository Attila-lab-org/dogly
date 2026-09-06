# Workflow di test Dogly

Questo è il percorso unico da usare. Evita di alternare Expo Go, Development
Build, QR LAN e tunnel.

## 1. Controllo veloce sul PC

Da `apps/mobile`:

```bash
corepack pnpm web
```

Aprire <http://localhost:8083>. Il browser usa Fast Refresh: dopo un salvataggio
la schermata si aggiorna senza build e senza push.

Usarlo per:

- layout, testi, navigazione e accessibilità visiva;
- form e pulsanti;
- chiamate al backend, persistenza e stati di errore;
- Advice, Diario, profilo, privacy e abbonamento.

Non sostituisce Android per fotocamera, galleria, notifiche, condivisione,
SecureStore, OAuth nativo e comportamento in background.

## 2. Test quotidiano sul telefono

Installare una sola volta la **Dogly Staging APK** abilitata a EAS Update.
Non usare Expo Go e non scansionare QR.

Per pubblicare modifiche JavaScript sul telefono:

```bash
corepack pnpm update:staging -- --message "descrizione modifica"
```

Sul telefono:

1. chiudere completamente Dogly;
2. aprirla e attendere qualche secondo mentre scarica l'aggiornamento;
3. chiuderla e riaprirla per applicarlo.

Non è necessario fare una nuova build né tenere acceso il PC.

## 3. Quando serve una nuova APK

Fare una nuova EAS Build soltanto quando cambiano:

- dipendenze native Expo/React Native;
- permessi Android;
- plugin in `app.json`;
- icona, splash, scheme o configurazione nativa;
- versione/runtime dell'app.

Comando:

```bash
corepack pnpm exec eas build --platform android --profile staging
```

## Regola operativa

1. Sviluppo e primo controllo sul web.
2. Typecheck e test automatici.
3. EAS Update sul canale `staging`.
4. Smoke test Android delle sole parti native coinvolte.
5. Nuova APK solo per variazioni native.

La build `production` non viene usata per le prove quotidiane.
