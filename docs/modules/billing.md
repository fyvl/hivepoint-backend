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
| GET | `/billing/config` | Bearer | None | `BillingConfigResponseDto` | Returns active payment provider and whether customer portal is available. |
| GET | `/billing/checkout-status/:sessionId` | Bearer | None | `CheckoutStatusDto` | Returns checkout sync state for the current user after redirect from Stripe Checkout. |
| POST | `/billing/portal-session` | Bearer | None | `BillingPortalSessionResponseDto` | Creates a customer portal session for the active payment provider. |
| POST | `/billing/subscriptions/:id/cancel` | Bearer | None | `CancelSubscriptionResponseDto` | Owner/admin only; idempotent; schedules cancel at period end and syncs Stripe when the subscription uses `STRIPE`. |

## Notes
- Subscribe flow (`POST /billing/subscribe`) and mock payments are documented in `payments-mock.md`.
- Stripe webhook sync now also stores recurring Stripe invoices locally by `externalInvoiceId`, so invoice history is not limited to the first checkout invoice.
- `PlanPeriod` enum currently contains only `MONTH`.

## Error codes
- `UNAUTHORIZED`
- `FORBIDDEN` (role not allowed by guard)
- `PRODUCT_NOT_FOUND`
- `NOT_OWNER`
- `FORBIDDEN_ROLE`
- `SUBSCRIPTION_NOT_FOUND`
- `CHECKOUT_SESSION_NOT_FOUND`
