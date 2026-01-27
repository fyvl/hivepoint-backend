# Environment Variables

These values are validated by `env.schema.ts` at startup.

| Variable | Required | Example | Used by |
| --- | --- | --- | --- |
| `PORT` | Optional (default 3000) | `3000` | Server listen port in `main.ts`; used by `MockPaymentProvider` to build payment links. |
| `DATABASE_URL` | Required | `postgresql://postgres:postgres@localhost:5432/hivepoint?schema=public` | Prisma database connection. |
| `JWT_ACCESS_SECRET` | Required | `change-me` | JWT access signing in `AuthService` and verification in `JwtGuard`/`OptionalJwtGuard`. |
| `JWT_REFRESH_SECRET` | Required | `change-me` | JWT refresh signing and verification in `AuthService`. |
| `JWT_ACCESS_TTL_SECONDS` | Required | `900` | Access token TTL in `AuthService`. |
| `JWT_REFRESH_TTL_SECONDS` | Required | `2592000` | Refresh token TTL in `AuthService`; refresh cookie max-age. |
| `CORS_ORIGINS` | Required | `http://localhost:5173` | CORS setup in `main.ts` (comma-separated list). |
| `COOKIE_DOMAIN` | Optional | empty or `example.com` | Refresh cookie domain in `AuthController`. |
| `COOKIE_SECURE` | Optional (default false) | `false` | Refresh cookie `secure` flag in `AuthController`. |
| `REDIS_URL` | Optional | `redis://localhost:6379` | Not used in code yet. |
| `MOCK_PAYMENT_SECRET` | Required | `change-me` | Mock payment guard header validation. |
| `API_KEY_SALT` | Required | `change-me` | API key hashing in `KeysService`. |
| `USAGE_INGEST_SECRET` | Required | `change-me` | Usage ingest header validation in `UsageService`. |
