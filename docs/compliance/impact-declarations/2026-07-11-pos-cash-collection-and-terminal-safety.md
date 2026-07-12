---
status: reference
owner: engineering
last_reviewed: 2026-07-11
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-11-pos-cash-collection-and-terminal-safety
classification: major
surfaces: pos,terminal,payments,online-orders
reason_codes_impacted: ALLOWED
policy_version: 2026.07.11
verification_evidence: focused cash-pickup, runtime-schema, health, and reconciliation tests; migration upgrade/rollback rehearsal; architecture and controller guardrails; backend lint; docs lint
rollback_note: Revert the POS cash collection endpoint, tenant schema contract, and terminal UI changes together. Run the migration down only after confirming no production transaction uses the collection evidence fields.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-11T17:50:00+08:00
preflight_request_ref: POS-CASH-COLLECTION-AND-TERMINAL-SAFETY-2026-07-11
---

# POS Cash Collection And Terminal Safety

## Compliance Impact Classification

Major. This changes a POS payment-collection workflow and terminal controls. It does not change tax calculation, fiscal receipt finalization, or Storefront payment-provider contracts.

## Affected Surfaces

- POS pickup orders paid in cash at the terminal.
- POS order completion guard for unpaid pickup orders.
- Terminal shift, cashier, payment evidence, and audit records.
- Tenant schema readiness checks for the payment collection fields.
- POS mobile terminal navigation and offline-access controls.

## Compliance Preconditions

- Cash collection is available only for an unpaid cash pickup order in `ready_for_pickup` with an active shift.
- Payment evidence records the cashier, shift, terminal, timestamp, amount received, and change atomically.
- Pickup completion remains blocked until payment status is `paid`.
- The request is idempotent and the server remains the payment and order-status authority.
- Online payment methods, delivery payment flows, Storefront routes, payloads, responses, and fiscal receipt issuance remain unchanged.

## Verification Evidence

- `npm --prefix backend test -- --runInBand tests/posPickupCashCollection.usecase.test.js tests/posSalesReconciliation.db.integration.test.js tests/posCheckout.db.integration.test.js`
- `npm --prefix backend test -- --runInBand tests/healthService.test.js tests/runtimeSchemaAuditService.test.js`
- `node backend/scripts/sync-tenant-schemas.js --mode report --fail-on-error`
- Cash-pickup migration upgrade and rollback rehearsal on a disposable database.
- `npm --prefix backend run lint`
- `npm --prefix backend run check:architecture-guardrails`
- `npm --prefix backend run check:controller-boundaries`
- `npm run lint:docs`
