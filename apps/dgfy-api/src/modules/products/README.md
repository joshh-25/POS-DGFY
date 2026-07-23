# products module

Scaffolded in Phase 8 Wave 3 (`.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-03-PLAN.md`): product catalog (Food/Service/Retail category, Basic-Inventory-vs-non-stock `inventory_mode`), flat product-folder grouping (D-14), and the mark-bookable configuration (BOK-01) that the Booking module (08-07) consumes.

## Relationship to `businesses`

Follows the same Clean Architecture layering as `../businesses/`: `routes -> controllers -> usecases -> repositories -> models`, composed in `index.js`'s `buildProductsModule()`. Product/folder writes are owner-gated via `requireMembership`/`guardBusinessAccess` against the `businesses` module's `BusinessRepository` (membership lives in the landlord `dgfy_core` database); product/folder data itself lives in the tenant `dgfy_business_*` database, resolved via the injected `TenantConnector`.

## Endpoints

- `POST /products` — create a product (owner role required)
- `GET /products` — list products (membership required)
- `PATCH /products/:id` — update a product (owner role required)
- `PATCH /products/:id/bookable` — mark a service-category product bookable with `slot_duration_minutes`/`concurrent_capacity` (BOK-01, owner role required)
- `POST /products/folders` — create a product folder (per-tenant-unique name, owner role required)
- `GET /products/folders` — list product folders (membership required)

## Prohibitions honored

- No FK or model reference into legacy `items`/`PosTransactionLine` — new `dgfy_business_*` tables only (PRD-05).
- No `stock_effect_type` field on `Product` (D-07 — lives on `AvailmentItem` in Phase 9).
- `product_folders` are flat (D-14) — no self-referencing nesting column, even though the read-only legacy `ItemFolder` reference model has one.
