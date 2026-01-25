# Users Module

## Purpose
Provides access to the authenticated user's basic profile.

## Endpoints
| Method | Path | Auth | Request DTO | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/users/me` | Bearer | None | `UserMeResponseDto` | Uses `request.user` set by `JwtGuard`. |

## Response fields
`UserMeResponseDto` includes only `id`, `email`, and `role`.

## Error codes
- `UNAUTHORIZED`
- `NOT_FOUND` (message `USER_NOT_FOUND`)

## Example
Response:
```json
{
    "id": "uuid",
    "email": "user@example.com",
    "role": "BUYER"
}
```
