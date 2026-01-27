# Testing

## Before running e2e tests
- Complete the local setup: see `docs/runbook.md`.
- Ensure PostgreSQL is running.
- Create a separate test database and set `DATABASE_URL_TEST` to its connection string.
- Ensure required env vars are present (JWT secrets, CORS origins, mock/payment secrets). Tests set safe defaults if missing, but `DATABASE_URL_TEST` is required.

You can provide `DATABASE_URL_TEST` in one of two ways:
- Create a local `.env.test` file (not committed) with `DATABASE_URL_TEST=...`
- Or set it in your shell before running:
  - PowerShell:
    ```powershell
    $env:DATABASE_URL_TEST="postgresql://user:pass@localhost:5432/hivepoint_test?schema=public"
    npm run test:e2e
    ```

## Run e2e tests
```bash
npm run test:e2e
```

This command:
- sets `NODE_ENV=test`
- maps `DATABASE_URL` to `DATABASE_URL_TEST`
- runs `npx prisma migrate deploy` against the test DB
- executes Jest e2e tests in-process

## Database reset
E2E tests truncate all public tables (except `_prisma_migrations`) between tests to keep runs deterministic.
