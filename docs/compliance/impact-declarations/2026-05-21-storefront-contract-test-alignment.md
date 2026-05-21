---
status: reference
owner: engineering
last_reviewed: 2026-05-21
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-05-21-storefront-contract-test-alignment
classification: major
surfaces: pos,terminal,storefront,testing
reason_codes_impacted: ALLOWED
policy_version: 2026.05.21
verification_evidence: npm --prefix frontend run lint -- --quiet,npm --prefix frontend exec vitest run src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js src/features/__tests__/numericStepperPolicy.contract.test.js apps/store/src/__tests__/discoveryPresentation.test.js,git diff --check
rollback_note: Revert the frontend contract-test expectation updates and this declaration together, then rerun frontend lint and targeted contract tests.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-21T13:35:00+08:00
preflight_request_ref: STOREFRONT-PILOT-ADOPTION-2026-05-21
---

# 2026-05-21 Storefront Contract Test Alignment

## Compliance Impact Classification
Major

The runtime POS compliance path is unchanged. This declaration covers test-only expectation updates in a compliance-sensitive POS contract test file after the Storefront pilot adoption and formatting cleanup exposed stale source-snippet assertions.

## Affected Surfaces
- POS terminal responsive-scroll contract test expectations.
- POS numeric-stepper source-contract expectations.
- Storefront discovery presentation helper expectations.

## Compliance Preconditions
1. POS quantity increment/decrement remains step-by-1.
2. POS terminal checkout panes remain keyboard-scrollable with truthful scroll labels.
3. Storefront discovery `all_matching_branches` helper behavior remains aligned with the current helper contract.
4. No payment provider, fiscal document, compliance lifecycle, or checkout pricing runtime logic changes are included.

## Verification Evidence
- `npm --prefix frontend run lint -- --quiet`
- `npm --prefix frontend exec vitest run src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js src/features/__tests__/numericStepperPolicy.contract.test.js apps/store/src/__tests__/discoveryPresentation.test.js`
- `git diff --check`
