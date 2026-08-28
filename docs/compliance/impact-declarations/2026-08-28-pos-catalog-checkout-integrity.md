---
status: reference
owner: engineering
last_reviewed: 2026-08-28
declaration_id: 2026-08-28-pos-catalog-checkout-integrity
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.08.28
verification_evidence: focused POS F&B checkout and repository tests,API architecture guardrails
rollback_note: Revert the inherited modifier-group repository include and its focused tests; checkout returns to direct item modifier assignments only.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-28T00:00:00Z
preflight_request_ref: NOT-EXECUTED-POS-CATALOG-CHECKOUT-INTEGRITY
---

# POS Catalog and Checkout Integrity

## Compliance Impact Classification

Major. The changed checkout repository is under `apps/dgfy-api/src/modules/pos/`,
whose classification floor is `major` for the `pos,terminal` surfaces. The
change loads folder-inherited F&B modifier groups during server-side checkout
validation so a catalog item and its configured modifiers use the same contract.

## Affected Surfaces

- `pos`, `terminal` — server-side resolution of configured F&B modifier groups
  when validating sellable checkout items.

## Compliance Preconditions

- Existing terminal, location, inventory, authorization, tax, payment, and
  audit checks remain unchanged.
- Checkout accepts only modifier groups already configured directly on the item
  or inherited from its assigned catalog folder.
- No payment capture, discount, fiscal-output, or database-schema behavior is
  changed.

## Verification Evidence

- Focused POS F&B checkout and repository tests passed, including a regression
  case for folder-inherited modifier groups.
- API architecture and controller-boundary guardrails passed.

## Preflight Reconciliation

No live environment preflight was executed for this local/develop-targeted PR.
`preflight_request_ref: NOT-EXECUTED-POS-CATALOG-CHECKOUT-INTEGRITY` explicitly
records that promotion-time reconciliation is still required; this declaration
does not claim staging or production verification.
