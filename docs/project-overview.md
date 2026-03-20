# HivePoint Backend Overview

## Overview

HivePoint is a NestJS backend for a marketplace of API products. It supports user authentication, seller-managed API products and plans, buyer subscriptions, API key management, Stripe-backed billing, usage metering with summarized quotas, seller analytics, buyer alerts, and a runtime gateway for upstream API dispatch and proxying.

## Scope

**Current scope (`Beta`)**

- User registration, login, refresh, logout.
- Product catalog with seller and admin management.
- Plans, subscriptions, mock payments, Stripe Checkout with webhook sync, renewal state sync, and customer billing portal.
- API key issuance and revocation.
- Usage authorization by API key, gateway dispatch/proxying, usage ingestion, quota summaries, and buyer alerts.
- Seller analytics over product views, subscriptions, failed billing events, and top endpoints.
- Request tracing via `x-request-id`, structured HTTP request logs, Prometheus-style metrics, operational alerts, and admin audit logs.
- Swagger/OpenAPI documentation.

**Still out of scope (`Production` backlog)**

- Customizable gateway rate policies beyond the current RPM-derived shared burst limiter, plus fuller reverse-proxy streaming support.
- Flexible overage/pay-per-use billing policies.
- Custom renewal retry policies beyond the payment provider's built-in dunning behavior.
- Per-endpoint and richer usage read models beyond the current subscription-level daily aggregate.
- Long-term metrics storage, richer dashboard drill-downs, and multi-sink external alert routing beyond the current admin ops dashboard plus webhook delivery.

## Tech stack

- TypeScript + NestJS
- Prisma ORM + PostgreSQL
- Jest + Supertest for testing

## Architecture

HivePoint is a modular monolith: each domain lives in its own Nest module, but all modules share the same process and database. This keeps module boundaries clear while avoiding distributed-system complexity for an MVP.

**Module boundaries**

- Auth, Users
- Catalog (products, versions)
- Billing (plans, subscriptions, Stripe integration, mock payments)
- Gateway
- Keys
- Usage
- Analytics
- Admin

## Key domain concepts

- **ApiProduct / ApiVersion**: seller-owned API products and their versions, with status-based visibility.
- **Plan / Subscription / Invoice**: plans define pricing and quota, subscriptions represent buyer access, invoices track billing periods and status.
- **ApiKey**: per-user API keys; raw key is returned only on creation and stored as a hash.
- **Gateway / entitlement**: gateway dispatch and proxy routes validate API key + product + quota, enforce the plan RPM policy plus a Postgres-backed shared burst limiter, apply payload/time limits, forward the call to the seller-hosted upstream resolved from the latest published OpenAPI snapshot, stream SSE/NDJSON proxy responses, and consume usage once gateway policy checks pass.
- **Usage metering**: internal usage records per subscription, queue-backed ingestion for async persistence, and subscription-level daily aggregates used by quota and summary reads.
- **ProductView / seller analytics**: product detail reads are tracked and aggregated into seller-facing beta analytics.
- **Buyer alerts**: billing and usage state are materialized into buyer-facing alerts for quota pressure, renewals, payment issues, and new API versions.
- **Observability**: every HTTP request gets a request ID, structured request log entry, and in-memory HTTP metrics; `GET /metrics` exposes Prometheus-style metrics; `GET /admin/ops/dashboard` surfaces the operational metrics snapshot, derived alerts, and alert delivery status; active alerts can be pushed to an external webhook with reminder cooldown; and admin moderation actions are persisted to `AuditLog`.

## Security model

- **Access vs refresh**: access tokens are JWTs returned in the response body; refresh tokens are stored in an HTTP-only cookie (`refreshToken`) and rotated on `/auth/refresh`.
- **RBAC**: roles `BUYER`, `SELLER`, `ADMIN` are enforced with guards on seller and admin endpoints.
- **Shared secrets**:
    - `MOCK_PAYMENT_SECRET` guards `/billing/mock/*` via `x-mock-payment-secret`.
    - `USAGE_INGEST_SECRET` guards `/usage/authorize` and `/usage/record` via `x-usage-secret`.
- **API key hashing**: raw API keys are hashed with `API_KEY_SALT` and never stored in plaintext.

## Data model summary

Key entities and relationships:

- **User**: has many `RefreshToken`, `ApiKey`, `Subscription`, `ApiProduct`, `ProductView`.
- **ApiProduct**: belongs to `User`, has many `ApiVersion`, `Plan`, and `ProductView`.
- **Plan**: belongs to `ApiProduct`, has many `Subscription`.
- **Subscription**: belongs to `User` and `Plan`, has many `Invoice`, `UsageRecord`, `UsageIngestJob`, `UsageDailyAggregate`, and `GatewayBurstBucket`.
- **Invoice**: belongs to `Subscription`.
- **UsageRecord**: belongs to `Subscription`.
- **UsageIngestJob**: queued usage event that is asynchronously drained into `UsageRecord`.
- **UsageDailyAggregate**: read-model bucket that stores per-subscription daily request totals.
- **GatewayBurstBucket**: shared token-bucket state used to enforce the dynamic burst limiter across app instances.
- **ProductView**: belongs to `ApiProduct` and optionally a logged-in `User`.

See Prisma migrations for the full schema and indexes.

## API contracts

- **Swagger UI**: `GET /api`
- **OpenAPI JSON**: `GET /openapi.json`

Frontend clients should rely on the OpenAPI schema for request and response shapes and keep DTOs in sync with the backend.

## Testing strategy

- **Unit tests**: module-level service tests in `src/**`.
- **E2E tests**: in-process Nest app with Supertest.

E2E coverage includes:

- Auth flow: register -> login -> `/users/me` -> refresh -> logout
- Seller flow: create product -> create plan
- Buyer flow: subscribe -> mock succeed -> list subscriptions (`ACTIVE`)
- Keys flow: create -> list -> revoke
- Usage flow: authorize by API key -> ingest usage -> summary aggregation
- Beta flow: product view tracking -> seller analytics -> buyer alerts

How to run:

- `docs/runbook.md` for local setup
- `docs/testing.md` for test DB and commands

## Non-functional considerations

- **Performance (current)**: indexed tables and pagination on catalog listing.
- **Performance (planned)**: caching for hot catalog reads and richer usage aggregates beyond the current daily bucket model.
- **Reliability**: deterministic error format (`{ error: { code, message, details, requestId } }`), idempotent mock payment endpoints, Stripe webhook sync, and transactional subscription plus invoice creation.

## Roadmap

- Async usage pipeline (ingest -> queue -> aggregation).
- Long-term observability storage, richer ops drill-downs, multi-sink alert routing, and broader ops tooling on top of the current metrics, traces, webhook delivery, and audit logs.
- Admin UI and seller ops UI.
- Broader reverse-proxy streaming support and customizable gateway rate policies beyond the current shared burst limiter.


