---
status: reference
owner: engineering
last_reviewed: 2026-07-13
related_adr: 0033-commercial-promo-and-statutory-pos-discount-boundaries.md
declaration_id: 2026-07-13-pos-discount-approval-refinement
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,STATUTORY_ITEM_NOT_ELIGIBLE,STATUTORY_ITEM_SELECTION_REQUIRED
policy_version: 2026.07.13
verification_evidence: focused POS discount tests,POS production build,architecture guardrails,compliance guardrails
rollback_note: Revert the POS discount eligibility normalization, approval-PIN management UI, and compact discount modal changes as one batch; no migration or persisted data transformation is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-13T12:00:00+08:00
preflight_request_ref: POS-DISCOUNT-APPROVAL-2026-07-13
---

# POS Discount Approval Refinement

## Compliance Impact Classification

Major because statutory discount eligibility and discount approval controls are handled on the POS terminal surface. The change preserves existing pricing, receipt, tax, payment, and audit contracts.

## Affected Surfaces

- POS statutory Senior/PWD eligibility now accepts the persisted MySQL boolean representation (`1`) alongside boolean `true`.
- POS discount approval UI retains the existing server-side approval-PIN endpoint and makes PIN configuration available to master admins in POS Settings.
- POS discount modal layout is compacted without changing the request contract or governed-discount calculation rules.
- Optional `governed_discount.approver_user_id` is normalized to a positive integer or `null`; statutory and promo discounts no longer submit an empty string that fails checkout validation.

## Compliance Preconditions

- Statutory discounts remain limited to explicitly selected eligible items.
- Approval PIN values remain write-only and are not returned to or persisted in browser-readable state.
- Existing authorization, tax, receipt, payment, inventory, and audit behavior remains backend-authoritative.
- Employee and Manual approval still requires a server-verified Admin or Manager PIN; only no-approval discount types send a `null` approver ID.

## Verification Evidence

- Focused POS discount approval contract tests passed.
- POS frontend production build passed.
- Backend architecture and controller-boundary guardrails passed.
- Compliance and API-contract guardrails are required by the pre-commit hook.
