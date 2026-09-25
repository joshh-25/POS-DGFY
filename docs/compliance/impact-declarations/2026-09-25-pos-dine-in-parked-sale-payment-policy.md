---
status: draft_pr
owner: DGFY POS/checkout
last_reviewed: 2026-09-25
related_adr: docs/architecture/adr/0086-pos-parked-sale-stock-and-high-risk-approval-lifecycle.md
declaration_id: 2026-09-25-pos-dine-in-parked-sale-payment-policy
classification: major
surfaces: pos,terminal,payments,inventory,settings,store
reason_codes_impacted: ALLOWED
policy_version: 2026.09.25
verification_evidence: focused API/POS/storefront tests,affected app builds,architecture checks,local browser verification,git diff --check
rollback_note: Revert the related application commits and declaration; review tenant data before rolling back the additive dine-in and parked-sale migrations.
preflight_result: no_breach
preflight_reason_code: PENDING
preflight_run_at: 2026-09-25T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-2026-09-25-POS-DINE-IN-PARKED-SALE
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

## Compliance Preconditions

- Existing tenant, branch, role, permission, active-shift, and paired-terminal
  gates remain authoritative.
- Inventory writes continue through the existing inventory command and movement
  services; parked sales do not bypass stock or approval controls.
- Payment timing and settlement validation remain server-authoritative, with
  client-side action availability treated only as a guard against invalid UI
  submissions.
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
