---
status: reference
owner: engineering
last_reviewed: 2026-08-17
declaration_id: 2026-08-17-pos-drawer-discount-payments-hardening
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: DISCOUNT_APPROVAL_REQUIRED,DRAWER_AUTHORIZATION_REQUIRED,DRAWER_PIN_INVALID,DRAWER_AUTHORIZATION_FAILED,PAYMENT_PROVIDER_UNCONFIRMED
policy_version: 2026.08.17
verification_evidence: npm test -- --runTestsByPath tests/posDrawerAuthorization.unit.test.js tests/posItemDiscountPolicy.unit.test.js,npm run check:architecture-guardrails,npm run check:compliance,npm run build:all
rollback_note: Revert the drawer authorization, item-discount audit, storefront payment capability, and additive migration changes together; do not roll back the item snapshot column after live sales exist without an approved backup and data-retention plan.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-17T23:30:00+08:00
preflight_request_ref: AUDIT-2026-08-17
---

# POS Drawer, Discount, and Online Payment Hardening

## Compliance Impact Classification

Major. The change governs cashier PIN authorization, cash-drawer access, item-level
discount accountability, and Storefront PayMongo payment finalization. It changes
authorization and audit evidence but does not alter historical posted transactions.

## Affected Surfaces

- POS checkout, discount approval, transaction history, and administrator audit views.
- Terminal cash-drawer authorization, hardware bridge calls, and drawer audit events.
- Storefront online payment method selection and PayMongo webhook finalization.
- Tenant schema synchronization and the additive item-discount snapshot column.

## Compliance Preconditions

- Raw PIN values and hashes remain outside audit payloads and client responses.
- Every manual drawer open and every discount is authorized server-side and linked to
  the authenticated employee, shift, terminal, transaction, and cashier context.
- Walk-in POS GCash remains a local tender and never creates a PayMongo session.
- Storefront orders finalize only after verified provider confirmation.
- Migration application is tenant-schema covered and rollback is not used to erase
  live discount evidence.

## Verification Evidence

- Focused backend authorization, item-discount, checkout, schema, and repository tests.
- Focused Storefront/POS contract tests and all affected application builds.
- Architecture guardrail, controller-boundary, compliance, documentation, and tenant
  schema coverage checks.
- Local POS hardware authorization smoke path and PayMongo sandbox webhook/return-path
  test evidence when credentials and devices are available.
