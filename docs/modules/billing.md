# Billing Module

## Purpose
Provides plan listing/creation and subscription listing/cancel. Payment processing and subscribe flow are documented separately.

## Plans
| Method | Path | Auth | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/billing/plans` | Public | Query: `productId` | `PlanListResponseDto` | Returns only active plans; product must exist. |
| POST | `/billing/plans` | Bearer + Roles | `CreatePlanDto` | `PlanDto` | Roles: `SELLER`, `ADMIN`; seller must own the product. Defaults: `currency=EUR`, `period=MONTH`, `isActive=true`. |

## Subscriptions
| Method | Path | Auth | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/billing/subscriptions` | Bearer | None | `SubscriptionListResponseDto` | Returns subscriptions for the current user with plan and product info. |
| POST | `/billing/subscriptions/:id/cancel` | Bearer | None | `CancelSubscriptionResponseDto` | Owner/admin only; idempotent; sets `cancelAtPeriodEnd=true` only. |

## Notes
- Subscribe flow (`POST /billing/subscribe`) and mock payments are documented in `payments-mock.md`.
- `PlanPeriod` enum currently contains only `MONTH`.

## Error codes
- `UNAUTHORIZED`
- `FORBIDDEN` (role not allowed by guard)
- `PRODUCT_NOT_FOUND`
- `NOT_OWNER`
- `FORBIDDEN_ROLE`
- `SUBSCRIPTION_NOT_FOUND`
