# API Docs

When to use:
1. API contracts and endpoint semantics
2. Request/response format decisions
3. Integration behavior between frontend and backend

## Current Notes
1. Tenant onboarding contract uses three step keys: `brand_assets`, `primary_location`, and `bulk_items`.
2. `POST /onboarding/items/bulk` creates starter items from the active workflow mode's onboarding presets with row-level partial-save results.
3. `GET /onboarding/status` exposes checklist readiness for `store_name_ready`, `has_primary_storefront_location`, and `has_priced_starter_item`; legacy `classification_snapshot` data may exist on older tenants but is not written by the current wizard.
4. Company user invitations are token-first. `POST /auth/accept-invite` resolves tenant context from the landlord invitation registry and returns the same usable auth payload shape as login.
5. Admin user-management invitation actions are documented in `docs/api/specification.md`: create invite, include pending invitations, resend, copy/generate manual link, and cancel.
6. Customer Access Mode and Inventory Display are default-on public Storefront API contracts. Discovery/profile/catalog responses expose additive access metadata; quote, checkout, public service booking/batch booking, and waitlist mutations fail closed with `CUSTOMER_ACCESS_MODE_BLOCKED` when effective mode does not permit the action. `GET /settings` also returns read-only virtual key `customer_access_modes_enabled` so Settings can show the effective runtime enforcement state. `CUSTOMER_ACCESS_MODES_ENABLED=false` is an explicit rollback switch; `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` can re-enable selected tenants during rollback recovery.
7. Public storefront catalog payloads intentionally omit raw `current_stock` and `cost_per_unit`; clients must use `inventory_display` for customer-facing stock labels and optional public display quantity.
8. Barcode APIs are split by surface: `/items/*/barcodes` manages tenant-local identities and labels, `/pos/scan` applies POS readiness before cart use, and `/store/qr/resolve` exposes only Storefront-safe public QR payloads.
9. Customer-facing sale APIs use `default_sale_price` only. POS, Storefront checkout/QR, public service booking, Dispatch Orders, and future sale surfaces must reject missing or zero selling price instead of falling back to `cost_per_unit`; internal cost remains for stock movement, valuation, COGS, and profitability reporting only. Transaction-capable Storefront modes support repeated orders/bookings and quantity `1+` when POS-equivalent readiness passes. Storefront product quote/checkout aggregates stock-bearing requested quantity by `item_id` before stock validation, so duplicate lines or modifier-split lines cannot exceed available stock in one checkout. Public service hold/booking mutations require `idempotency_key`, short-lived active holds count against service capacity, and service quantity above `1` requires a capacity anchor such as an active assigned resource.
10. Tenant location pins are tenant-private Settings APIs. `DELETE /tenant-locations/:id` deactivates a location and preserves operational history. `DELETE /tenant-locations/:id/permanent` is only for unused pins; it returns `409` with `reference_counts` when POS, inventory, booking, service, or user-location history exists, and `503` when the backend cannot prove every tenant-local reference source is inspectable.
