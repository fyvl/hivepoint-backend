# Subscribe and Payment Providers

## Purpose
Implements the subscribe flow that creates a pending subscription and a draft invoice, then delegates payment link creation to the active payment provider. Mock endpoints remain available for local development and smoke tests.

The billing module can now switch `/billing/subscribe` between mock and Stripe checkout via `PAYMENT_PROVIDER`, while keeping mock endpoints available for local development and smoke tests.

## Subscribe flow
`POST /billing/subscribe` performs:
1. Load plan by `planId` and ensure `isActive=true`.
2. Ensure the plan's product exists.
3. Prevent duplicates: active subscription to the same product -> `ALREADY_SUBSCRIBED`; pending subscription to the same product -> `SUBSCRIPTION_PENDING`.
4. Create subscription with `status=PENDING`, `currentPeriodStart=null`, `currentPeriodEnd=null`, `cancelAtPeriodEnd=false`.
5. Create invoice with `status=DRAFT`, `periodStart=now`, `periodEnd=now + 1 month` (UTC month increment).
6. Return a `paymentLink` from the active payment provider.

## Endpoints
| Method | Path | Auth | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| POST | `/billing/subscribe` | Bearer | `SubscribeDto` | `SubscribeResponseDto` | Creates subscription + invoice and returns `paymentLink`. |
| POST | `/billing/mock/succeed` | `x-mock-payment-secret` header | Query: `invoiceId` | `MockPaymentResponseDto` | Sets invoice `PAID`, subscription `ACTIVE` with invoice period; idempotent if already `PAID`. |
| POST | `/billing/mock/fail` | `x-mock-payment-secret` header | Query: `invoiceId` | `MockPaymentResponseDto` | Sets invoice `VOID`; subscription becomes `PAST_DUE` and may retain access through the configured grace period; idempotent if already `VOID`. |
| POST | `/billing/stripe/webhook` | Stripe signature header | Raw Stripe event body | `{ received: true }` | Consumes Stripe Checkout, invoice, and subscription lifecycle events. |

## Mock endpoint protection
- Required header: `x-mock-payment-secret`
- Value must match `MOCK_PAYMENT_SECRET` from the environment.

## Status transitions
- Invoice: `DRAFT -> PAID` on succeed, `DRAFT -> VOID` on fail.
- Subscription on succeed: `PENDING -> ACTIVE` and period fields set from the invoice.
- Subscription on fail: status becomes `PAST_DUE`; if the subscription already has a billing period, access can remain available through `BILLING_GRACE_PERIOD_DAYS`.

## Error codes
- `UNAUTHORIZED` (missing/invalid bearer token for `/billing/subscribe`)
- `PLAN_NOT_FOUND`
- `PLAN_INACTIVE`
- `PRODUCT_NOT_FOUND`
- `ALREADY_SUBSCRIBED`
- `SUBSCRIPTION_PENDING`
- `INVOICE_NOT_FOUND`
- `MOCK_PAYMENT_FORBIDDEN`

## Not implemented
- The `paymentLink` points to `/billing/mock/pay`, but there is no handler for this route in code.
- Mock endpoints do not simulate Stripe-style automatic retries or reconciliation. Stripe billing now covers checkout, recurring invoice sync, `PAST_DUE` retry metadata, customer portal recovery, cancel-at-period-end sync, grace periods, and background reconciliation.
