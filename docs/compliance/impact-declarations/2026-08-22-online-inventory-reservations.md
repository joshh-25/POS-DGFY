---
status: reference
owner: engineering
last_reviewed: 2026-08-22
declaration_id: 2026-08-22-online-inventory-reservations
classification: major
surfaces: pos,terminal,storefront,inventory
reason_codes_impacted: INVENTORY_RESERVATION_OVERSALE_PREVENTION
policy_version: 2026.08.22
verification_evidence: inventory-reservation-focused-tests,tenant-schema-registry-contracts,storefront-to-pos-unit-lifecycle
rollback_note: Revert the reservation models, service wiring, additive migration, tenant-schema registry entries, and reservation lifecycle tests together. The existing stock-issue path remains available for legacy online orders without a reservation row. Do not run a down migration against a database containing active reservations without first releasing or converting those holds.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T00:00:00+08:00
preflight_request_ref: PHASE-142-ONLINE-INVENTORY
---

# Online Inventory Reservation and Oversell Protection

## Compliance Impact Classification

Major. This change adds a server-side inventory hold before an online Storefront order is
accepted and changes the POS fulfillment lifecycle to convert or release that hold. It touches
POS and Storefront transaction paths, tenant schema provisioning, and the inventory ledger, but it
does not change payment credentials, payment-provider settlement, tax calculation, or fiscal
receipt rules.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/store/` — creates an online reservation in the same database
   transaction as the order and releases it when an online order is cancelled.
2. `apps/dgfy-api/src/modules/pos/` — converts a reservation when fulfillment completes and
   releases it when POS rejects or cancels an order; legacy orders without a reservation remain
   supported.
3. `apps/dgfy-api/src/modules/inventory/` and the shared inventory-effect utility — locks
   location stock rows, accounts for active non-expired holds, and preserves the existing direct,
   recipe, modifier, and stock-exempt policies.
4. `apps/dgfy-migration-runner/migrations/20260822000001-create-inventory-reservations.cjs` and
   `apps/dgfy-api/scripts/sync-tenant-schemas.js` — add two tenant-local tables and their indexes
   and foreign keys without broad `sync({ alter: true })` behavior.
5. `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx` and its extracted
   presentation utilities — keep terminal checkout, catalog animation, discount state, and
   layout behavior unchanged while enforcing the POS shell-size contract.

## Compliance Preconditions

1. Reservation creation is fail-closed: a shortfall rolls back the online order transaction and
   cannot silently create an oversold order.
2. Holds are tenant-location scoped, idempotent by online order, expire after a bounded TTL, and
   never store payment credentials or customer secrets.
3. POS completion/rejection and Storefront cancellation update reservation state inside their
   existing transaction boundaries; stock movements remain the authoritative fulfillment effect.
4. Existing tenant schemas were repaired only through the explicit local `repair-apply` command
   after approval. No production credentials, deployment, SSH operation, or provider call was
   used.

## Verification Evidence

1. Focused reservation, migration, lifecycle, Storefront checkout, and tenant-schema contract
   tests pass (6 suites, 41 tests in the final focused run).
2. The idempotent reservation migration and the tenant-schema registry declare the same two
   tables, foreign keys, indexes, and `DECIMAL(24,12)` quantity precision.
3. Tenant schema capability version is `2026-08-22.1`; local tenant repair remains an explicit
   operator-approved action and was not run against production in this session.
4. Storefront checkout and POS cancellation lifecycle unit coverage verifies reservation creation,
   release, conversion wiring, and rollback behavior; authenticated browser certification remains
   a release gate rather than claimed evidence here.
5. Architecture guardrails, controller-boundary checks, source lint, syntax checks, and
   `git diff --check` pass for the scoped implementation.
6. The implementation and migration changes are committed separately from the isolated router
   and compliance follow-up branches so this declaration remains bound to the core release batch.
7. Tenant-location reference coverage includes `InventoryReservation.location`, preventing
   reservation rows from bypassing location deletion guards.
