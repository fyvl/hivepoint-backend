# HivePoint Backend Overview

## Overview
HivePoint is a NestJS backend for a marketplace of API products. It supports user authentication, seller-managed API products and plans, buyer subscriptions, API key management, and usage metering with summarized quotas.

## Scope
**MVP scope**
- User registration, login, refresh, logout.
- Product catalog with seller/admin management.
- Plans, subscriptions, and mock payments.
- API key issuance and revocation.
- Usage ingestion with summarized usage per subscription.
- Swagger/OpenAPI documentation.

**Out of scope**
- Real payment provider integration.
- API gateway/proxy for request routing.
- Automated subscription renewals and invoicing cycles.
- Async usage ingestion pipeline.
- Audit logging and observability stack.

## Tech stack
- TypeScript + NestJS
- Prisma ORM + PostgreSQL
- Jest + Supertest for testing

## Architecture
HivePoint is a modular monolith: each domain lives in its own Nest module, but all modules share the same process and database. This keeps module boundaries clear while avoiding distributed-system complexity for an MVP.

**Module boundaries**
- Auth, Users
- Catalog (products, versions)
- Billing (plans, subscriptions) + Mock payments
- Keys
- Usage
- Admin

## Key domain concepts
- **ApiProduct / ApiVersion**: seller-owned API products and their versions, with status-based visibility.
- **Plan / Subscription / Invoice**: plans define pricing/quota, subscriptions represent buyer access, invoices track billing periods and status.
- **ApiKey**: per-user API keys; raw key is returned only on creation and stored as a hash.
- **Usage metering**: internal usage records per subscription, aggregated into a summary for active subscriptions.

## Security model
- **Access vs refresh**: access tokens are JWTs returned in the response body; refresh tokens are stored in an HTTP-only cookie (`refreshToken`) and rotated on `/auth/refresh`.
- **RBAC**: roles `BUYER`, `SELLER`, `ADMIN` are enforced with guards on seller/admin endpoints.
- **Shared secrets**:
  - `MOCK_PAYMENT_SECRET` guards `/billing/mock/*` via `x-mock-payment-secret`.
  - `USAGE_INGEST_SECRET` guards `/usage/record` via `x-usage-secret`.
- **API key hashing**: raw API keys are hashed with `API_KEY_SALT` and never stored in plaintext.

## Data model summary
Key entities and relationships:
- **User** → has many `RefreshToken`, `ApiKey`, `Subscription`, `ApiProduct`.
- **ApiProduct** → belongs to `User`, has many `ApiVersion` and `Plan`.
- **Plan** → belongs to `ApiProduct`, has many `Subscription`.
- **Subscription** → belongs to `User` and `Plan`, has many `Invoice` and `UsageRecord`.
- **Invoice** → belongs to `Subscription`.
- **UsageRecord** → belongs to `Subscription`.

(See Prisma migrations for full schema and indexes.)

## API contracts
- **Swagger UI**: `GET /api`
- **OpenAPI JSON**: `GET /openapi.json`

Frontend clients should rely on the OpenAPI schema for request/response shapes and keep DTOs in sync with the backend.

## Testing strategy
- **Unit tests**: module-level service tests in `src/**`.
- **E2E tests**: in-process Nest app with Supertest.

E2E coverage includes:
- Auth flow: register → login → `/users/me` → refresh → logout
- Seller flow: create product → create plan
- Buyer flow: subscribe → mock succeed → list subscriptions (ACTIVE)
- Keys flow: create → list → revoke
- Usage flow: ingest record → summary aggregation

How to run:
- `docs/runbook.md` for local setup
- `docs/testing.md` for test DB and commands

## Non-functional considerations
- **Performance (current)**: indexed tables and pagination on catalog listing (limit/offset).
- **Performance (planned)**: caching for hot catalog reads and async usage aggregation.
- **Reliability**: deterministic error format (`{ error: { code, message, details } }`), idempotent mock payment endpoints, and transactional subscription+invoice creation.

## Roadmap
- API gateway/proxy for request routing and rate limiting.
- Real payment provider integration.
- Async usage pipeline (ingest → queue → aggregation).
- Subscription renewals and invoicing cycles.
- Audit logs and observability (metrics, traces, structured logs).
