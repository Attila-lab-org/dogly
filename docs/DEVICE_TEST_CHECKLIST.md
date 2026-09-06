# Device test checklist — Dogly V1

Checklist manuale per chiudere G0 / B-3. Eseguire su device fisico o emulatore
con build EAS `preview` (Android) e, quando disponibile, iOS TestFlight.
Per il ciclo quotidiano web → OTA staging → smoke nativo seguire
`docs/TESTING_WORKFLOW.md`.

## Auth & profilo
- [ ] Sign-in Supabase (email magic / provider configurato)
- [ ] Onboarding: nome, meta, foto galleria → persistono in Home / tab cane
- [ ] Edit profilo + opt-in/revoca profilo pubblico

## Camera & media
- [ ] Permessi camera / microfono behavior capture
- [ ] Upload → processing → result (bande Low/Medium/High, no %)
- [ ] Digestive capture: disclaimer osservativo, retake, upload failure
- [ ] Dogly Signals: posticipato; verificare soltanto che non compaia in Home/Profilo
  e che i deep link tornino alla Home
- [ ] Album: crea, aggiungi foto, didascalia, elimina, share sheet OS
- [ ] Share non espone URL bucket permanenti né raw behavior/digestive

## Retention
- [ ] Raw video non compare in album
- [ ] Dopo completamento, TTL 24h documentato in Privacy (`keepClip`)
- [ ] Job `media_retention_cleanup` cancella solo TEMPORARY scaduti

## Billing
- [ ] Paywall: €9,99 / €89,99, Free sempre visibile, no unlimited
- [ ] RevenueCat sandbox: purchase + restore (StoreKit / Play Billing)
- [ ] Grace / store unavailable UI

## Accessibilità smoke
- [ ] Target ≥ 44pt su CTA profilo / messaggio quotidiano
- [ ] VoiceOver / TalkBack: avatar, Knowledge Score, reaction message


## Closed Android beta gate (production path)

- [ ] Email OTP sign-in works on physical device
- [ ] Google sign-in works on physical device
- [ ] Dog onboarding persists after app kill (GET /v1/dogs)
- [ ] Camera capture 5–20s + retake
- [ ] Upload resumes after airplane-mode toggle
- [ ] Processing polls real event statuses through COMPLETED
- [ ] Feedback POST succeeds
- [ ] Insufficient quality path shows non-crash UX
- [ ] Account export / delete reachable from settings
- [ ] Tested on ≥2 Android devices (one mid-range / older)
