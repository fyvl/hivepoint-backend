# Error Codes

All API errors are returned in a unified format:
```json
{
    "error": {
        "code": "...",
        "message": "...",
        "details": {}
    }
}
```

## Codes in use
| Code | HTTP status | Where used |
| --- | --- | --- |
| `INTERNAL_ERROR` | 500 | `OpenApiService` when OpenAPI document is not initialized; default in `HttpExceptionFilter`. |
| `HTTP_ERROR` | Varies (non-5xx) | `HttpExceptionFilter` fallback for non-5xx `HttpException` statuses not explicitly mapped. |
| `BAD_REQUEST` | 400 | `HttpExceptionFilter` mapping for `HttpException` 400. |
| `UNAUTHORIZED` | 401 | `JwtGuard`, `OptionalJwtGuard`, `RolesGuard`, and `AuthService` unauthorized paths. |
| `FORBIDDEN` | 403 | `RolesGuard`; `HttpExceptionFilter` mapping for `HttpException` 403. |
| `NOT_FOUND` | 404 | `UsersService` (message `USER_NOT_FOUND`); `HttpExceptionFilter` mapping for `HttpException` 404. |
| `CONFLICT` | 409 | `AuthService` register conflict (message `EMAIL_ALREADY_EXISTS`); `HttpExceptionFilter` mapping for `HttpException` 409. |
| `VALIDATION_ERROR` | 400 | `ZodValidationPipe`, `AuthService` input validation, catalog status transition validation, OpenAPI fetch validation (`OPENAPI_FETCH_FAILED`); mapped from 422 by `HttpExceptionFilter`. |
| `PRODUCT_NOT_FOUND` | 404 | Catalog products/versions services, Billing plans/subscriptions services. |
| `PRODUCT_NOT_PUBLIC` | 403 | Catalog products/versions services for unpublished products. |
| `VERSION_NOT_FOUND` | 404 | Catalog versions service. |
| `VERSION_ALREADY_EXISTS` | 409 | Catalog versions service. |
| `NOT_OWNER` | 403 | Catalog products/versions services; Billing plans and subscriptions services. |
| `FORBIDDEN_ROLE` | 403 | Billing plans service role check; Users self-service role change transition validation. |
| `PLAN_NOT_FOUND` | 404 | Billing subscriptions service (subscribe flow). |
| `PLAN_INACTIVE` | 400 | Billing subscriptions service (subscribe flow). |
| `ALREADY_SUBSCRIBED` | 409 | Billing subscriptions service (subscribe flow). |
| `SUBSCRIPTION_PENDING` | 409 | Billing subscriptions service (subscribe flow). |
| `SUBSCRIPTION_NOT_FOUND` | 404 | Billing subscriptions service (cancel). |
| `SUBSCRIPTION_NOT_ACTIVE` | 400 | Usage service when usage is recorded for a non-active subscription. |
| `INVOICE_NOT_FOUND` | 404 | Billing subscriptions service (mock payments). |
| `MOCK_PAYMENT_FORBIDDEN` | 403 | Billing mock payment guard. |
| `INVALID_API_KEY` | 401 | Gateway dispatch when `x-api-key` is invalid. |
| `NO_ACTIVE_SUBSCRIPTION` | 403 | Gateway dispatch when the API key owner has no active subscription for the product. |
| `QUOTA_EXCEEDED` | 429 | Gateway dispatch when the request would exceed the plan quota. |
| `USAGE_INGEST_FORBIDDEN` | 403 | Usage internal endpoints when `x-usage-secret` is missing or invalid. |
| `PAYMENT_PROVIDER_NOT_ENABLED` | 400 | Billing Stripe provider endpoints when Stripe is not active. |
| `STRIPE_WEBHOOK_INVALID` | 400 | Stripe webhook signature validation. |
| `CHECKOUT_SESSION_NOT_FOUND` | 404 | Billing checkout status lookup. |
| `GATEWAY_TARGET_NOT_CONFIGURED` | 502 | Gateway dispatch when no upstream base URL can be resolved from the stored OpenAPI snapshot. |
| `GATEWAY_UPSTREAM_UNAVAILABLE` | 502 | Gateway dispatch when the upstream request fails or times out. |
