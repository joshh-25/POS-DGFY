---
status: reference
owner: engineering
last_reviewed: 2026-10-07
declaration_id: 2026-10-07-pos-double-tap-zoom
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.07
verification_evidence: pos_mobile_focus_zoom_contract,pos_lint,pos_build,git_diff_check
rollback_note: Revert the POS-scoped touch-action rule and its contract test; no backend, database, API, or authorization behavior is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-07T00:00:00+08:00
preflight_request_ref: POS-DOUBLE-TAP-ZOOM-2026-10-07
---

# POS Double-Tap Zoom Frontend Compliance Impact

## Compliance Impact Classification

Major by the repository's path-based POS/terminal classification floor. This is a frontend-only
interaction fix that prevents browser double-tap zoom on the POS surface while preserving normal
panning and pinch zoom. It does not change API calls, database state, compliance decisions,
authorization, or the IMS/Storefront surfaces.

## Affected Surfaces

1. `packages/web-core/src/index.css` — POS-scoped `touch-action: manipulation` rule.
2. `packages/web-core/src/features/pos/__tests__/posMobileFocusZoom.contract.test.js` — contract
   coverage for the POS marker, the touch-action rule, and the absence of viewport zoom disabling.

## Compliance Preconditions

1. The rule must be scoped to `body[data-pos-surface="pos"]` and must not disable pinch zoom.
2. The implementation must not add `user-scalable=no` or `maximum-scale=1` viewport restrictions.
3. No non-frontend behavior or shared backend contract is introduced.

## Verification Evidence

The POS mobile focus/zoom contract, POS lint, POS production build, and `git diff --check` passed.
The staged diff was audited to contain only the POS double-tap rule and its frontend contract test.
