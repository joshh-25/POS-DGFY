---
status: reference
owner: engineering
last_reviewed: 2026-09-05
declaration_id: 2026-09-05-pos-discount-quantity-stale-test-backport
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: packages/web-core/src/features/pos/__tests__/discountQuantityEmployeeDropdown.contract.test.js -- actually executed (Vitest, run from apps/dgfy-ims per docs/architecture/frontend-split-sync.md), passing after the assertion update
rollback_note: Revert this file's one-line change. This is a test-only assertion fix (the test's literal-substring check now matches the variable name POSDiscountWorkspace.jsx already uses); no production file is touched by this change, so a revert has zero runtime effect beyond re-breaking the stale assertion.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-06T06:19:25.426Z
preflight_request_ref: PREFLIGHT-34016076574-2026-09-05-POS-DISCOUNT-QUANTITY-STALE-TEST-BACKPORT
---

# Backport #1603's stale discount-quantity contract test fix to `develop`

## Compliance Impact Classification

Major. The classification floor comes from `packages/web-core/src/features/pos/**` (`pos`,
`terminal`, `major`) per `docs/compliance/compliance-classification-matrix.md`, matched by the one
file this PR touches:
`packages/web-core/src/features/pos/__tests__/discountQuantityEmployeeDropdown.contract.test.js`.

**This is a test-only change with zero production behavior impact.** `POSDiscountWorkspace.jsx`
itself is not touched by this PR at all -- it already reads `primaryAvailableQuantity` (renamed from
`cartQuantity` by an earlier, already-shipped, already-declared commit `8aed57f27`, "fix(pos): harden
governed discount beneficiaries"). This PR only updates the test's literal-substring assertion to
match that already-live variable name, fixing the stale-test failure `promotion-quality-gate.yml`
surfaced on the first `staging -> main` release leg under ADR 0081 (candidate `2026-09-05-01`, PR
#1601; root-caused in #1603). No discount calculation, permission check, or UI behavior changes.

## Affected Surfaces

- `packages/web-core/src/features/pos/__tests__/discountQuantityEmployeeDropdown.contract.test.js`:
  one assertion string updated from
  `Math.min(Math.max(1, Math.floor(requestedSelectedQuantity)), cartQuantity)` to
  `Math.min(Math.max(1, Math.floor(requestedSelectedQuantity)), primaryAvailableQuantity)` -- matching
  `POSDiscountWorkspace.jsx`'s current, unchanged source. No other file under `features/pos/` is
  touched.

## Compliance Preconditions

1. No production code path is modified by this change -- confirmed by diff: the only file changed is
   the test itself.
2. The discount-quantity clamping logic being asserted against (`Math.min(Math.max(1,
   Math.floor(requestedSelectedQuantity)), primaryAvailableQuantity)`) is pre-existing, already-shipped
   behavior from `8aed57f27` -- this PR does not introduce, alter, or relax that clamp.
3. No new permission, endpoint, or data-write surface is introduced or touched.

## Verification Evidence

`packages/web-core/src/features/pos/__tests__/discountQuantityEmployeeDropdown.contract.test.js`
passes after the assertion update (Vitest, run from `apps/dgfy-ims` per
`docs/architecture/frontend-split-sync.md` -- `packages/web-core` tests do not run from
`apps/dgfy-pos` despite that app owning the build).

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-1611-POS-DISCOUNT-QUANTITY-STALE-TEST`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
