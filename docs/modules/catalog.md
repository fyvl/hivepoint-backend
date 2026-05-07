# Catalog Module

## Purpose

Manages API products and their versions, with public visibility driven by status and owner/admin access for drafts.

## Public endpoints

| Method | Path                                  | Auth            | Request                                        | Response                 | Notes                                                                               |
| ------ | ------------------------------------- | --------------- | ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| GET    | `/catalog/products`                   | Public          | Query: `search`, `category`, `limit`, `offset` | `ProductListResponseDto` | Only `PUBLISHED` products; `search` is case-insensitive.                            |
| GET    | `/catalog/products/:id`               | Optional Bearer | None                                           | `ProductDto`             | Unpublished products require owner/admin; invalid token returns `UNAUTHORIZED`.     |
| GET    | `/catalog/products/:id/versions`      | Optional Bearer | None                                           | `VersionListResponseDto` | Public sees only `PUBLISHED` versions and only if product is `PUBLISHED`.           |
| GET    | `/catalog/versions/:versionId/schema` | Optional Bearer | None                                           | `VersionSchemaDto`       | Returns locally stored OpenAPI snapshot; public only for published product+version. |

### Listing query parameters

- `search`: string, trimmed; matches `title` contains (case-insensitive).
- `category`: string, exact match.
- `limit`: int, default `20`, max `100`.
- `offset`: int, default `0`.

## Seller/Admin endpoints

All seller/admin endpoints require `JwtGuard` + `RolesGuard` with `SELLER` or `ADMIN`.

| Method | Path                                | Auth           | Request DTO                          | Response                                | Notes                                                                            |
| ------ | ----------------------------------- | -------------- | ------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/catalog/my-products`              | Bearer + Roles | Query: `search`, `category`, `limit`, `offset` | `ProductListResponseDto`                | `SELLER` sees only own products across all statuses; `ADMIN` sees all products.  |
| POST   | `/catalog/products`                 | Bearer + Roles | `CreateProductDto`                   | `ProductDto`                            | Creates `DRAFT` product owned by current user.                                   |
| POST   | `/catalog/ai/product-description`   | Bearer + Roles | `GenerateProductDescriptionDto`      | `GenerateProductDescriptionResponseDto` | Uses the configured LLM provider to draft catalog copy from title/category/tags. |
| POST   | `/catalog/ai/category-suggestions`  | Bearer + Roles | `SuggestProductCategoryDto`          | `SuggestProductCategoryResponseDto`     | Uses the configured ML service to suggest one category and top-k tags.           |
| PATCH  | `/catalog/products/:id`             | Bearer + Roles | `UpdateProductDto`                   | `ProductDto`                            | Owner/admin only; validates status transitions.                                  |
| POST   | `/catalog/products/:id/versions`    | Bearer + Roles | `CreateVersionDto`                   | `VersionDto`                            | Owner/admin only; `version` must be unique per product.                          |
| PATCH  | `/catalog/versions/:versionId`      | Bearer + Roles | `UpdateVersionDto`                   | `VersionDto`                            | Owner/admin only; validates version status transitions.                          |

## AI category and tag suggestions

- `POST /catalog/ai/category-suggestions` accepts `title`, `description`, and optional `topKTags` (`1..10`, default `3`).
- The backend proxies the request to `ML_SERVICE_URL/classify`, applies `ML_REQUEST_TIMEOUT_MS`, and returns `{ category, categoryScore, tags, method, model }`.
- Suggestions prefill Seller Studio fields only. Product `category` and `tags` remain editable by the seller before create/update.
- The ML taxonomy currently returns these category keys: `payments`, `communications`, `auth_identity`, `data_validation`, `ai_ml`, `geo_maps`, `finance_data`, `ecommerce_logistics`, `media_content`, `analytics_monitoring`.
- Existing catalog product categories are still stored as strings for backward compatibility with seeded and user-created data.

## Visibility and ownership rules

- Public listing and product views show only `PUBLISHED` products.
- Public versions listing shows only `PUBLISHED` versions, and only if the product is `PUBLISHED`.
- Public schema snapshot read is allowed only when both product and version are `PUBLISHED`.
- Owner or `ADMIN` can view and update products/versions regardless of status.
- `SELLER` can create/update only their own products and versions.

## OpenAPI storage

- On version create/update (when `openApiUrl` is provided), backend fetches the schema and stores a local snapshot.
- Stored snapshot is returned by `/catalog/versions/:versionId/schema`.
- If fetching fails, create/update returns `VALIDATION_ERROR` with message `OPENAPI_FETCH_FAILED`.

## Status values

- `ProductStatus`: `DRAFT`, `PUBLISHED`, `HIDDEN`.
    - Allowed transitions: `DRAFT -> PUBLISHED`, `PUBLISHED -> HIDDEN`, `HIDDEN -> PUBLISHED` (same-status updates are allowed).
- `VersionStatus`: `DRAFT`, `PUBLISHED`.
    - Allowed transitions: `DRAFT <-> PUBLISHED` (same-status updates are allowed).

## Error codes

- `UNAUTHORIZED` (invalid bearer token on optional-auth endpoints)
- `FORBIDDEN` (role not allowed)
- `PRODUCT_NOT_FOUND`
- `VERSION_NOT_FOUND`
- `PRODUCT_NOT_PUBLIC`
- `NOT_OWNER`
- `VERSION_ALREADY_EXISTS`
- `VALIDATION_ERROR` (message `INVALID_STATUS_TRANSITION` or invalid payload)
- `LLM_NOT_CONFIGURED`
- `LLM_UPSTREAM_UNAVAILABLE`
- `ML_SUGGESTIONS_DISABLED`
- `ML_UPSTREAM_UNAVAILABLE`
