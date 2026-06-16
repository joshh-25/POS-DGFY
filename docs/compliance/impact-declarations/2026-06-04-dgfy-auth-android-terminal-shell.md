---
status: reference
owner: engineering
last_reviewed: 2026-06-04
declaration_id: 2026-06-04-dgfy-auth-android-terminal-shell
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,AUTHENTICATION_FAILED,VALIDATION_FAILED
policy_version: 2026.06.04
verification_evidence: npm run check:compliance -- --staged,npm --prefix backend run check:architecture-guardrails,npm --prefix backend run check:controller-boundaries
rollback_note: Revert the DGFY auth onboarding additions, Android wrapper files, and terminal shell eager-import change if terminal launch or auth handoff regressions appear.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-04T17:40:00+08:00
preflight_request_ref: POS-DGFY-2026-06-04
---

# DGFY Auth, Android Wrapper, And Terminal Shell Compliance Impact

## Compliance Impact Classification

Major.

The staged change set affects terminal-facing POS behavior by adding the Android wrapper runtime, introducing DGFY account and storefront support code that participates in terminal handoff flows, and replacing lazy terminal shell imports with eager imports to prevent blank-screen failures in the desktop POS shell. It does not change payment authorization, tax computation, or compliance policy enforcement logic.

## Affected Surfaces

- POS terminal shell bootstrap and route handoff behavior in the DGFY terminal client.
- Terminal startup reliability for desktop POS shells that previously depended on lazy-loaded terminal layout components.
- Android terminal wrapper packaging for iMin-targeted POS deployment.
- DGFY account and storefront backend support code that feeds terminal-adjacent authentication and handoff flows.

## Compliance Preconditions

1. Terminal launch must continue to fail closed when required backend or handoff configuration is unavailable.
2. The Android wrapper must remain a client shell only and must not bypass backend authentication or authorization controls.
3. The eager-import terminal shell change must not alter checkout, cash drawer, receipt, or shift semantics beyond fixing terminal boot reliability.
4. Rollback must be possible by reverting the staged reconcile commit without requiring schema rollback of unrelated POS data.

## Verification Evidence

- `npm run check:compliance -- --staged`
- `npm --prefix backend run check:architecture-guardrails`
- `npm --prefix backend run check:controller-boundaries`
- Pre-commit architecture and controller guardrails passed before the compliance declaration gate blocked the first commit attempt.
