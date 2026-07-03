---
status: reference
owner: engineering
last_reviewed: 2026-06-26
related_adr: docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md
declaration_id: 2026-06-26-fnb-pos-inventory-boundary
classification: regulatory
surfaces: pos,terminal,settings,inventory,purchase_orders,workflow_mode,storefront,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,AUTHORIZATION_FAILED
policy_version: 2026.06.26
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm --prefix backend test -- --runTestsByPath tests/posCheckoutFnbContracts.usecase.test.js tests/posOperationReplayParity.usecase.test.js tests/posUsecases.applicationResult.test.js tests/purchaseOrderUsecases.applicationResult.test.js,npm --prefix frontend test -- --run src/features/settings/__tests__/workflowMode.services.test.js src/features/settings/components/__tests__/WorkflowModeRouteGate.test.jsx --testTimeout 20000,npm --prefix frontend run build:all,git diff --check
rollback_note: Revert the F&B POS inventory-boundary commit to return POS and purchase-order stock writes to the previous stock movement integration; no schema rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-26T00:00:00+08:00
preflight_request_ref: FNB-POS-INVENTORY-BOUNDARY-2026-06-26
---

# F&B POS Inventory Boundary

## Compliance Impact Classification

Major.

This declaration covers the POS and purchase-order inventory command boundary used by F&B recipe-aware checkout, online order completion, POS void reversal, and purchase-order receipt. It also covers frontend route-gate changes that keep mode-sensitive manufacturing, F&B, Services, and Hospitality routes from mounting until the tenant workflow mode is resolved.

## Affected Surfaces

- POS checkout stock deduction now calls the inventory command boundary for sold items and F&B recipe ingredients.
- Online Storefront order completion through POS uses the same inventory command boundary for recipe-aware fulfillment deductions.
- POS void reversal returns stock through the inventory command boundary.
- Purchase-order receipt records receipt movements through the inventory command boundary.
- F&B mode documentation clarifies that offline POS decrements central stock only after replay reaches the backend successfully.
- Workflow-mode navigation and route gates fail closed while workflow mode is unresolved, preventing transient exposure of hidden manufacturing/F&B/Services/Hospitality routes.

## Compliance Preconditions

1. Fiscal receipt selection, VAT/service-charge calculation, and DGFY convenience fee behavior remain unchanged.
2. F&B recipe deductions must remain location-scoped and must fail before commit when ingredient stock is short or UOM conversion is incompatible.
3. Storefront accepted orders must not deduct recipe stock until the online order is completed or fulfilled through POS.
4. Offline POS queued checkout must not decrement central inventory until replay reaches the backend and commits successfully.
5. POS idempotency and replay contracts must remain deterministic for processed, blocked, and conflict outcomes.
6. Workflow-mode route guards must not mount hidden route content before active `ops_workflow_mode` is resolved.
7. No PayMongo/payment-channel code is included in this release slice.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm --prefix backend test -- --runTestsByPath tests/posCheckoutFnbContracts.usecase.test.js tests/posOperationReplayParity.usecase.test.js tests/posUsecases.applicationResult.test.js tests/purchaseOrderUsecases.applicationResult.test.js`
- `npm --prefix frontend test -- --run src/features/settings/__tests__/workflowMode.services.test.js src/features/settings/components/__tests__/WorkflowModeRouteGate.test.jsx --testTimeout 20000`
- `npm --prefix frontend run build:all`
- `git diff --check`

The DB-backed `backend/tests/purchaseOrder.test.js` API suite requires local database credentials; this clean worktree did not have DB env loaded, so targeted non-DB purchase-order use-case coverage is the local proof and production deploy gates must provide runtime DB proof.

## No Architecture Exception Required

The change keeps POS orchestration in the POS module and stock mutations behind the inventory module command boundary. It does not introduce a new architecture allowlist exception.
