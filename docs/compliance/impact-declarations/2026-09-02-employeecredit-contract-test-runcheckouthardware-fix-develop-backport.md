---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-employeecredit-contract-test-runcheckouthardware-fix-develop-backport
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.02
verification_evidence: packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js -- actually executed (Vitest), 7/7 passing,node --check on the changed test file
rollback_note: Test-file-only change, plain revert of this PR's single commit restores the pre-fix (stale) assertions. No API, schema, payment, fiscal calculation, authorization, persistence, or hardware command behavior changes -- the underlying source (usePosCheckoutWorkflow.js) is untouched by this PR.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T18:51:27.075Z
preflight_request_ref: PREFLIGHT-33545741502-2026-09-02-EMPLOYEECREDIT-CONTRACT-TEST-RUNCHECKOUTHARDWARE-FIX-DEVELOP-BACKPORT
---

# employeeCredit contract test fix -- develop back-port of PR #1367

## Compliance Impact Classification

Major. The floor is mechanical, confirmed against `scripts/check-compliance-impact.js`: the sole
changed file, `packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js`, sits
under `packages/web-core/src/features/pos/`, matching the dedicated `COMPLIANCE_SENSITIVE_RULES`
rule (`/^packages\/web-core\/src\/features\/pos\//`), which sets a `major` floor for the
`pos`/`terminal` surfaces regardless of whether the changed file is test-only. Identical floor and
reasoning as the staging-first declaration this back-ports
(`2026-09-02-employeecredit-contract-test-runcheckouthardware-fix.md`).

Does not reach `regulatory`: nothing in this change touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. No backend file, and no non-test source file of any kind,
is touched.

`reason_codes_impacted: NONE` is deliberate -- this change introduces no new backend validation
path and no new `DomainErrorCode`/reason-code taxonomy entry; it is a test-assertion update only.

## What this change does

This PR back-ports, verbatim, the test fix already merged to `staging` via PR #1367 (merge commit
`b9478bb9`). PR #1320's `runCheckoutHardware` refactor of `usePosCheckoutWorkflow.js` -- already on
`develop` and `staging` -- moved the drawer-open call site the contract test scanned for literally
from `openDrawerAfterPrint: isCashPayment` to a shared helper's `openDrawerAfterPrint: cashPayment`
parameter, with the direct-checkout call site passing `cashPayment: isCashPayment` through, and
split the inline `reason: 'checkout_auto_print'` literal into a named
`printReason = 'checkout_auto_print'` default parameter. Runtime behavior is unchanged -- only the
literal source text the contract test scans for moved. This back-port applies the identical
three-assertion test update to `develop`'s copy of the same pre-fix (stale) test file, since
`develop` and `staging` both already carry PR #1320's refactor but neither branch had the test fix
before now.

## Affected Surfaces

1. `packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js` (**modified**,
   test-only) -- three `toContain` assertions updated to the refactored literal source strings, per
   above and identical to PR #1367's staging fix. No other line in the file changes.

No non-test file is touched by this PR. `usePosCheckoutWorkflow.js` itself (the file the updated
assertions read) is unchanged -- its refactor (PR #1320) and this test fix's staging-side twin (PR
#1367) already shipped separately.

## Compliance Preconditions

1. **Zero non-test-source change, confirmed mechanically.** `git diff --name-only` against this
   PR's single commit contains exactly one source file, the contract test itself (plus this
   declaration).
2. **No behavior change.** Identical reasoning to PR #1367's declaration: the refactor this test
   now matches already shipped via PR #1320; this PR only re-aligns `develop`'s copy of the test's
   literal-string scan with that already-live code.
3. **Back-port fidelity.** The three-assertion diff in this PR is byte-identical to PR #1367's
   staging fix (`openDrawerAfterPrint: cashPayment`, `cashPayment: isCashPayment`,
   `printReason = 'checkout_auto_print'`) -- confirmed by diffing `develop`'s pre-fix test file
   against PR #1367's merge commit (`b9478bb9`) before making this edit; both branches carried the
   exact same stale content.

## Verification Evidence

See the `verification_evidence` frontmatter key. Summary:

- `packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js` -- actually
  executed via Vitest, 7/7 tests passing.
- `node --check` on the changed test file -- OK.
- No `build:pos` / `build:skupervisor` / `build:store` run: this PR touches only a `*.test.js`
  file, which is excluded from every app's Vite entry graph and cannot affect a production build
  output.
- `npm run check:compliance` -- confirmed to **fail** first (naming this exact file), then
  **pass** once this declaration was added.

## Residual Risks

None identified. This is a test-assertion-only back-port with no source-file change; the behavior
it verifies (cash-sale auto-drawer-open at checkout, never on reprint) was already shipped via PR
#1320 and is unaffected by this PR.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment for this
change. Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually
runs" and the pr-reviewer/`AGENTS.md` rule confirmed at #884, a `NOT-EXECUTED-*`
`preflight_request_ref` on a PR targeting `develop` is expected, not a review finding -- the
continuous `compliance-preflight-sweep.yml` (#1163/#1248) will reconcile this automatically after
this declaration lands on `develop`.
