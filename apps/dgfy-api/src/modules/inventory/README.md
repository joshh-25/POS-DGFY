# inventory module

Scaffolded in Phase 8 Wave 3 (`.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-04-PLAN.md`): the sole writer of the append-only `inventory_movements` ledger (PRD-04, ADR 0029), shipping manual restock/loss/adjustment endpoints plus the reserved (unwired) sale/booking effect-type contracts Phase 9 (`modules/availment`) and this phase's own `modules/booking` fulfillment path will call into later (D-06).

## Relationship to `businesses` and `products`

Follows the same Clean Architecture layering as `../businesses/` and `../products/`: `routes -> controllers -> usecases -> repositories -> models`, composed in `index.js`'s `buildInventoryModule()`. Manual movement writes are staff-or-owner-gated via `requireMembership`/`guardBusinessAccess` against the `businesses` module's `BusinessRepository` (membership lives in the landlord `dgfy_core` database); movement/product data itself lives in the tenant `dgfy_business_*` database, resolved via the injected `TenantConnector`.

## Single-writer contract (ADR 0029)

`modules/inventory` is the ONLY writer of `inventory_movements` rows. The repository exposes ONLY `create`/`bulkCreate`/`findAll`/`findOne` on the movement surface — never `update`/`destroy`. `recordMovementWithStockSync()` inserts the movement row and, for a `basic_inventory` product, applies a guarded `stock_count` delta on `products` inside one `sequelize.transaction()`.

## Endpoints

- `POST /inventory/restock` — record a restock movement (positive quantity; staff-or-owner)
- `POST /inventory/loss` — record a loss movement (positive quantity, applied as a negative delta; staff-or-owner)
- `POST /inventory/adjustment` — record a manual adjustment movement (signed, non-zero quantity; staff-or-owner)
- `GET /inventory/movements` — list movements, optionally filtered by `product_id` (membership required)

## Reserved effect contracts (D-06)

`recordSaleEffect({ businessId, productId, quantity, referenceType: 'availment', referenceId, actorAccountId? })` and `recordBookingEffect({ businessId, productId, quantity, referenceType: 'booking', referenceId, actorAccountId? })` validate their input shape then throw a `501 RESERVED_EFFECT_NOT_IMPLEMENTED` `DomainError` — nothing calls them this phase. Phase 9 (`modules/availment`, on checkout completion) and this phase's own `modules/booking` (on booking fulfillment) are the documented future callers; wiring them is expected to be a thin wrapper around `recordMovementWithStockSync()` with `movement_type: 'sale' | 'booking'`.

## Prohibitions honored

- No FK or model reference into legacy `items`/`stock_movements`/`PosTransactionLine` — the ledger table is `inventory_movements`, never `stock_movements` (that legacy IMS name stays rejected in `dgfyBusinessContract.js`).
- No `update`/`destroy` method on the movement repository surface (append-only, ADR 0029 single-writer).
- No other module writes `inventory_movements` directly — booking/availment request effects through this module once D-06's reserved contracts are wired.
