# Release Notes

## Current stage

HivePoint backend is currently at the `Beta` stage.

## Beta features implemented

- Authentication: register, login, refresh, logout with JWT access tokens and refresh cookies.
- Users: current user profile via `/users/me`.
- Catalog: API products and versions with status-based visibility.
- Billing: plans, subscriptions, invoices, mock payment endpoints, Stripe Checkout, webhook sync, Stripe customer portal, renewal state sync, `past_due`, grace period, retry metadata, and overage-enabled plan configuration.
- Gateway: dispatch and proxy endpoints for live upstream calls with API key/subscription validation, per-plan RPM enforcement, a shared Postgres-backed dynamic burst limiter, direct streaming for SSE/NDJSON proxy responses, buffered binary proxy responses, and usage recording.
- API keys: create, list, revoke; raw key returned only at creation.
- Usage metering: authorize raw API keys against active subscriptions, quota, optional overage policy, and optional per-plan RPM policy; accept queue-backed usage ingest events with async persistence into `UsageRecord`; maintain subscription-level daily aggregates; and summarize usage per active subscription with projected overage charges.
- Observability: every HTTP response includes `x-request-id`, errors surface `requestId`, requests are logged in a structured format, `GET /metrics` exposes Prometheus-style metrics, `GET /admin/ops/dashboard` exposes an ops dashboard snapshot, external operational alerts can be pushed to a configured webhook with reminder cooldown, and admin moderation actions are persisted in `AuditLog`.
- Seller analytics: product view tracking plus seller analytics overview with conversion, active clients, failed billing events, and top endpoints.
- Buyer alerts: quota, overage, renewal, payment retry / past due, and new-version alerts via `/billing/alerts`.
- OpenAPI/Swagger: `/api` and `/openapi.json`.

## Known limitations before production

- Gateway rate limiting now combines plan RPM with a shared Postgres-backed dynamic burst limiter, but the policy is still derived from plan RPM rather than a separately configurable gateway limiter.
- Overage-enabled plans now allow quota overrun with projected charge reporting, but automated invoicing/collection for overage and pure pay-per-use billing is not implemented yet.
- Stripe retry cadence and dunning rules are provider-driven; the app surfaces retry state and reconciliation results but does not define custom retry policies.
- Usage read models are currently subscription-level daily aggregates; per-endpoint and richer analytics aggregates are not implemented yet.
- Role changes are done via database updates (no admin UI).
- Observability now includes an admin ops dashboard and webhook-based alert delivery, but long-term metrics storage and richer multi-sink routing are not implemented yet.
- Gateway proxy now streams SSE/NDJSON responses directly and still buffers most other response types while enforcing payload caps; it is not a full streaming reverse proxy yet.

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



