---
status: reference
owner: engineering
last_reviewed: 2026-08-07
declaration_id: 2026-08-07-pos-release-blocker-hardening
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.05
verification_evidence: npm run check:compliance
rollback_note: Revert the Phase 1 report-query validation, lazy-loading, and smoke-harness changes together with this declaration.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-07T00:00:00+08:00
preflight_request_ref: POS-RELEASE-BLOCKER-HARDENING-20260807
---

# POS Release-Blocker Hardening

## Compliance Impact Classification

Major, because the changed POS and terminal surfaces are compliance-sensitive.
This change hardens input validation, reduces initial route payloads through
lazy loading, makes local smoke diagnostics deterministic, and corrects local
compliance-diff selection. It does not change fiscal document state, discount
rules, payment authorization, inventory movement, shift ownership, receipt
payloads, or offline replay semantics.

## Affected Surfaces

1. POS reports now reject a non-object query with the existing validation error
   contract and HTTP status `400` before reading query fields or resolving
   location scope.
2. Secondary terminal modals and checkout-only workflow panels load on demand;
   their existing props, behavior, and render contracts remain unchanged.
3. Browser smoke checks use the terminal email field's stable DOM id and allow
   only the known unauthenticated `401` response from the device-status probe.
   Local API smoke reports an invalid tenant token before attempting login.
4. The compliance impact script no longer derives a clean local worktree's
   changed files from an aggregate merge commit. CI diff evaluation remains
   unchanged.

## Compliance Preconditions

1. Backend validation remains fail-closed and returns the existing
   `VALIDATION_FAILED` application error contract.
2. Lazy loading does not alter server-owned fiscal, payment, discount,
   inventory, shift, receipt, or offline-replay decisions.
3. Smoke allowlisting is limited to the exact device-status endpoint and
   expected locked-terminal authentication state; unrelated HTTP errors remain
   failures.
4. Compliance-sensitive changes remain declaration-gated; no declaration
   classification or surface check is disabled.

## Verification Evidence

1. Focused POS backend reports tests pass with `400` for invalid query shapes.
2. POS frontend tests and frontend budget-script tests pass.
3. Architecture, ADR, docs, compliance API-contract, and staged compliance
   checks pass.
4. POS terminal browser smoke is rerun against the repository-managed local
   stack.
