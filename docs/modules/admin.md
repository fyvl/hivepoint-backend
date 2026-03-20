# Admin Module

## Purpose

Provides admin-only moderation actions plus operational dashboard access for products, versions, API keys, and observability workflows.

## Endpoints

| Method | Path                       | Auth           | Request                      | Response                        | Notes                                                                 |
| ------ | -------------------------- | -------------- | ---------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| GET    | `/admin/audit-logs`        | Bearer + ADMIN | Optional `limit` query param | `{ items }`                     | Returns recent admin audit log entries, newest first.                 |
| GET    | `/admin/ops/dashboard`     | Bearer + ADMIN | None                         | `{ snapshot, alerts, alertDelivery, metricsHistory }` | Returns the current operational metrics snapshot, derived alerts, alert-delivery status, and recent persisted metrics history. |
| GET    | `/admin/ops/alerts`        | Bearer + ADMIN | None                         | `{ items }`                     | Returns current operational alerts derived from queue backlog, worker leases, and billing state. |
| POST   | `/admin/products/:id/hide` | Bearer + ADMIN | None                         | `{ ok, productId }`             | Sets product status to `HIDDEN` (idempotent).                         |
| POST   | `/admin/versions/:id/hide` | Bearer + ADMIN | None                         | `{ ok, versionId }`             | Sets version status to `DRAFT` (idempotent).                          |
| POST   | `/admin/keys/:id/revoke`   | Bearer + ADMIN | None                         | `{ ok, keyId }`                 | Revokes API key (idempotent).                                         |

## RBAC

- All endpoints require `Role.ADMIN` via `JwtGuard` + `RolesGuard` and `@Roles(Role.ADMIN)`.

## Status changes

- Product: `status` is set to `HIDDEN`.
- Version: `status` is set to `DRAFT` (MVP hide rule).
- API key: `isActive=false`, `revokedAt=now`.

## Error codes

- `UNAUTHORIZED`
- `FORBIDDEN`
- `PRODUCT_NOT_FOUND`
- `VERSION_NOT_FOUND`
- `KEY_NOT_FOUND`

## Implementation notes

- Actions are idempotent: repeated hide/revoke returns `{ ok: true }` without extra updates.
- Mutating actions write an `AuditLog` entry with actor, resource, request ID, and action-specific details in the same transaction.
- `GET /admin/audit-logs` is capped to `100` entries per request and returns newest-first results.
- `GET /admin/ops/dashboard` combines the operational metrics snapshot, derived alerts, recent external alert delivery state, and persisted metrics history so the frontend can render an ops dashboard without stitching multiple observability calls together.
- `GET /admin/ops/alerts` derives operational warnings from usage ingest backlog/failures, worker lease freshness, billing reconciliation freshness, overage collection freshness, and `PAST_DUE` subscription volume.
- External alert delivery now supports multi-target webhook fan-out, tracks aggregate per-alert state in `OperationalAlertState`, and stores per-target delivery state in `OperationalAlertDeliveryTargetState`.
- Persistent metrics history is captured by a background worker into `OperationalMetricsHistoryPoint`.
- The module only touches the minimal fields required for moderation.
- No request bodies are used; all IDs are path params.

## Future improvements

- Add bulk moderation endpoints.
- Add optional reasons/notes for moderation events.
- Add filtering and cursor pagination for audit log browsing.
- Add resolved-incident notifications and provider-specific sinks (Slack/PagerDuty/email) on top of the current webhook fan-out.
