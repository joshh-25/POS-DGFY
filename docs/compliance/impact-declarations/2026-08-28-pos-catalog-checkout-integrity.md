---
status: reference
owner: engineering
last_reviewed: 2026-08-28
declaration_id: 2026-08-28-pos-catalog-checkout-integrity
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.08.28
verification_evidence: focused POS checkout and governed-discount tests,focused POS F&B checkout,GTIN persistence,image lifecycle and repository tests,POS production build,API architecture guardrails
rollback_note: Revert the inherited modifier include,POS-scoped GTIN persistence,and responsive-image manifest detection together with their focused tests; no schema rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-28T00:00:00Z
preflight_request_ref: NOT-EXECUTED-POS-CATALOG-CHECKOUT-INTEGRITY
---

# POS Catalog and Checkout Integrity

## Compliance Impact Classification

Major. The changed checkout repository is under `apps/dgfy-api/src/modules/pos/`,
whose classification floor is `major` for the `pos,terminal` surfaces. The
changes align three existing catalog contracts: folder-inherited F&B modifiers
are loaded during checkout validation, scanner-entered GTINs persist with POS
scope, and already-optimized responsive image manifests are reused rather than
stored repeatedly.

## Affected Surfaces

- `pos`, `terminal` — server-side resolution of configured F&B modifier groups
  when validating sellable checkout items, POS item GTIN create/edit persistence,
  catalog image presentation, checkout payment/summary presentation, governed
  discount entry and whole-unit item selection, and Employee Credit balance
  review.

## Compliance Preconditions

- Existing terminal, location, inventory, discount calculation, discount
  authorization, payment capture, tax, fiscal-output, and audit checks remain
  unchanged. Checkout presentation and cashier entry flow change, but the
  governed calculations and server mutations do not.
- Checkout accepts only modifier groups already configured directly on the item
  or inherited from its assigned catalog folder.
- Scanner-entered manufacturer GTINs remain tenant-owned item barcodes and are
  saved with the existing POS visibility scope.
- Responsive image assets are reused only when their stored lifecycle manifest
  proves they already contain the expected optimized variants.
- No database-schema behavior is changed.

## Verification Evidence

- Focused API suites passed for F&B checkout, GTIN contracts, repository image
  persistence, and responsive image lifecycle behavior.
- Focused POS tests passed for primary barcode selection and GTIN persistence.
- Focused POS tests cover the shared discount workspace, whole-unit quantity
  selection, Employee Credit before/after balances, payment entry, service
  charge summary, and checkout popup behavior.
- The POS production build completed successfully.
- API architecture and controller-boundary guardrails passed.

## Preflight Reconciliation

No live environment preflight was executed for this local/develop-targeted PR.
`preflight_request_ref: NOT-EXECUTED-POS-CATALOG-CHECKOUT-INTEGRITY` explicitly
records that promotion-time reconciliation is still required; this declaration
does not claim staging or production verification.
