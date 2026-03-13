# Release Notes

## MVP features implemented
- Authentication: register, login, refresh, logout with JWT access tokens and refresh cookies.
- Users: current user profile via `/users/me`.
- Catalog: API products and versions with status-based visibility.
- Billing: plans, subscriptions, invoices, mock payment endpoints, Stripe Checkout, webhook sync, and Stripe customer portal.
- Gateway: dispatch and proxy endpoints for live upstream calls with API key/subscription validation and usage recording.
- API keys: create, list, revoke; raw key returned only at creation.
- Usage metering: authorize raw API keys against active subscriptions and quota, ingest usage records, and summarize usage per active subscription.
- OpenAPI/Swagger: `/api` and `/openapi.json`.

## Known limitations
- No rate limiting yet on gateway traffic.
- Full renewal lifecycle is not complete yet: Stripe webhook sync creates local recurring invoices, but retry/dunning flows and deeper reconciliation are still limited.
- Usage aggregation is synchronous, not event-driven.
- Role changes are done via database updates (no admin UI).
- Gateway proxy currently supports JSON/text request and response bodies; it is not a full streaming/binary reverse proxy yet.

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
