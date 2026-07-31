---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-04-06
last_reviewed: 2026-04-06
review_by: 2026-10-06
applies_to: architecture_decision
topic: dual_mode_pos_compliance_program
---

# ADR 0007: Dual-Mode POS Compliance Program

## Status
Accepted (2026-04-06)
Updated: 2026-04-07
Update note (2026-04-07): regulatory source chain refreshed to include BIR RR 7-2024, RR 11-2025, RR 26-2025, and BSP PSOF/MORPS context without changing lifecycle architecture decisions.
Update note (2026-04-07): compliance declaration guardrail semantics tightened with path/surface-computed minimum classification floors and strict major/regulatory preflight evidence validation, without changing route/API contracts.
Update note (2026-04-21): superseded in part by ADR 0011 for governed compliant-to-non-compliant downgrade exceptions (platform force and tenant one-per-cycle revert).
Update note (2026-06-02): POS receipt print surfaces must classify fiscal/non-fiscal status only from explicit server-provided `document_type` and `document_context`; invoice number prefixes are sequence identifiers only and are not fiscal-status signals.
Update note (2026-06-28): POS terminal and checkout operation no longer fails closed only because compliance mode choice/readiness is unavailable or incomplete. POS may continue as non-compliant/non-fiscal operation; fiscal/compliant-only output and payment capability enablement remain policy-gated.

## Context
The product must support both:
1. Businesses requiring fiscal/compliance behavior and accredited peripherals.
2. Businesses requiring operational POS only (non-fiscal mode).

Prior behavior mixed optional strict-toggle checks with incomplete lifecycle controls, creating bypass risk and inconsistent runtime behavior.

## Decision
Adopt a permanent dual-mode compliance architecture with these rules:

Update note (2026-05-21): ADR 0022 amends public company registration. New public registrations no longer choose compliance mode during registration; they always start `non_compliant_active`. Compliance activation remains available after login through Settings > Compliance.

1. Tenant mode is explicit at registration (`non_compliant` or `compliant`).
2. Tenant state machine is:
   - `non_compliant_active`
   - `compliant_pending`
   - `compliant_active`
3. Generic compliant downgrade is forbidden; only governed downgrade exceptions defined in ADR 0011 are allowed at API/use-case/repository/DB-trigger layers.
4. Existing tenants may use POS/terminal operation without one-time mode selection; unresolved mode choice defaults POS to non-compliant/non-fiscal operation. Payment capability enablement remains blocked until mode choice is resolved.
5. POS output contract is mode-based:
   - non-compliant and compliant-pending -> `non_fiscal_slip`
   - compliant-active -> `fiscal_invoice`
   - frontend print surfaces must consume explicit server contract fields (`receipt_contract.document_type`/`document_context` or persisted transaction `document_type`/`document_context`) and must not infer fiscal status from invoice number prefixes
6. Compliant activation is checklist-gated (profile, artifacts, peripherals, readiness tests, required settings).
7. Compliant mode is fail-closed on policy denials/required setup.
8. Artifact/peripheral trust is verification-based (`pending_review|verified|rejected|revoked`), not submitter self-attestation.
9. Verification authority is either:
   - tenant master admin, or
   - platform admin.
10. Peripheral enforcement is terminal-aware with explicit shared-device fallback (`is_shared=true`).
11. Legacy strict toggle (`pos_strict_compliance_enabled`) is retired from active policy gating.
12. Compliance-sensitive changes require declaration evidence and compliance checks in pre-commit + CI.
13. Request-time compliance preflight is mandatory for new compliance-sensitive feature work.

## Locked Product Decisions (Thread Consolidated)
1. Tenant selects mode at registration.
2. `compliant` path remains irreversible by default.
3. Non-compliant tenants may upgrade to compliant later; downgrade is only possible via governed exceptions in ADR 0011.
4. Legacy tenants may continue POS operation as non-compliant/non-fiscal until one-time mode choice is completed; payment capability enablement remains gated.
5. Non-compliant output is explicitly non-fiscal.
6. Compliant mode requires accredited/verified peripherals for required classes.
7. Upgrade is checklist-gated (`compliant_pending` -> `compliant_active`).
8. Feature implementation must be preflighted and blocked on policy breach.

## Acceptance Criteria
1. No tenant reaches `compliant_active` using unverified self-attested artifact/peripheral status only.
2. Non-compliant tenants cannot emit fiscal output contracts.
3. Compliant-active terminal operations fail when terminal-required classes are missing (unless shared fallback satisfies).
4. Legacy mode choice is enforced for compliance/payment capability enablement, not for non-fiscal POS operation; later downgrade remains governed by ADR 0011 exceptions.
5. Runtime policy denials include reason codes and deterministic decision output.
6. Compliance-sensitive diffs fail CI/pre-commit without valid declaration metadata.
7. `check:architecture`, `check:compliance`, and docs lint stay mandatory gates.

## Consequences
1. Regulatory behavior is centralized in a policy engine with versioned policy packs and reason-coded decisions.
2. Tenant onboarding/runtime now follows explicit compliance lifecycle states.
3. Engineering workflow blocks non-declared compliance-sensitive changes.
4. Additional implementation overhead is introduced for POS/payments/settings/compliance feature delivery.

## Rollback Notes
1. Runtime rollback: revert compliance-sensitive module/UI changes as a bounded set.
2. Schema rollback: run migration undo in reverse order for compliance migrations if release policy allows.
3. Operational rollback constraint: no rollback may violate governed compliant-state DB constraints (ADR 0011).
