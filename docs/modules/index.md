# Modules

This folder documents the HTTP-facing modules implemented in the backend. Each module doc only describes what is present in code.

- [Auth](./auth.md): Registration, login, token refresh, and logout. Issues JWTs and manages refresh cookies only.
- [Users](./users.md): Current-user lookup based on the authenticated request context.
- [Catalog](./catalog.md): Public product browsing plus seller/admin product and version management with status-based visibility.
- [Billing](./billing.md): Plans, subscriptions, Stripe-backed checkout flow, customer portal, and invoice tracking.
- [Gateway](./gateway.md): Runtime dispatch and proxy endpoints that validate API keys/subscriptions and forward requests to seller-hosted APIs.
- [Keys](./keys.md): API key creation, listing, and revocation for the current user.
- [Usage](./usage.md): Internal usage ingestion and per-subscription usage summaries.
- [Admin](./admin.md): Admin-only moderation actions for products, versions, and API keys.
- [Mock payments](./payments-mock.md): Subscribe flow and mock payment endpoints guarded by a shared secret.

