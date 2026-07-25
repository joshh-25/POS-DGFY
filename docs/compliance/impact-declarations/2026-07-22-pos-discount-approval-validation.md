---
status: reference
owner: engineering
last_reviewed: 2026-07-22
related_adr: 0033-commercial-promo-and-statutory-pos-discount-boundaries.md
declaration_id: 2026-07-22-pos-discount-approval-validation
classification: major
surfaces: pos,terminal
reason_codes_impacted: DISCOUNT_APPROVAL_REQUIRED,MANUAL_DISCOUNT_REASON_REQUIRED
policy_version: 2026.07.22
verification_evidence: pos-discount-type-card-contract,architecture-guardrails,controller-boundaries,diff-check
rollback_note: Revert the POS client validation and related contract assertions together. This change creates no migration and does not rewrite transaction, payment, receipt, discount, or inventory records.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-22T21:17:00+08:00
preflight_request_ref: POS-DISCOUNT-2026-07-22
---

# POS Discount Approval Validation

## Compliance Impact Classification

Major. This change tightens the existing POS discount-approval user flow: a governed discount must select a configured approver, and manual discounts require a staff-entered reason of at least three characters. It does not change discount rates, tax calculation, payment collection, receipt generation, backend authorization, or persisted transaction contracts.

## Affected Surfaces

- POS checkout discount modal validation and guidance.
- Existing configured manager/admin approval selection for governed discounts.
- Existing POS discount type-card contract test.

## Compliance Preconditions

- The backend remains authoritative for discount eligibility, approval-PIN verification, tax treatment, transaction persistence, and audit records.
- Only users already configured with a POS approval PIN can be selected as governed-discount approvers.
- Senior/PWD validation, discount calculation, payment processing, receipts, inventory movements, and Storefront behavior remain unchanged.

## Verification Evidence

- POS discount type-card contract test passed.
- Backend architecture guardrails and controller-boundary checks passed.
- The affected-file whitespace and `DO NOT COMMIT` marker checks passed.
