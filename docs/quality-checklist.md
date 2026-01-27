# Quality Checklist

## Security
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` set to strong values.
- [ ] `MOCK_PAYMENT_SECRET` and `USAGE_INGEST_SECRET` configured and not shared publicly.
- [ ] Refresh cookie uses `httpOnly`, `sameSite=lax`, and `COOKIE_SECURE=true` in production.
- [ ] `CORS_ORIGINS` restricted to allowed frontend origins.
- [ ] API key hashing uses `API_KEY_SALT`; raw keys are only returned on creation.
- [ ] Role guards protect seller/admin endpoints (`BUYER`, `SELLER`, `ADMIN`).

## Data
- [ ] Prisma migrations are applied to the target environment.
- [ ] Foreign keys and indexes exist as defined in migrations.
- [ ] Subscription/invoice creation is transactional.
- [ ] Test database is separate from dev/prod databases.

## Testing
- [ ] Unit tests cover service logic (Jest).
- [ ] E2E tests run in-process with Supertest.
- [ ] E2E uses `DATABASE_URL_TEST` and resets DB between tests.
- [ ] E2E validates auth, catalog+plan, subscription+mock payment, keys, and usage flows.

## Operations
- [ ] Runbook covers local setup and Prisma migrations.
- [ ] Environment validation via `env.schema.ts` passes on startup.
- [ ] Health endpoint returns `GET /health`.
- [ ] Basic smoke tests exist in `docs/runbook.md`.

## API quality
- [ ] Swagger UI available at `/api`, OpenAPI JSON at `/openapi.json`.
- [ ] Error responses follow `{ error: { code, message, details } }`.
- [ ] Secret-protected endpoints reject invalid secrets (`403`).
