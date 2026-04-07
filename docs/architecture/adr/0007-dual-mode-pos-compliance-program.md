# ADR 0007: Dual-Mode POS Compliance Program

## Status
Accepted (2026-04-06)
Updated: 2026-04-07
Update note (2026-04-07): regulatory source chain refreshed to include BIR RR 7-2024, RR 11-2025, RR 26-2025, and BSP PSOF/MORPS context without changing lifecycle architecture decisions.

## Context
The product must support both:
1. Businesses requiring fiscal/compliance behavior and accredited peripherals.
2. Businesses requiring operational POS only (non-fiscal mode).

Prior behavior mixed optional strict-toggle checks with incomplete lifecycle controls, creating bypass risk and inconsistent runtime behavior.

## Decision
Adopt a permanent dual-mode compliance architecture with these rules:

1. Tenant mode is explicit at registration (`non_compliant` or `compliant`).
2. Tenant state machine is:
   - `non_compliant_active`
   - `compliant_pending`
   - `compliant_active`
3. Compliant downgrade is forbidden at API/use-case, repository, and DB trigger layers.
4. Existing tenants require one-time mode selection (`compliance_mode_choice_required=true`) before POS/terminal/payment capability operations proceed.
5. POS output contract is mode-based:
   - non-compliant and compliant-pending -> `non_fiscal_slip`
   - compliant-active -> `fiscal_invoice`
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
2. `compliant` path is irreversible.
3. Non-compliant tenants may upgrade to compliant later, irreversibly.
4. Legacy tenants must complete one-time mode choice before gated operations continue.
5. Non-compliant output is explicitly non-fiscal.
6. Compliant mode requires accredited/verified peripherals for required classes.
7. Upgrade is checklist-gated (`compliant_pending` -> `compliant_active`).
8. Feature implementation must be preflighted and blocked on policy breach.

## Acceptance Criteria
1. No tenant reaches `compliant_active` using unverified self-attested artifact/peripheral status only.
2. Non-compliant tenants cannot emit fiscal output contracts.
3. Compliant-active terminal operations fail when terminal-required classes are missing (unless shared fallback satisfies).
4. Legacy mode choice is enforced exactly once and is irreversible.
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
3. Operational rollback constraint: no rollback may violate irreversible compliant-state DB constraints.
