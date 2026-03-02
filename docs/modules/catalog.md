# Catalog Module

## Purpose
Manages API products and their versions, with public visibility driven by status and owner/admin access for drafts.

## Public endpoints
| Method | Path | Auth | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/catalog/products` | Public | Query: `search`, `category`, `limit`, `offset` | `ProductListResponseDto` | Only `PUBLISHED` products; `search` is case-insensitive. |
| GET | `/catalog/products/:id` | Optional Bearer | None | `ProductDto` | Unpublished products require owner/admin; invalid token returns `UNAUTHORIZED`. |
| GET | `/catalog/products/:id/versions` | Optional Bearer | None | `VersionListResponseDto` | Public sees only `PUBLISHED` versions and only if product is `PUBLISHED`. |
| GET | `/catalog/versions/:versionId/schema` | Optional Bearer | None | `VersionSchemaDto` | Returns locally stored OpenAPI snapshot; public only for published product+version. |

### Listing query parameters
- `search`: string, trimmed; matches `title` contains (case-insensitive).
- `category`: string, exact match.
- `limit`: int, default `20`, max `100`.
- `offset`: int, default `0`.

## Seller/Admin endpoints
All seller/admin endpoints require `JwtGuard` + `RolesGuard` with `SELLER` or `ADMIN`.

| Method | Path | Auth | Request DTO | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| GET | `/catalog/my-products` | Bearer + Roles | Query: `search`, `category`, `limit`, `offset` | `ProductListResponseDto` | `SELLER` sees only own products across all statuses; `ADMIN` sees all products. |
| POST | `/catalog/products` | Bearer + Roles | `CreateProductDto` | `ProductDto` | Creates `DRAFT` product owned by current user. |
| PATCH | `/catalog/products/:id` | Bearer + Roles | `UpdateProductDto` | `ProductDto` | Owner/admin only; validates status transitions. |
| POST | `/catalog/products/:id/versions` | Bearer + Roles | `CreateVersionDto` | `VersionDto` | Owner/admin only; `version` must be unique per product. |
| PATCH | `/catalog/versions/:versionId` | Bearer + Roles | `UpdateVersionDto` | `VersionDto` | Owner/admin only; validates version status transitions. |

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
