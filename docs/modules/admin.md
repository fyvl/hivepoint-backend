# Admin Module

## Purpose
Provides admin-only moderation actions for products, versions, and API keys.

## Endpoints
| Method | Path | Auth | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| POST | `/admin/products/:id/hide` | Bearer + ADMIN | None | `{ ok, productId }` | Sets product status to `HIDDEN` (idempotent). |
| POST | `/admin/versions/:id/hide` | Bearer + ADMIN | None | `{ ok, versionId }` | Sets version status to `DRAFT` (idempotent). |
| POST | `/admin/keys/:id/revoke` | Bearer + ADMIN | None | `{ ok, keyId }` | Revokes API key (idempotent). |

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
- The module only touches the minimal fields required for moderation.
- No request bodies are used; all IDs are path params.

## Future improvements
- Add admin audit logs for moderation actions.
- Add bulk moderation endpoints.
- Add optional reasons/notes for moderation events.
