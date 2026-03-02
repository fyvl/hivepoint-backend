# Users Module

## Purpose
Provides access to the authenticated user's basic profile.

## Endpoints
| Method | Path | Auth | Request DTO | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/users/me` | Bearer | None | `UserMeResponseDto` | Uses `request.user` set by `JwtGuard`. |
| GET | `/users/profile-summary` | Bearer | None | `UserProfileSummaryDto` | Profile counters for subscriptions, keys, and seller catalog. |
| POST | `/users/role` | Bearer | `UpdateUserRoleDto` | `UserMeResponseDto` | Self-service role upgrade (`BUYER -> SELLER`) only. |
| POST | `/users/change-password` | Bearer | `ChangePasswordDto` | `ChangePasswordResponseDto` | Verifies current password, updates hash, revokes refresh tokens. |

## Response fields
`UserMeResponseDto` includes only `id`, `email`, and `role`.

## Error codes
- `UNAUTHORIZED`
- `NOT_FOUND` (message `USER_NOT_FOUND`)
- `FORBIDDEN_ROLE` (invalid self-service transition)
- `VALIDATION_ERROR` (`/users/change-password`, including when new password equals current password)

## Example
Response:
```json
{
    "id": "uuid",
    "email": "user@example.com",
    "role": "BUYER"
}
```
