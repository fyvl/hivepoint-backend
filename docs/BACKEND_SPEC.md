# HivePoint Backend Bootstrap

## Overview

Minimal NestJS + Prisma bootstrap with shared infrastructure and no business modules.

## Key Endpoints

- `GET /health` -> `{ "status": "ok" }`
- `GET /api` -> Swagger UI
- `GET /openapi.json` -> OpenAPI JSON

## Configuration

Configuration is loaded via `AppConfigModule` with Zod validation. See `.env.example` for required variables.

## Error Format

All errors return a unified response shape:

```json
{
    "error": {
        "code": "...",
        "message": "...",
        "details": {}
    }
}
```

## Infrastructure

- Prisma is provided by `PrismaModule` and `PrismaService`.
- CORS is enabled with credentials and origins parsed from `CORS_ORIGINS`.
- `cookie-parser` is enabled for refresh-token cookies.

## Local Dependencies

Use `docker-compose.yml` to start Postgres + Redis.
