# OpenAPI and Swagger

## Endpoints
- Swagger UI: `GET /api`
- OpenAPI JSON: `GET /openapi.json`

The OpenAPI document is created at runtime in `main.ts` and exposed by `OpenApiController`.

## Generating client types
Fetch `/openapi.json` from a running backend and feed it into your preferred generator. For example:
```bash
npx openapi-typescript http://localhost:3000/openapi.json -o src/api/types.ts
```
(Generator tooling is not included in this repo.)
