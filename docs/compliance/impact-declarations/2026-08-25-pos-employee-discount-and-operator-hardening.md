---
status: reference
owner: engineering
last_reviewed: 2026-08-25
related_adr: 0033-commercial-promo-and-statutory-pos-discount-boundaries.md
declaration_id: 2026-08-25-pos-employee-discount-and-operator-hardening
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,EMPLOYEE_DIRECTORY_ID_REQUIRED,EMPLOYEE_DIRECTORY_NOT_FOUND,DISCOUNT_SELF_APPROVAL_BLOCKED,DISCOUNT_SELF_APPROVAL_ACTOR_MISMATCH,DISCOUNT_SELF_APPROVAL_IDENTITY_UNVERIFIED,DISCOUNT_APPROVAL_IDENTITY_CHANGED,DISCOUNT_APPROVAL_OPERATOR_MISMATCH
policy_version: 2026.08.25
verification_evidence: focused POS discount tests,split-payment approval tests,Employee Credit tests,shared POS frontend tests,POS and SKUpervisor production builds,architecture guardrails,compliance guardrails
rollback_note: Revert the Employee Directory enforcement, authenticated-operator self-approval binding, split-payment item approval proofs, Employee Credit exact prefill lookup, active-operator sign-in routing, and same-operator authority-session recovery as one batch; no migration or persisted-data transformation is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-25T18:15:00+08:00
preflight_request_ref: POS-EMPLOYEE-DISCOUNT-ISSUE-1020
---

# POS Employee Discount and Operator Hardening

## Compliance Impact Classification

Major because this change affects POS discount authorization, cashier/operator identity, payment-session completion, and employee-credit checkout selection. It does not change statutory rates, tax calculations, fiscal receipt rules, tender settlement, or inventory posting rules.

## Affected Surfaces

- Employee discounts must resolve to an active Employee Directory record; POS-user IDs and free-text employee names are no longer accepted as beneficiary authority.
- Employee self-approval remains tenant-controlled and is accepted only when the selected directory employee matches the approver and the approver is the authenticated active register operator.
- Split-payment sessions retain server-owned item-discount approval proofs after PIN values are scrubbed, allowing final checkout to revalidate approval without persisting or replaying a raw PIN.
- Employee Credit prefill can query the exact selected directory employee instead of relying on the first page of results.
- Cashier sign-in and terminal lock context use the active takeover operator before falling back to the immutable shift owner.
- An authenticated cashier whose browser authority cookie is missing or stale receives one backend-verified authority refresh only when that cashier still controls the active register; a different active cashier is never replaced automatically.

## Compliance Preconditions

- Approval PIN values remain write-only, are scrubbed before payment-session persistence, and are never returned as approval proof data.
- Every trusted approval is matched again to its discount type, employee identity, approver, and active operator before final checkout.
- Saved approvers must remain active and authorized when a split-payment session is completed.
- Employee Directory records remain tenant-scoped through the existing repository and request tenant context.
- Existing tax, receipt, payment allocation, void, audit, and shift ownership contracts remain backend-authoritative.

## Verification Evidence

- Focused backend policy, validator, split-payment, Employee Credit, and POS checkout contract tests are required to pass.
- Shared POS frontend behavior and source-contract tests are required to pass.
- POS and SKUpervisor production builds are required because both consume the shared POS package.
- Architecture, controller-boundary, documentation, compatibility, tenant-schema, compliance, lint, and diff-safety gates are required before handoff.
