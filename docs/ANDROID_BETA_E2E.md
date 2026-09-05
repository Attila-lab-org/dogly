# Android closed-beta E2E (staging)

Automated device E2E is gated on a physical Android + staging secrets.

## Path under test

1. Email OTP or Google sign-in
2. Onboarding dog (`POST /v1/dogs`)
3. Camera capture 5–20s
4. Upload queue: init → signed PUT → complete
5. Processing poll until terminal status
6. Result + feedback
7. Settings → privacy export/delete smoke

## Local command (when secrets present)

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=... EXPO_PUBLIC_SUPABASE_URL=... pnpm eas build --profile beta --platform android --local
```

Distribute the APK via EAS internal distribution, then Play Closed Testing.

CI must stay green with mock providers only (no paid AI calls).
