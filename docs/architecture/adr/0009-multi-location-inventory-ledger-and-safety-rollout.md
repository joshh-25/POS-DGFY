# ADR 0009: Multi-Location Inventory Ledger and Safety-First Rollout

## Status
Accepted (2026-04-16)

## Context
The platform currently supports tenant locations for storefront and POS lifecycle routing, but inventory stock accounting remains globally scoped to `items.current_stock` and location-agnostic FIFO batches/movements.

Business requirements now require:
1. Per-location authoritative stock.
2. Location-aware PO/JO/POS/storefront stock behavior.
3. Location-scoped operational permissions.
4. A safety-first rollout that minimizes destructive migration risk.

This is a cross-boundary change spanning inventory, purchase orders, job orders, POS, storefront, receive tokens, user access control, and reporting contracts.

## Decision
Adopt a phased multi-location inventory architecture with these rules:

1. `item_location_stocks` becomes the authoritative stock ledger by `(item_id, location_id)`.
2. `items.current_stock` remains a derived compatibility aggregate (sum of all location balances) during rollout.
3. FIFO batches become location-scoped.
4. Stock movements carry explicit location dimensions:
   - single-location actions via `location_id`
   - transfer actions via `source_location_id` + `destination_location_id`
5. Storefront checkout remains single-location per order.
6. Oversell policy for selected location is fail-closed (hard block unless explicitly allowed by policy).
7. QR receive flow requires authenticated users; receiver chooses location at receive time and backend enforces location access.
8. Location grants are enforced across stock-affecting inventory workflows.
9. Feature rollout is gated by `multi_location_inventory_enabled` and no-go safety checks.
10. User location grants are admin-managed via explicit APIs/UI, and users without grants are fail-closed when the multi-location flag is enabled.

## Locked Product Decisions
1. Legacy stock migration assigns opening balances to tenant primary location.
2. JO completion uses one source location for all ingredient deductions and one destination for output.
3. Dedicated location transfer flow is included in this phase.
4. Storefront location discovery may be filtered by item availability for map/list/grid UX.
5. Customer-facing storefront stock visibility defaults to availability status (not exact counts).

## Safety and Rollout Policy
1. Additive schema only during rollout (no destructive drops/renames in migration window).
2. Backup + restore drill must pass before production cutover.
3. Backfill parity checks must pass for item totals and FIFO integrity.
4. Drift monitor must show stable zero unresolved mismatches for defined soak window.
5. Pilot tenant end-to-end readiness must pass before broader rollout.
6. Rollback rehearsal must be executed and documented before tenant wave expansion.
7. Every rollout wave must pass architecture/compliance/testing gates.

## Consequences
1. Inventory logic centralizes around location-scoped stock and movement invariants.
2. Existing integrations reading `items.current_stock` continue to function during compatibility window.
3. Additional validation and permission checks are required across operational write paths.
4. Rollout complexity increases, but blast radius is reduced through phased enablement.

## Acceptance Criteria
1. Every stock-affecting action updates the correct location ledger and preserves global derived parity.
2. No location-unauthorized write action succeeds.
3. PO/JO/POS/storefront flows enforce location stock semantics under the feature flag.
4. Safety gates are recorded as pass/fail evidence per rollout wave.
5. Critical-systems regression watchlist remains green for tenant isolation, source separation, checkout error contract, and permission gating.

## Rollback Notes
1. Runtime rollback disables `multi_location_inventory_enabled` while preserving additive schema.
2. Data rollback is performed from validated tenant backups when required by incident policy.
3. Destructive cleanup migrations are deferred to a later, separately approved phase after full cutover stability.
4. Bootstrap migrations seed opening balances and user-location grants to reduce cutover lockout risk.
