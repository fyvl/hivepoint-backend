# Auth Module

## Purpose
Handles user registration, login, token refresh, and logout. It issues JWT access tokens and manages the refresh token cookie.

## Endpoints
| Method | Path | Auth | Request DTO | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/register` | Public | `RegisterDto` | `AuthUserResponseDto` | Email is trimmed/lowercased; password min length is 8. |
| POST | `/auth/login` | Public | `LoginDto` | `AccessTokenResponseDto` | Sets the `refreshToken` httpOnly cookie. |
| POST | `/auth/refresh` | Cookie `refreshToken` | None (cookie) | `AccessTokenResponseDto` | Rotates and resets the `refreshToken` cookie. |
| POST | `/auth/logout` | Cookie `refreshToken` (optional) | None | `LogoutResponseDto` | Clears the `refreshToken` cookie. |

## Tokens and cookies
- Access token: JWT with `sub`, `email`, `role`, signed with `JWT_ACCESS_SECRET`, TTL from `JWT_ACCESS_TTL_SECONDS`.
- Refresh token: JWT with `rtid` and `sub`, signed with `JWT_REFRESH_SECRET`, TTL from `JWT_REFRESH_TTL_SECONDS`; stored hashed in DB and sent as a cookie.
- Cookie settings: name `refreshToken`, `httpOnly: true`, `sameSite: lax`, `secure: COOKIE_SECURE`, `domain: COOKIE_DOMAIN` (if set), `path: /`, `maxAge: JWT_REFRESH_TTL_SECONDS * 1000`.

## Error codes
- `CONFLICT` (message `EMAIL_ALREADY_EXISTS`)
- `UNAUTHORIZED` (message `INVALID_CREDENTIALS` or `UNAUTHORIZED`)
- `VALIDATION_ERROR` (invalid input payloads)

## Examples
### Register
Request:
```json
{
    "email": "user@example.com",
    "password": "password123"
}
```
Response:
```json
{
    "id": "uuid",
    "email": "user@example.com",
    "role": "BUYER"
}
```

### Login and refresh
Login request:
```json
{
    "email": "user@example.com",
    "password": "password123"
}
```
Login response:
```json
{
    "accessToken": "jwt-access-token"
}
```

Refresh request: no body, relies on the `refreshToken` cookie.
Refresh response:
```json
{
    "accessToken": "jwt-access-token"
}
```
