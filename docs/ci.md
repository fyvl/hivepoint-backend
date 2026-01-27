# CI

This repository uses GitHub Actions to run lint, unit tests, and e2e tests on every push to `main` and on pull requests.

## What runs
- `npm run lint`
- `npm run test`
- `npm run test:e2e` (PostgreSQL service + Prisma migrations)

## E2E database
CI uses a separate test database and sets:
- `DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/hivepoint_test?schema=public`
- `DATABASE_URL` to the same value for Prisma CLI compatibility.

## Required env vars (CI defaults)
CI provides safe placeholder values for:
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS`
- `CORS_ORIGINS`, `COOKIE_SECURE`
- `MOCK_PAYMENT_SECRET`, `API_KEY_SALT`, `USAGE_INGEST_SECRET`

## Run locally
```bash
npm run lint
npm run test
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/hivepoint_test?schema=public npm run test:e2e
```
