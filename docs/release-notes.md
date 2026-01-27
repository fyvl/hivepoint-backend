# Release Notes

## MVP features implemented
- Authentication: register, login, refresh, logout with JWT access tokens and refresh cookies.
- Users: current user profile via `/users/me`.
- Catalog: API products and versions with status-based visibility.
- Billing: plans, subscriptions, invoices, and mock payment endpoints.
- API keys: create, list, revoke; raw key returned only at creation.
- Usage metering: ingest usage records and summarize usage per active subscription.
- OpenAPI/Swagger: `/api` and `/openapi.json`.

## Known limitations
- Payments are mock-only; no external provider integration.
- No gateway/proxy for live request routing or rate limiting.
- Subscription renewals and recurring invoicing are not automated.
- Usage aggregation is synchronous, not event-driven.
- Role changes are done via database updates (no admin UI).

## How to run
See `docs/runbook.md` for local setup, migrations, and smoke tests.

## How to test
```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e
```

## Security notes
- Set strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values.
- Protect internal endpoints with `MOCK_PAYMENT_SECRET` and `USAGE_INGEST_SECRET`.
- Use `COOKIE_SECURE=true` and a proper `COOKIE_DOMAIN` in production.
- API keys are hashed with `API_KEY_SALT` and never stored in plaintext.
