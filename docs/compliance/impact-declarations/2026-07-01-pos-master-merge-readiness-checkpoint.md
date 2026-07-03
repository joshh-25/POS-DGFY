---
status: reference
owner: engineering
last_reviewed: 2026-07-01
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-01-pos-master-merge-readiness-checkpoint
classification: regulatory
surfaces: pos,terminal,settings,storefront,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,POS_SHIFT_REQUIRED,POS_PAYMENT_REQUIRED,NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED,COMPLIANT_ACTIVATION_PENDING
policy_version: 2026.07.01
verification_evidence: npm -C backend run check:architecture-guardrails,npm -C backend run check:controller-boundaries,npm run check:compliance
rollback_note: Revert the POS terminal, checkout, storefront routing, receipt, DGFY auth handoff, and hardware bridge changes in one checkpoint before attempting the master merge again.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-01T22:00:00+08:00
preflight_request_ref: POS-MASTER-MERGE-READINESS-2026-07-01
---

# POS Master Merge Readiness Checkpoint

## Compliance Impact Classification
Regulatory

This checkpoint bundles compliance-sensitive POS, terminal, storefront, and DGFY session changes into a recoverable pre-merge commit before adopting `bblabs/master`. The branch touches sale handling, terminal setup and locking, receipt output, POS-to-storefront settings behavior, and DGFY account/session routing.

## Affected Surfaces
1. POS backend controllers, repositories, routes, validators, and use cases that govern terminal setup, checkout flow, and pairing behavior.
2. POS frontend terminal pages, setup modals, terminal lock behavior, receipt rendering, analytics workspace, and shared runtime helpers.
3. Storefront routing and shared DGFY auth/session entrypoints that affect how POS/storefront account state is resolved.
4. Native hardware bridge contract updates used by the standalone hardware POS runtime.

## Compliance Preconditions
1. POS sale acceptance must continue to rely on backend validation for tenant, terminal, payment, shift, and policy enforcement.
2. Terminal setup and lock flows must not bypass tenant resolution or pairing constraints.
3. Receipt behavior must preserve existing compliance-mode and fiscal gating even when tenant branding or terminal UX changes.
4. Storefront and DGFY session handoff updates must not weaken authenticated session boundaries.
5. Rollback must treat the backend, frontend, native bridge, tests, and declaration as one unit because these changes are cross-surface.

## Verification Evidence
1. `npm -C backend run check:architecture-guardrails`
   - Result: PASS during pre-commit.
2. `npm -C backend run check:controller-boundaries`
   - Result: PASS during pre-commit.
3. `npm run check:compliance`
   - Result: required declaration added for staged compliance-sensitive files.
