# Testing

## Before running e2e tests
- Complete the local setup: see `docs/runbook.md`.
- Ensure the database is running and migrations are applied.
- If you add e2e tests that require a separate database, consider introducing `DATABASE_URL_TEST` (not present in the current env schema).
