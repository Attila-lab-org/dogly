# Billing V1 — Dogly

## Store digitali (obbligatorio per IAP)
- **iOS**: StoreKit via **RevenueCat**
- **Android**: Google Play Billing via **RevenueCat**
- Prezzi approvati: **€9,99/mese**, **€89,99/anno** (badge risparmio sul annuale)
- Piano Free sempre visibile; allowance Premium dichiarata **30+30/mese** (no unlimited)

## Web / non-digital
- **Stripe** solo per eventuali pagamenti web o prodotti non digitali
- Non usare Stripe per bypassare le IAP store

## Backend
- Entitlement mirror: `GET /v1/subscription/status`, `GET /v1/usage`
- Webhook RevenueCat: `POST /v1/webhooks/revenuecat` (idempotente)

## Stato integrazione
- UI paywall + mock entitlements pronti
- Collegamento RevenueCat SDK + prodotti sandbox: checklist in `DEVICE_TEST_CHECKLIST.md`
