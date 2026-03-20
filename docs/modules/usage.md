# Usage Module

## Purpose

Provides a minimal entitlement layer for API access: it can authorize a raw API key against an active subscription and quota for a specific product, apply optional overage policy for plans that allow it, accept usage ingest events, and summarize usage for the current billing period.

## Endpoints

| Method | Path               | Auth                    | Request DTO         | Response shape              | Notes                                                                                                                          |
| ------ | ------------------ | ----------------------- | ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/usage/authorize` | `x-usage-secret` header | `AuthorizeUsageDto` | `AuthorizeUsageResponseDto` | Internal entitlement check by raw API key + product; can optionally record usage in the same call.                             |
| POST   | `/usage/record`    | `x-usage-secret` header | `RecordUsageDto`    | `RecordUsageResponseDto`    | Internal ingestion endpoint. When queue-backed ingest is enabled, the call validates and enqueues usage for async persistence. |
| GET    | `/usage/summary`   | Bearer                  | None                | `UsageSummaryResponseDto`   | Summarizes usage for active subscriptions with a valid billing period.                                                         |

## Ingest security

- Required header: `x-usage-secret`
- Value must match `USAGE_INGEST_SECRET` from the environment.

## Aggregation rules

- `/usage/authorize` hashes the incoming raw API key with `API_KEY_SALT`, resolves the owning user, finds an `ACTIVE` subscription for the requested product, and checks the current billing period quota or overage policy.
- Authorization returns `allowed=false` for `INVALID_API_KEY`, `NO_ACTIVE_SUBSCRIPTION`, `QUOTA_EXCEEDED`, or `RATE_LIMIT_EXCEEDED`.
- If `consume=true`, `/usage/authorize` records usage immediately after a successful check.
- `/usage/record` validates the subscription window before accepting the event, then either writes directly to `UsageRecord` plus `UsageDailyAggregate`, or enqueues a `UsageIngestJob` depending on `USAGE_INGEST_QUEUE_ENABLED`.
- Only `ACTIVE` subscriptions for the current user are considered.
- Billing period is taken from `subscription.currentPeriodStart` and `subscription.currentPeriodEnd`.
- If either period value is `null`, that subscription is omitted from the summary.
- `usedRequests` is resolved through a hybrid read-model: `UsageDailyAggregate` is used for full UTC days inside the window, while boundary partial days still read directly from `UsageRecord`.
- `percent = min(100, floor((usedRequests / quotaRequests) * 100))`.
- When the plan has `allowOverage=true`, quota overrun is allowed and the response exposes `overageRequests` / `projectedOverageAmountCents` instead of hard-blocking the request.
- Optional query filters (`subscriptionId`, `from`, `to`) are not implemented.

## Error codes

- `USAGE_INGEST_FORBIDDEN`
- `PRODUCT_NOT_FOUND`
- `SUBSCRIPTION_NOT_FOUND`
- `SUBSCRIPTION_NOT_ACTIVE`
- `VALIDATION_ERROR`
- `UNAUTHORIZED`

## Examples

### Authorize usage

Request:

```json
{
    "apiKey": "hp_example_api_key",
    "productId": "uuid",
    "endpoint": "/v1/search",
    "requestCount": 1,
    "consume": false
}
```

Response:

```json
{
    "allowed": true,
    "apiKeyId": "uuid",
    "subscriptionId": "uuid",
    "userId": "uuid",
    "periodStart": "2026-01-01T00:00:00.000Z",
    "periodEnd": "2026-02-01T00:00:00.000Z",
    "usedRequests": 120,
    "requestedRequests": 1,
    "quotaRequests": 1000,
    "remainingRequests": 880,
    "usageRecorded": false,
    "plan": {
        "id": "uuid",
        "name": "Starter",
        "quotaRequests": 1000
    },
    "product": {
        "id": "uuid",
        "title": "Payments API"
    }
}
```

### Ingest record

When `USAGE_INGEST_QUEUE_ENABLED=true`, this response means the event was accepted into the queue; persistence into `UsageRecord` is done asynchronously by the usage ingest worker.

Request:

```json
{
    "subscriptionId": "uuid",
    "endpoint": "/v1/search",
    "requestCount": 1,
    "occurredAt": "2026-01-25T10:00:00.000Z"
}
```

Response:

```json
{
    "ok": true
}
```

### Summary response

```json
{
    "items": [
        {
            "subscriptionId": "uuid",
            "periodStart": "2026-01-01T00:00:00.000Z",
            "periodEnd": "2026-02-01T00:00:00.000Z",
            "usedRequests": 120,
            "quotaRequests": 1000,
            "percent": 12,
            "plan": {
                "id": "uuid",
                "name": "Starter",
                "quotaRequests": 1000
            },
            "product": {
                "id": "uuid",
                "title": "Payments API"
            }
        }
    ]
}
```

## Implementation notes

- Ingestion validates the header secret inside the service before persisting or enqueueing a record.
- Queue-backed ingestion stores `UsageIngestJob` rows and drains them via a background worker protected by a `BackgroundJobLease`.
- Worker persistence into `UsageRecord` is idempotent via a unique `sourceJobId`.
- Every persisted usage record also updates a subscription-level `UsageDailyAggregate` row for the UTC day bucket.
- Authorization checks API key hash, subscription activity, billing period, quota, optional overage policy, and optional per-plan RPM in the usage service.
- Quota and summary reads use `UsageDailyAggregate` for full-day spans and fall back to raw `UsageRecord` scans for partial-day boundaries and any yet-unaggregated rows.
- Summary excludes subscriptions without a billing period in the database.

## Future improvements

- Support date range filters and per-endpoint breakdowns.
- Add per-endpoint aggregates and richer seller-facing usage breakdowns.
- Push rate-limit decisions onto a dedicated hot-path store instead of `UsageRecord` queries.

