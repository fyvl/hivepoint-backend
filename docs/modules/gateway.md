# Gateway

Provides a runtime gateway for seller-hosted APIs. HivePoint validates the buyer API key and active subscription, checks quota plus per-plan RPM, applies a shared Postgres-backed dynamic burst limiter derived from the plan RPM, forwards the request to the latest published product version target, and records usage once gateway policy checks pass.

## Endpoints

| Method | Path | Auth | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| POST | `/gateway/dispatch` | `x-api-key` header | `GatewayDispatchDto` | `GatewayDispatchResponseDto` | Explicit dispatch envelope for playgrounds, internal tooling, or API clients that want normalized metadata in the response body. Binary upstream bodies are returned as base64 with `bodyEncoding='base64'`. |
| ALL | `/gateway/products/:productId/*path` | `x-api-key` header | Direct upstream-style request body | Direct upstream status/body plus `x-hivepoint-*` usage headers | Proxy-style route for real API calls through HivePoint without the dispatch envelope. Streams `text/event-stream` and `application/x-ndjson` responses directly, while buffered responses still pass binary bodies through unchanged. |

## Gateway behavior

- Requires `x-api-key` header.
- Requires a `PUBLISHED` product and at least one `PUBLISHED` version with a stored OpenAPI snapshot.
- Resolves upstream base URL from:
  - `servers[0].url` in OpenAPI 3 JSON/YAML, or
  - `host` + `basePath` (+ first `scheme`) in Swagger 2 JSON/YAML.
- Performs a preliminary subscription/quota check, applies the gateway burst limiter, then performs the final quota/RPM consumption pass before dispatching upstream.
- Derives burst capacity dynamically from the plan RPM, persists bucket state in Postgres for multi-node sharing, and exposes it through response metadata.
- Enforces configurable upstream timeout plus request/response body size caps.
- Proxy responses add runtime usage headers:
  - `x-hivepoint-subscription-id`
  - `x-hivepoint-request-count`
  - `x-hivepoint-remaining-requests`
  - `x-hivepoint-usage-recorded`
  - `x-hivepoint-period-end` (when present)
  - `x-hivepoint-rate-limit-rpm` and `x-hivepoint-rate-limit-remaining` (when plan RPM is configured)
  - `x-hivepoint-burst-limit`, `x-hivepoint-burst-remaining`, and `x-hivepoint-burst-window-seconds` (when the dynamic burst limiter applies)

## Current limitations

- The current dynamic limiter is shared across nodes via Postgres, but it is still derived from the plan RPM rather than a separately configurable gateway policy.
- Upstream target is always resolved from the latest published product version.
- Proxy mode streams `text/event-stream` and `application/x-ndjson` responses directly, but most response types and request bodies are still buffered; it is not a full streaming reverse proxy yet.
- Multipart uploads and other advanced reverse-proxy cases are not supported yet.

