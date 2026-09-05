# Staging isolation (Dogly closed beta)

Staging must never share secrets or user data with production.

## Required separate resources

1. **Supabase staging project** (own Auth, Postgres, Storage buckets).
2. **Vercel staging project / Preview env** with staging env vars only.
3. **EAS `preview` / `beta` profile** pointing at staging API + Supabase URL/keys.

## Fail-fast config

Set `APP_ENV=staging` (or `production`) on the API. Startup rejects:
- empty `DATABASE_URL`
- missing JWKS / Supabase URL / service role
- `STORAGE_PROVIDER=mock`, `OBSERVER_PROVIDER=mock`, `REASONING_PROVIDER=mock`
- missing `WORKER_INTERNAL_TOKEN`, `WORKFLOW_BASE_URL`, `JOB_QUEUE_BACKEND=vercel_workflows`
- missing provider API keys when Gemini/OpenAI are selected

## Suggested staging values

```
APP_ENV=staging
DATABASE_URL=postgresql+asyncpg://...pooler...
SUPABASE_URL=https://<staging-ref>.supabase.co
SUPABASE_JWKS_URL=https://<staging-ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_SERVICE_ROLE_KEY=...
STORAGE_PROVIDER=supabase
OBSERVER_PROVIDER=gemini
OBSERVER_MODEL=<eval-winner>
REASONING_PROVIDER=openai
REASONING_MODEL=<eval-winner>
GEMINI_API_KEY=...
OPENAI_API_KEY=...
JOB_QUEUE_BACKEND=vercel_workflows
WORKFLOW_BASE_URL=https://<staging-deployment>.vercel.app
WORKER_INTERNAL_TOKEN=<long-random>
SENTRY_DSN=...
```

Mobile EAS staging:
```
EXPO_PUBLIC_API_URL=https://<staging-deployment>.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon>
```
