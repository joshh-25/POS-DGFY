---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-employeecredit-contract-test-runcheckouthardware-fix
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.02
verification_evidence: packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js -- actually executed (Vitest), 7/7 passing,node --check on the changed test file
rollback_note: Test-file-only change, plain revert of this PR's single commit restores the pre-fix (stale) assertions. No API, schema, payment, fiscal calculation, authorization, persistence, or hardware command behavior changes -- the underlying source (usePosCheckoutWorkflow.js) is untouched by this PR.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T04:47:13.961Z
preflight_request_ref: PREFLIGHT-33591616517-2026-09-02-EMPLOYEECREDIT-CONTRACT-TEST-RUNCHECKOUTHARDWARE-FIX
---

# employeeCredit contract test fix for the runCheckoutHardware refactor (PR #1357 gate failure)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed against `scripts/check-compliance-impact.js`: the sole
changed file, `packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js`, sits
under `packages/web-core/src/features/pos/`, matching the dedicated `COMPLIANCE_SENSITIVE_RULES`
rule (`/^packages\/web-core\/src\/features\/pos\//`), which sets a `major` floor for the
`pos`/`terminal` surfaces regardless of whether the changed file is test-only.

Does not reach `regulatory`: nothing in this change touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. No backend file, and no non-test source file of any kind,
is touched.

`reason_codes_impacted: NONE` is deliberate -- this change introduces no new backend validation
path and no new `DomainErrorCode`/reason-code taxonomy entry; it is a test-assertion update only.

## What this change does

`packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js`'s
`'offers the tender and submits only its governed authorization details'` test case asserted on a
literal source string, `openDrawerAfterPrint: isCashPayment`, in
`usePosCheckoutWorkflow.js`. PR #1320 (already merged to `develop` and `staging`) refactored that
hook to extract a shared `runCheckoutHardware({ cashPayment, ... })` helper used by both the
direct-checkout and split-payment call sites; the drawer-open call site inside that helper now
reads a local `cashPayment` parameter (`openDrawerAfterPrint: cashPayment`), with each call site
correctly passing its own cash-tender boolean through (`cashPayment: isCashPayment` at the direct
checkout site, `cashPayment: includesCashTender` at the split-payment site). The `printReason`
default was similarly split out of an inline `reason: 'checkout_auto_print'` literal into a named
`printReason = 'checkout_auto_print'` default parameter. Runtime behavior is unchanged in both
cases -- only the literal source text the contract test scans for moved. This surfaced as a stale
contract-test failure in `gate:release:local` during the 2026-09-01/02 `develop -> staging -> main`
promotion (PR #1357, target SHA `ba458629d` on `origin/staging`), not as a real regression.

This PR updates the test's three affected assertions to match the refactored call sites
(`openDrawerAfterPrint: cashPayment`, `cashPayment: isCashPayment`, and
`printReason = 'checkout_auto_print'`), preserving the test's original intent: a cash sale still
auto-opens the drawer on checkout print, and a reprint never does (the surrounding, unchanged
assertions on `usePosReceiptHardwareWorkflow.js`'s `shouldOpenDrawer = false` already cover that
second half and are untouched by this PR).

## Affected Surfaces

1. `packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js` (**modified**,
   test-only) -- three `toContain` assertions updated to the refactored literal source strings, per
   above. No other line in the file changes.

No non-test file is touched by this PR. `usePosCheckoutWorkflow.js` itself (the file the updated
assertions read) is unchanged -- its refactor already shipped and merged via PR #1320.

## Compliance Preconditions

1. **Zero non-test-source change, confirmed mechanically.** `git diff --name-only` against this
   PR's single commit contains exactly one file, the contract test itself.
2. **No behavior change.** The refactor this test now matches (`runCheckoutHardware`'s shared
   `openDrawerAfterPrint: cashPayment` write, and each call site's `cashPayment: isCashPayment` /
   `cashPayment: includesCashTender` argument) already shipped to `develop` and `staging` in PR
   #1320 -- this PR only re-aligns the test's literal-string scan with that already-live code, it
   does not change what code runs.
3. **The auto-open-drawer-on-cash / never-on-reprint invariant is preserved**, confirmed by the
   updated assertions still asserting `openDrawerAfterPrint: cashPayment` is driven by the real
   cash-tender flag at the checkout call site (`cashPayment: isCashPayment`), and by the untouched,
   still-passing assertions against `usePosReceiptHardwareWorkflow.js`'s
   `const shouldOpenDrawer = false;` for the reprint path.

## Verification Evidence

See the `verification_evidence` frontmatter key. Summary:

- `packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js` -- actually
  executed via Vitest, 7/7 tests passing (up from 1 failing assertion beforehand).
- `node --check` on the changed test file -- OK.
- No `build:pos` / `build:skupervisor` / `build:store` run: this PR touches only a `*.test.js`
  file, which is excluded from every app's Vite entry graph and cannot affect a production build
  output; the Worker checkpoint policy's Tier 0 build requirement is satisfied by the test run
  itself for a test-only change of this shape.
- `npm run check:compliance` -- confirmed to **fail** first (naming this exact file), then
  **pass** once this declaration was added.

## Residual Risks

None identified. This is a test-assertion-only correction with no source-file change; the behavior
it verifies (cash-sale auto-drawer-open at checkout, never on reprint) was already shipped and is
unaffected by this PR.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment for this
change. Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually
runs," the continuous `compliance-preflight-sweep.yml` (#1163/#1248) normally reconciles this after
a declaration lands on `develop`. This PR targets `staging` directly (per the task's explicit
instruction, to avoid sweeping in `develop`'s newer, unrelated queued work mid-promotion), so the
`develop`-triggered sweep will not see it automatically; the identical test fix is back-ported to
`develop` in a follow-up PR once this one merges, and that back-port PR carries its own declaration
copy, which the sweep will pick up in the ordinary way.
