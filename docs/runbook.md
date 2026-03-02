# Local Runbook

## Prerequisites
- Node.js: not pinned in the repo; use a recent LTS (18+).
- Docker + Docker Compose (v2).
- Optional: `psql` client, `npx prisma studio` for DB inspection.

## One-time setup (clean clone)
1) Install dependencies:
```bash
npm install
```

2) Copy env file and adjust values:
```bash
cp .env.example .env
```

3) Required env vars (from `env.schema.ts`):
- `DATABASE_URL`: should match your local Postgres (defaults in `.env.example` match `docker-compose.yml`).
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: any non-empty strings (use random values in dev).
- `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS`: token TTLs in seconds.
- `CORS_ORIGINS`: comma-separated list (use your frontend origin, e.g. `http://localhost:5173`).
- `COOKIE_DOMAIN`: empty for local HTTP.
- `COOKIE_SECURE`: `false` for local HTTP.
- `REDIS_URL`: optional; Redis is in `docker-compose.yml` but not used in code yet.
- `MOCK_PAYMENT_SECRET`: any non-empty string (used by `/billing/mock/*`).
- `API_KEY_SALT`: any non-empty string (used to hash API keys).
- `USAGE_INGEST_SECRET`: any non-empty string (used by `/usage/record`).

## Start infrastructure (Docker)
```bash
docker compose up -d

docker compose ps
```

### Reset volumes (DESTROYS local data)
```bash
docker compose down -v
```

### Common Docker issues
- Port conflicts (`5432`, `6379`): stop local services or change ports in `docker-compose.yml`.
- Containers not healthy: check logs with `docker compose logs postgres` or `docker compose logs redis`.

## Prisma / DB setup
```bash
npx prisma generate
npx prisma migrate dev
npm run db:seed
```

Optional DB UI:
```bash
npx prisma studio
```

### Seeded demo data
`npm run db:seed` adds demo catalog entries with published products, versions, and plans.

Seeded seller accounts:
- `seller.integrations@hivepoint.dev`
- `seller.platform@hivepoint.dev`
- `seller.ai@hivepoint.dev`

Default password for newly created seeded users:
- `Password123!`

## Run the app
```bash
npm run start:dev
```

Useful URLs:
- `http://localhost:3000/health`
- `http://localhost:3000/api` (Swagger UI)
- `http://localhost:3000/openapi.json`

## Smoke test checklist (manual)
Set a helper shell variable:
```bash
BASE_URL=http://localhost:3000
```

### 1) Auth
Register:
```bash
curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer@example.com","password":"password123","role":"BUYER"}'
```

Register as dev/seller:
```bash
curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"seller@example.com","password":"password123","role":"SELLER"}'
```

Login (save cookies + access token):
```bash
curl -s -c cookies.txt -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer@example.com","password":"password123"}'
```

Get current user:
```bash
ACCESS_TOKEN=... # from login response
curl -s "$BASE_URL/users/me" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Profile summary:
```bash
curl -s "$BASE_URL/users/profile-summary" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Refresh:
```bash
curl -s -b cookies.txt -X POST "$BASE_URL/auth/refresh"
```

Logout:
```bash
curl -s -b cookies.txt -X POST "$BASE_URL/auth/logout"
```

Change password:
```bash
curl -s -X POST "$BASE_URL/users/change-password" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"password123","newPassword":"password1234"}'
```

### 2) Promote a user to ADMIN
`SELLER` can be selected during registration or upgraded from BUYER via API. No API endpoint exists for setting `ADMIN`; use Prisma Studio or SQL.

Upgrade BUYER -> SELLER (self-service):
```bash
curl -s -X POST "$BASE_URL/users/role" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"SELLER"}'
```
Then refresh or login again to get a new access token with `SELLER` role claim.

Prisma Studio:
```bash
npx prisma studio
```
Update `User.role` to `ADMIN`.

SQL example:
```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'buyer@example.com';
```

### 3) Catalog
Create product (as SELLER/ADMIN):
```bash
SELLER_TOKEN=...
curl -s -X POST "$BASE_URL/catalog/products" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Payments API","description":"Accept payments with a single endpoint.","category":"payments","tags":["payments","fintech"]}'
```

Publish product:
```bash
PRODUCT_ID=...
curl -s -X PATCH "$BASE_URL/catalog/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"PUBLISHED"}'
```

Public list:
```bash
curl -s "$BASE_URL/catalog/products"
```

### 4) Billing
Create plan (SELLER/ADMIN):
```bash
curl -s -X POST "$BASE_URL/billing/plans" \
  -H "Authorization: Bearer $SELLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":"'$PRODUCT_ID'","name":"Starter","priceCents":1000,"quotaRequests":1000}'
```

Subscribe (BUYER):
```bash
PLAN_ID=...
curl -s -X POST "$BASE_URL/billing/subscribe" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planId":"'$PLAN_ID'"}'
```

Mock succeed:
```bash
INVOICE_ID=...
MOCK_SECRET=... # from .env
curl -s -X POST "$BASE_URL/billing/mock/succeed?invoiceId=$INVOICE_ID" \
  -H "x-mock-payment-secret: $MOCK_SECRET"
```

List subscriptions:
```bash
curl -s "$BASE_URL/billing/subscriptions" -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 5) Keys
Create key:
```bash
curl -s -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"My key"}'
```

List keys:
```bash
curl -s "$BASE_URL/keys" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Revoke key:
```bash
KEY_ID=...
curl -s -X POST "$BASE_URL/keys/$KEY_ID/revoke" -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 6) Usage
Ingest record (internal):
```bash
USAGE_SECRET=... # from .env
SUBSCRIPTION_ID=...
curl -s -X POST "$BASE_URL/usage/record" \
  -H "Content-Type: application/json" \
  -H "x-usage-secret: $USAGE_SECRET" \
  -d '{"subscriptionId":"'$SUBSCRIPTION_ID'","endpoint":"/v1/search","requestCount":1}'
```

Summary:
```bash
curl -s "$BASE_URL/usage/summary" -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Troubleshooting
- Prisma can't connect: verify `DATABASE_URL`, ensure Postgres is running (`docker compose ps`).
- CORS/cookies not working: ensure `CORS_ORIGINS` includes your frontend origin and `COOKIE_SECURE=false` for HTTP.
- Mock payment forbidden: verify `x-mock-payment-secret` header matches `MOCK_PAYMENT_SECRET`.
- Usage ingest forbidden: verify `x-usage-secret` header matches `USAGE_INGEST_SECRET`.
