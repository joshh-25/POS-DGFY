---
status: reference
owner: engineering
last_reviewed: 2026-07-08
related_adr: docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md
declaration_id: 2026-07-07-pos-commercial-and-statutory-discount-hardening
classification: major
surfaces: pos,terminal,storefront,settings
reason_codes_impacted: INVALID_PROMO_CODE,PROMO_USAGE_LIMIT_REACHED,PROMO_TIME_RANGE_BLOCKED,PROMO_ITEMS_NOT_IN_ORDER,STATUTORY_IDENTITY_REQUIRED,STATUTORY_ITEM_SELECTION_REQUIRED,STATUTORY_ITEM_NOT_ELIGIBLE,EMPLOYEE_NOT_FOUND,DISCOUNT_RULE_INACTIVE,DISCOUNT_APPROVER_REQUIRED,DISCOUNT_APPROVER_INACTIVE,DISCOUNT_APPROVER_ROLE_INVALID,DISCOUNT_APPROVER_PIN_NOT_CONFIGURED,DISCOUNT_APPROVER_PIN_INVALID,DISCOUNT_SELF_APPROVAL_BLOCKED
policy_version: 2026.07.08
verification_evidence: backend focused discount tests,backend eslint,frontend discount card contract test,POS production build
rollback_note: Revert application changes and roll back migration 20260707000001; completed transaction audit rows remain valid unless the migration is explicitly reversed.
preflight_result: no_breach
preflight_reason_code: POS_DISCOUNT_SERVER_AUTHORITY_HARDENING
preflight_run_at: 2026-07-07T12:55:00Z
preflight_request_ref: DGFY-POS-DISCOUNT-2026-07-07
---

# POS Commercial and Statutory Discount Hardening

## Compliance Impact Classification

Major. This changes POS checkout discount authority and audit persistence. It does
not change fiscal document numbering, payment authorization, settlement, VAT rate,
or Storefront promo configuration semantics.

## Affected Surfaces

1. Commercial Promo uses the existing Storefront promo code, rate, target items,
   schedule, and tenant-wide usage limit in POS checkout.
2. Senior/PWD requires beneficiary identity and explicit server-eligible item
   selection. The statutory rate remains server-owned.
3. Employee identity resolves to an active tenant user. Manual and Employee require
   an individually identified active Admin/Manager and that user's approval PIN.
4. Checkout ignores submitted preview totals and persists server-calculated line
   allocations, rule ID, promo code, and calculation version.

## Compliance Preconditions

1. The additive migration must run before application rollout.
2. `storefront_promo` must remain JSON and tenant-scoped.
3. Promo usage is shared across Storefront and POS and increments transactionally.
4. Only the Master Admin may configure individual approver PINs. PIN hashes are
   never returned, employee self-approval is rejected, and completed discounts
   store the verified approver and timestamp.
5. No compliance or architecture exception/allowlist is introduced.

## Verification Evidence

- `backend/tests/posDiscountPolicy.unit.test.js`
- `backend/tests/posDiscountCalculator.unit.test.js`
- `backend/tests/posValidator.discountPolicy.test.js`
- `frontend/src/features/pos/__tests__/discountTypeCards.contract.test.js`
- Backend focused ESLint: passed.
- POS production build: passed.
- POS checkout DB integration test: passed using an isolated migrated database,
  including verified manager attribution persistence.

## Rollout Note

This governed change set also includes the paired POS frontend contract updates
and terminal workflow hardening that were committed alongside the backend
discount, cashier, and shift enforcement changes.
