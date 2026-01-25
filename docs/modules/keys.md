# Keys Module

## Purpose
Manages API keys for the authenticated user: creation, listing, and revocation.

## Endpoints
| Method | Path | Auth | Request DTO | Response shape | Notes |
| --- | --- | --- | --- | --- | --- |
| POST | `/keys` | Bearer | `CreateKeyDto` | `CreateKeyResponseDto` | Returns `rawKey` only on creation. |
| GET | `/keys` | Bearer | None | `ListKeysResponseDto` | Lists keys for the current user, ordered by `createdAt` desc. |
| POST | `/keys/:id/revoke` | Bearer | None | `RevokeKeyResponseDto` | Idempotent; owner or `ADMIN` only. |

## Security notes
- Raw key is generated as `hp_` + base64url of 32 random bytes and returned only once.
- Only `keyHash` is stored; raw keys are never persisted.
- `keyHash = sha256(rawKey + API_KEY_SALT)`.
- `API_KEY_SALT` is required via environment configuration.

## Error codes
- `UNAUTHORIZED`
- `KEY_NOT_FOUND`
- `NOT_OWNER`
- `VALIDATION_ERROR`

## Examples
### Create key
Request:
```json
{
    "label": "My key"
}
```
Response:
```json
{
    "id": "uuid",
    "label": "My key",
    "rawKey": "hp_b64url...",
    "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### Revoke key
Response:
```json
{
    "ok": true,
    "keyId": "uuid"
}
```

## Implementation notes
- Validation uses `ZodValidationPipe` with a trimmed `label` length of 1..60.
- Revocation sets `isActive=false` and `revokedAt=now` when not already revoked.
- Listing uses a select that excludes `keyHash` and `rawKey`.

## Future improvements
- Add last-used timestamps per key.
- Support key rotation flows and scoped permissions.
