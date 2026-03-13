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
| `PAYMENT_PROVIDER` | Optional (default `MOCK`) | `MOCK` or `STRIPE` | Selects the payment provider used by `/billing/subscribe`. |
| `MOCK_PAYMENT_SECRET` | Required | `change-me` | Mock payment guard header validation. |
| `STRIPE_SECRET_KEY` | Required when `PAYMENT_PROVIDER=STRIPE` | `sk_test_...` | Stripe SDK client initialization and checkout session creation. |
| `STRIPE_WEBHOOK_SECRET` | Required when `PAYMENT_PROVIDER=STRIPE` | `whsec_...` | Stripe webhook signature verification on `/billing/stripe/webhook`. |
| `STRIPE_CHECKOUT_SUCCESS_URL` | Required when `PAYMENT_PROVIDER=STRIPE` | `http://localhost:5173/billing/success` | Checkout success redirect URL. `session_id` is appended automatically. |
| `STRIPE_CHECKOUT_CANCEL_URL` | Required when `PAYMENT_PROVIDER=STRIPE` | `http://localhost:5173/billing/cancel` | Checkout cancel redirect URL. |
| `STRIPE_PORTAL_RETURN_URL` | Required when `PAYMENT_PROVIDER=STRIPE` | `http://localhost:5173/billing` | Return URL used by Stripe customer portal. |
| `API_KEY_SALT` | Required | `change-me` | API key hashing in `KeysService`. |
| `USAGE_INGEST_SECRET` | Required | `change-me` | Usage ingest header validation in `UsageService`. |
