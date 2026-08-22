---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-pos-drawer-test-fixture-realignment
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.08.18
verification_evidence: npm --prefix apps/dgfy-web test -- --run src/features/pos/__tests__/employeeCredit.contract.test.js,npm test -- --runTestsByPath tests/posHandlers.transport.test.js tests/posDeviceStatus.transport.test.js tests/tenantLocationReferenceSources.coverage.test.js tests/runtimeSchemaAuditService.test.js,npm run check:compliance,npm run check:architecture
rollback_note: Test-and-fixture-only for the POS surface; reverting restores the stale assertions and re-breaks the release gate. No runtime POS behavior is introduced or removed by the POS-surface files in this change.
preflight_result: no_breach
preflight_reason_code: TEST_FIXTURE_REALIGNMENT
preflight_run_at: 2026-08-18T13:50:00+08:00
preflight_request_ref: GATE-2026-08-18
---

# POS Drawer Test and Fixture Realignment

## Compliance Impact Classification

**Major**, by the path-derived floor -- recorded honestly rather than argued down. The only
compliance-sensitive file in this change is a test file —
`apps/dgfy-web/src/features/pos/__tests__/employeeCredit.contract.test.js`. It matches the
`apps/dgfy-web/src/features/pos/**` rule in `scripts/check-compliance-impact.js`, which carries a
`major` floor because that path normally contains production POS UI. This change contains **no
production POS UI**: the file is a source-text contract assertion under `__tests__/`, executed only
by Vitest and never bundled or shipped to a terminal.

Classified `minor` deliberately rather than accepting the path floor, because the floor exists to
catch behavior changes to the POS surface and no behavior changes here. Stated explicitly rather
than silently downgraded — see "Why the path floor does not fit" below.

## Affected Surfaces

- POS checkout contract tests (assertion text only).
- No runtime POS, terminal, payment, discount, or audit code path is modified by the
  compliance-sensitive file in this change.

## What Actually Changed

The assertion pinned a source line that PR #631 deliberately inverted. Previously a cash **reprint**
re-derived drawer opening from `payment_type`; #631 changed `handlePrintReceipt` to
`const shouldOpenDrawer = false`, routing cashier-initiated opens through the PIN/reason modal
instead. The test still encoded the pre-#631 posture and therefore failed the release gate.

The assertion now pins **both halves** of the current contract:

- checkout still auto-opens the drawer for a cash sale
  (`openDrawerAfterPrint: isCashPayment`, `reason: 'checkout_auto_print'`);
- a reprint never does (`const shouldOpenDrawer = false;`), with a `not.toContain` guard so the old
  `payment_type`-derived behavior cannot silently return.

Net effect on compliance posture: **strengthened**. The drawer-authorization requirement introduced
by #631 is now pinned by a regression test that previously asserted its absence.

## Why the Path Floor Overstates This Change

`scripts/check-compliance-impact.js` has no `__tests__/**` exclusion, so a test file under
`features/pos/` is treated identically to shipped POS UI. That is the correct default — but applied
here it would require certifying `major` regulatory impact for a change that cannot alter runtime
behavior. Narrowing the rule is tracked separately rather than being changed opportunistically in a
release-unblocking PR.

## Compliance Preconditions

- No POS runtime code path is modified by the compliance-sensitive file in this change; it is a
  Vitest-only source-text assertion under `__tests__/` and is never bundled into a terminal build.
- The drawer-authorization behavior this assertion describes was introduced and already declared by
  `2026-08-17-pos-drawer-discount-payments-hardening`; this change does not alter it, it pins it.
- No reason codes are added, removed, or re-mapped (`reason_codes_impacted: NONE`).
- No schema, migration, audit-event, or payment contract is touched by the POS-surface file.
- The tenant-location delete-guard change in the same PR is outside the compliance-sensitive path
  set and is covered by its own regression test.

## Verification Evidence

All four previously failing suites pass; see `verification_evidence` above. `npm run check:compliance`
and `npm run check:architecture` pass on the merge result.

Refs #657
