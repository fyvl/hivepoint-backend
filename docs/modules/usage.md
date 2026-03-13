# Usage Module

## Purpose
Provides a minimal entitlement layer for API access: it can authorize a raw API key against an active subscription and quota for a specific product, ingest usage records, and summarize usage for the current billing period.

## Endpoints
| Method | Path | Auth | Request DTO | Response shape | Notes |
| --- | --- | --- | --- | --- | --- |
| POST | `/usage/authorize` | `x-usage-secret` header | `AuthorizeUsageDto` | `AuthorizeUsageResponseDto` | Internal entitlement check by raw API key + product; can optionally record usage in the same call. |
| POST | `/usage/record` | `x-usage-secret` header | `RecordUsageDto` | `RecordUsageResponseDto` | Internal ingestion endpoint. |
| GET | `/usage/summary` | Bearer | None | `UsageSummaryResponseDto` | Summarizes usage for active subscriptions with a valid billing period. |

## Ingest security
- Required header: `x-usage-secret`
- Value must match `USAGE_INGEST_SECRET` from the environment.

## Aggregation rules
- `/usage/authorize` hashes the incoming raw API key with `API_KEY_SALT`, resolves the owning user, finds an `ACTIVE` subscription for the requested product, and checks the current billing period quota.
- Authorization returns `allowed=false` for `INVALID_API_KEY`, `NO_ACTIVE_SUBSCRIPTION`, or `QUOTA_EXCEEDED`.
- If `consume=true`, `/usage/authorize` records usage immediately after a successful check.
- Only `ACTIVE` subscriptions for the current user are considered.
- Billing period is taken from `subscription.currentPeriodStart` and `subscription.currentPeriodEnd`.
- If either period value is `null`, that subscription is omitted from the summary.
- `usedRequests` is the sum of `UsageRecord.requestCount` where `occurredAt >= periodStart` and `occurredAt < periodEnd`.
- `percent = min(100, floor((usedRequests / quotaRequests) * 100))`.
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
- Ingestion validates the header secret inside the service before creating a record.
- Authorization checks API key hash, subscription activity, billing period, and quota in the usage service.
- Usage aggregation uses a single `groupBy` query with OR filters across subscriptions.
- Summary excludes subscriptions without a billing period in the database.

## Future improvements
- Support date range filters and per-endpoint breakdowns.
- Store daily aggregates to reduce query cost.
- Integrate ingestion with an external gateway or queue.
