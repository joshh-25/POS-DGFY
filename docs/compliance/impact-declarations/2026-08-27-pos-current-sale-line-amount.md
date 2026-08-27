---
status: reference
owner: engineering
last_reviewed: 2026-08-27
declaration_id: 2026-08-27-pos-current-sale-line-amount
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.08.27
verification_evidence: focused POS checkout utility and shell tests (10/10),apps/dgfy-pos npm run build,apps/dgfy-ims npm run build,apps/dgfy-storefront npm run build,npm run check:architecture,npm run check:compliance
rollback_note: Revert the line-amount helper, Current Sale presentation change, test, and this declaration; checkout continues using the unchanged unit-price payload.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-27T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1090-POS-CURRENT-SALE-LINE-AMOUNT
---

# POS Current Sale Quantity-Adjusted Line Amount

## Compliance Impact Classification

Major. The changed files are under `packages/web-core/src/features/pos/`, whose
classification floor is `major` for the `pos,terminal` surfaces. This is a
presentation-only correction: the Current Sale card now displays quantity times
unit price as the line amount. It does not change payment capture, fiscal output,
authorization, inventory persistence, API behavior, or database schema.

## Affected Surfaces

- `pos`, `terminal` — Current Sale line amount display and its shared pure
  calculation utility.

## Compliance Preconditions

- `sale_price` remains the unit price in cart state, checkout payloads, receipts,
  and financial calculations.
- The new display uses the same quantity × unit-price calculation already used by
  the POS subtotal contract, including decimal quantities.
- No payment, discount authorization, tax, inventory mutation, API contract, or
  database/migration behavior changes.

## Verification Evidence

- Focused POS utility and checkout shell tests: 10/10 passed, including quantity
  2 × PHP 150 = PHP 300 and decimal quantity coverage.
- Production builds passed for `apps/dgfy-pos`, `apps/dgfy-ims`, and
  `apps/dgfy-storefront`.
- `npm run check:architecture` and `npm run check:compliance` passed.

## Preflight Reconciliation

No live environment preflight was executed for this local/develop-targeted PR.
`preflight_request_ref: NOT-EXECUTED-1090-POS-CURRENT-SALE-LINE-AMOUNT` is an
explicit record for the normal promotion-time preflight; this declaration does
not claim production verification.
