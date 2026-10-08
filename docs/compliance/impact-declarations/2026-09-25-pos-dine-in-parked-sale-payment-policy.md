---
status: draft_pr
owner: DGFY POS/checkout
last_reviewed: 2026-10-07
related_adr: docs/architecture/adr/0086-pos-parked-sale-stock-and-high-risk-approval-lifecycle.md
declaration_id: 2026-09-25-pos-dine-in-parked-sale-payment-policy
classification: major
surfaces: pos,terminal,payments,inventory,settings,store
reason_codes_impacted: ALLOWED
policy_version: 2026.09.25
verification_evidence: focused API/POS/storefront tests,guest checkout OTP expiry contract,scheduled date-time picker tests,affected app builds,architecture checks,local browser verification,git diff --check
rollback_note: Revert the related application commits and declaration; review tenant data before rolling back the additive dine-in and parked-sale migrations.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-08T09:13:46.748Z
preflight_request_ref: PREFLIGHT-37754614808-2026-09-25-POS-DINE-IN-PARKED-SALE-PAYMENT-POLICY
---

# POS dine-in, payment policy, and parked-sale lifecycle

## Compliance Impact Classification

Major. The change touches existing POS checkout, terminal queue, payment-timing,
inventory, tenant-location settings, storefront fulfillment, and parked-sale
workflows. It preserves the existing authentication, tenant isolation, operator
permission, inventory-authority, and payment settlement boundaries.

## Affected Surfaces

- `pos` and `terminal` — dine-in checkout, scheduled-order queue actions, cash
  collection, split payment, receipts/history, and parked-sale resume behavior.
- `payments` — dine-in payment timing, pay-at-store behavior, employee-credit
  split tender, and payment-policy validation.
- `inventory` — parked-sale stock lifecycle, resume validation, and stock
  movement/approval handling.
- `settings` and `store` — location fulfillment capabilities and storefront
  dine-in/payment choices.
- Storefront scheduled date/time selection and guest-checkout verification
  failure handling.

## Compliance Preconditions

- Existing tenant, branch, role, permission, active-shift, and paired-terminal
  gates remain authoritative.
- Inventory writes continue through the existing inventory command and movement
  services; parked sales do not bypass stock or approval controls.
- Payment timing and settlement validation remain server-authoritative, with
  client-side action availability treated only as a guard against invalid UI
  submissions.
- An expired guest-checkout email OTP is returned as a validation failure; it
  does not issue a checkout proof/token or weaken payment settlement controls.
- No production deployment, live-tenant migration, or payment collection is
  claimed by this declaration.

## Verification Evidence

- Focused API, migration, POS, and storefront tests are run before PR creation.
- Affected frontend builds and changed-backend syntax checks are run before PR
  creation.
- Architecture/compliance checks and `git diff --check` are run before PR
  creation.
- Local browser verification covers the scheduled dine-in queue, repaired
  payment timing, cash-collection modal, and hidden page/API errors without
  submitting a financial payment.
- Shared POS behavior fixtures include the explicit delivery cash timing
  contract required by the payment-timing guard.
- API route coverage verifies branch-scoped dine-in payment-policy updates
  honor UserLocationGrant access without relying on an undefined permission group.
- The aggregate staging merge restores the canonical POS downpayment-settings contract mocks and removes a stale unused import from the older staging tree; no product behavior changes in these integration cleanups.
- The aggregate staging merge binds the dine-in cash idempotency-key branch to the existing `isDineInOrder` helper; this preserves the staged dine-in cash-collection behavior and resolves the integrated file's missing helper reference.
- Guest-checkout OTP expiry, scheduled date/time selection, and payment-step
  regression tests remain part of the focused local validation set.
