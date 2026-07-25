---
status: reference
owner: engineering
last_reviewed: 2026-07-25
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-25-frontend-lint-and-cart-quantity-handler-repair
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.25
verification_evidence: npm --prefix frontend run lint,npm --prefix frontend run build:pos,npm --prefix frontend run build:store,npx vitest run focused frontend contracts,git diff --check
rollback_note: Revert the restored Current Sale quantity pointer handlers and responsive button rendering together with the Storefront lint-safe derived state changes and updated image fallback contract; no payment, discount, tax, receipt, inventory, or persisted transaction behavior is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-25T16:40:00+08:00
preflight_request_ref: PR-93-FRONTEND-LINT-REPAIR
---

# Frontend Lint and Cart Quantity Handler Repair

## Compliance Impact Classification

Major. The change touches the governed POS terminal checkout component, so the `pos` and `terminal` classification floor applies. The implementation restores cart quantity interaction helpers lost during branch conflict resolution and removes frontend lint violations without changing financial calculations or persisted data contracts.

## Affected Surfaces

1. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` restores the existing pointer handlers used by the Current Sale cart-line quantity increase button. Desktop and tablet retain long-press bulk quantity selection, while mobile retains the existing single-tap increment behavior through responsive rendering.
2. Storefront affiliate QR, featured merchant pagination, and F&B image fallback state are made lint-safe through keyed or derived state. These are presentation-state changes only.
3. The F&B image fallback contract test is updated to assert the URL-keyed failure state that prevents a failed previous image URL from hiding a later valid image.

## Compliance Preconditions

1. Cart quantity changes continue to call the existing `updateCartQuantity` function; stock validation and total recalculation remain centralized and unchanged.
2. No checkout amount, discount, VAT, payment, receipt, shift, or transaction persistence code is modified.
3. The pointer handlers preserve the existing quantity meter constants and commit only on pointer release.
4. Storefront state changes do not alter catalog availability, pricing, ordering, or payment contracts.

## Verification Evidence

1. Frontend lint completes with zero errors.
2. Five focused frontend test files pass with 29 tests.
3. POS and Storefront production builds complete successfully.
4. `git diff --check` reports no whitespace errors, and changed files contain no `DO NOT COMMIT` markers.
