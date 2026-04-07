---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-04-07
applies_to: release_management_and_compliance_ops
topic: compliance_regulatory_verification_cadence
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Compliance Ops Regulatory Verification

## Objective
Define accountable operating cadence for regulator-source verification and release-cut compliance checks.

## Ownership
1. Compliance owner maintains regulator-source inventory and review log.
2. Feature owner links declarations and preflight evidence to every compliance-sensitive PR.
3. Reviewer blocks merge when declaration quality or preflight evidence is incomplete.

## Required Cadence
1. Monthly regulator-source review:
   - Re-validate BIR/NPC/BSP source links and issuance deltas.
   - Record date, reviewer, and delta summary in compliance working notes.
2. Release-cut regulator review:
   - Re-run source verification before release branch cut.
   - Confirm policy pack version and reason-code mapping are current.

## Release-Cut Checklist
1. `npm run lint:docs`
2. `npm run check:architecture`
3. `npm run check:compliance`
4. Compliance-focused backend/frontend tests pass.
5. Latest impact declaration includes:
   - declaration ID
   - computed classification rationale
   - preflight evidence reference
   - policy version
   - rollback note

## Local Readiness Index-Audit Hygiene
1. Run local index audit in safe mode first (cleanup dry-run + audit):
   - `npm -C backend run audit:indexes:local`
2. Use explicit destructive cleanup only when stale local test tenants must be removed:
   - `npm -C backend run audit:indexes:local:apply-cleanup`
3. Production/CI index audit must remain broad (no silent exclusions):
   - `npm -C backend run audit:indexes`

## Escalation Rule
If source deltas imply new runtime-blocking controls, pause release and open ADR update path before implementation.
