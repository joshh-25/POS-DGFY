---
status: reference
owner: engineering
last_reviewed: 2026-08-11
declaration_id: 2026-08-11-dgfy-pos-handoff-day-close-pin
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: DGFY tenant-session contracts,Day Close PIN policy and self-service contracts,browser-session and company-handoff tests,authenticated shift-resume Playwright specification
rollback_note: Revert the identity and handoff commit; invalidate outstanding one-time handoff artifacts without deleting cashier-owned PIN audit records.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-11T00:00:00+08:00
preflight_request_ref: DGFY-POS-HANDOFF-DAY-CLOSE-PIN-20260811
---

# DGFY POS Handoff And Cashier-Owned Day Close PIN

## Compliance Impact Classification

Major. The change binds DGFY company selection, one-time POS handoff, cashier
credential authority, and personal Day Close PIN setup to the authenticated
global user and selected tenant. It does not let an administrator choose or
reuse a cashier's private PIN.

## Affected Surfaces

1. DGFY company selection and POS launch routing.
2. Global-account authentication and tenant-session resolution.
3. Cashier Day Close authorization, self-service PIN setup, and reset status.
4. Browser-session isolation when switching businesses or reopening POS.

## Compliance Preconditions

1. Handoff artifacts are short-lived, single-use, and tenant-bound.
2. Account-password verification uses the authenticated DGFY identity rather
   than a mismatched tenant-local password hash.
3. PIN material is write-only, hashed at rest, and never returned by an API.
4. Cashiers create their own PIN only after authorization is granted; managers
   may grant or revoke capability but cannot learn or set the cashier PIN.
5. Company switching clears stale tenant and terminal state before bootstrap.

## Verification Evidence

1. Backend contracts cover DGFY session transport, tenant-session resolution,
   PIN validation, policy authorization, and self-service setup.
2. Frontend contracts cover company selection, POS launch modal behavior,
   browser-session bootstrap, and Day Close access state.
3. The authenticated DGFY-to-POS shift-resume Playwright specification is
   included and will be run after the `develop` merge with local E2E credentials.
4. Architecture, compliance, production builds, and negative authorization
   paths remain required before the draft PR is opened.
