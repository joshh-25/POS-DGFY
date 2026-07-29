---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-04-21
last_reviewed: 2026-04-21
review_by: 2026-10-21
applies_to: architecture_decision
topic: compliance_downgrade_escape_hatches
---

# ADR 0011: Compliance Downgrade Escape Hatches

## Status
Accepted (2026-04-21)
Updated (2026-04-22): DB trigger hardening and fail-closed audit persistence requirements added.

## Context
ADR 0007 established an irreversible compliant-path lifecycle. Operational incidents now require a controlled escape hatch for regulated rollback without bypassing auditability and policy controls.

## Decision
Introduce two governed downgrade paths from compliant states:

1. Platform-admin force downgrade
   - Endpoint: `POST /api/v1/admin/tenants/:id/force-non-compliant`
   - Allowed from `compliant_pending` or `compliant_active`.
   - Denied when already `non_compliant_active`.
   - Requires reason and immutable compliance audit event.
2. Tenant master-admin one-time revert per compliance cycle
   - Endpoint: `POST /api/v1/compliance/mode/revert-to-non-compliant`
   - Allowed from `compliant_pending` or `compliant_active`.
   - Enforced once per cycle via `compliance_cycle_version` and `compliance_revert_last_cycle_version`.
   - Requires reason and immutable compliance audit event.

Persistence + guardrails:

1. Add tenant override/revert tracking columns.
2. Add cycle-version columns for one-per-cycle enforcement.
3. Replace strict no-downgrade DB trigger with controlled-exception trigger that only permits downgrade when governed markers are present.
4. Extend compliance audit event taxonomy with:
   - `mode_force_non_compliant`
   - `mode_revert_non_compliant`
5. Harden controlled-exception trigger semantics (`20260422000002-harden-compliance-downgrade-controls.cjs`):
   - downgrade requires same-update governed marker mutation;
   - mixed override+revert marker mutation in one downgrade update is rejected;
   - tenant revert path must persist current `compliance_cycle_version` to `compliance_revert_last_cycle_version`.
6. Enforce fail-closed audit durability for downgrade operations:
   - force/revert operations commit only when primary compliance audit persistence succeeds;
   - fallback-only audit persistence is treated as a transactional failure.

## Consequences
1. Compliant downgrade is no longer globally forbidden, but still blocked unless it follows governed platform/tenant escape paths.
2. Runtime and DB constraints remain fail-closed for unauthorized downgrade attempts.
3. Tenant self-revert abuse is constrained by per-cycle state and DB-level one-per-cycle checks.
4. Downgrade path integrity now depends on both API authorization and strict trigger/audit invariants.
