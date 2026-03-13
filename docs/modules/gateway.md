# Gateway

Provides a minimal runtime gateway for seller-hosted APIs. HivePoint validates the buyer API key and active subscription, checks quota, forwards the request to the latest published product version target, and records usage after the upstream responds.

## Endpoints

| Method | Path | Auth | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| POST | `/gateway/dispatch` | `x-api-key` header | `GatewayDispatchDto` | `GatewayDispatchResponseDto` | Explicit dispatch envelope for playgrounds, internal tooling, or API clients that want normalized metadata in the response body. |
| ALL | `/gateway/products/:productId/*path` | `x-api-key` header | Direct upstream-style request body | Direct upstream status/body plus `x-hivepoint-*` usage headers | Proxy-style route for real API calls through HivePoint without the dispatch envelope. |

## Gateway behavior
- Requires `x-api-key` header.
- Requires a `PUBLISHED` product and at least one `PUBLISHED` version with a stored OpenAPI snapshot.
- Resolves upstream base URL from:
  - `servers[0].url` in OpenAPI 3 JSON/YAML, or
  - `host` + `basePath` (+ first `scheme`) in Swagger 2 JSON/YAML.
- Checks subscription status and quota via `UsageService`.
- Records usage only after the upstream returns a response.
- Proxy responses add runtime usage headers:
  - `x-hivepoint-subscription-id`
  - `x-hivepoint-request-count`
  - `x-hivepoint-remaining-requests`
  - `x-hivepoint-usage-recorded`
  - `x-hivepoint-period-end` (when present)

## Current limitations
- No rate limiting yet.
- Upstream target is always resolved from the latest published product version.
- Request/response bodies are passed as JSON or text only.
- Proxy mode is not a full streaming/binary reverse proxy yet.
