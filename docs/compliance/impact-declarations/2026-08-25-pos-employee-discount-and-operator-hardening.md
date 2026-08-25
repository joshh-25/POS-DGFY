---
status: reference
owner: engineering
last_reviewed: 2026-08-26
related_adr: 0033-commercial-promo-and-statutory-pos-discount-boundaries.md
declaration_id: 2026-08-25-pos-employee-discount-and-operator-hardening
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,EMPLOYEE_DIRECTORY_ID_REQUIRED,EMPLOYEE_DIRECTORY_NOT_FOUND,DISCOUNT_SELF_APPROVAL_BLOCKED,DISCOUNT_SELF_APPROVAL_ACTOR_MISMATCH,DISCOUNT_SELF_APPROVAL_IDENTITY_UNVERIFIED,DISCOUNT_APPROVAL_IDENTITY_CHANGED,DISCOUNT_APPROVAL_OPERATOR_MISMATCH
policy_version: 2026.08.25
verification_evidence: focused POS discount tests,split-payment approval tests,Employee Credit tests,shared POS frontend tests,POS and SKUpervisor production builds,architecture guardrails,compliance guardrails
rollback_note: Revert the Employee Directory enforcement, employee self-approval setting, split-payment item approval proofs, Employee Credit exact prefill lookup, and cashier lifecycle improvements as one batch; no migration or persisted-data transformation is required.
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
- Employee self-approval remains tenant-controlled and is accepted only when the selected directory employee matches the approver and that approver is the applying cashier. Senior, PWD, Promo, and Other item discounts remain fail-closed against cashier self-approval.
- Split-payment sessions retain server-owned item-discount approval proofs after PIN values are scrubbed, allowing final checkout to revalidate approval without persisting or replaying a raw PIN.
- Employee Credit prefill can query the exact selected directory employee instead of relying on the first page of results.
- Cashier sign-in and terminal lock context use the active takeover operator before falling back to the immutable shift owner.
- The HttpOnly operator-authority contract remains scoped to its tenant, location, terminal, shift, attendance, and active operator session. It does not bind the scoped operator identity to the DGFY browser-session identity.

## Compliance Preconditions

- Approval PIN values remain write-only, are scrubbed before payment-session persistence, and are never returned as approval proof data.
- Every trusted approval is matched again to its discount type, employee identity, approver, and applying cashier before final checkout.
- Saved approvers must remain active and authorized when a split-payment session is completed.
- Employee Directory records remain tenant-scoped through the existing repository and request tenant context.
- Existing tax, receipt, payment allocation, void, audit, and shift ownership contracts remain backend-authoritative.

## Verification Evidence

- Focused backend policy, validator, split-payment, Employee Credit, and POS checkout contract tests are required to pass.
- Shared POS frontend behavior and source-contract tests are required to pass.
- POS and SKUpervisor production builds are required because both consume the shared POS package.
- Architecture, controller-boundary, documentation, compatibility, tenant-schema, compliance, lint, and diff-safety gates are required before handoff.

## Update 2026-08-26: Cashier Authority Recovery and Version-Skew Compatibility (#1045)

- The existing operator-authority classification governs issue #1045 and production hotfix PR #1046. No compliance surface, statutory calculation, payment allocation, receipt, tax, or inventory rule is added or relaxed.
- When the opening cashier still has active attendance but the operator-session row is missing, the backend may reconstruct authority only for that exact shift owner. A different authenticated cashier remains fail-closed and must use the explicit takeover flow.
- Manual cashier resume and takeover send the lifecycle mutation with the separately verified cashier company session without installing that session as the active DGFY browser identity.
- A frontend may preserve the pre-operator legacy shift-owner flow only when the API explicitly reports `POS_OPERATOR_FEATURE_DISABLED` or the exact `/pos/terminal/operator/current` route is absent. Authentication, authorization, permission, operator-domain, and unrelated route failures remain fail-closed.
- Focused verification passed: 25 backend lifecycle/operator tests, 32 shared POS decision/contract tests, API syntax, and POS/SKUpervisor/Storefront production builds.
- Rollback is a code revert of the recovery and compatibility branch. No migration or persisted-data transformation is introduced.
