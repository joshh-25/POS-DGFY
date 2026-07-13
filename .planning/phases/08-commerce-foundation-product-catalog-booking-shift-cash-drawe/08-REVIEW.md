---
phase: 08-commerce-foundation-product-catalog-booking-shift-cash-drawe
reviewed: 2026-07-13T02:15:27Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs
  - apps/dgfy-migration-runner/src/migrations/schema/20260712140000-harden-compliance-mode-state-uniqueness.cjs
  - apps/dgfy-api/src/models/Tenant/Shift.js
  - apps/dgfy-api/src/models/Tenant/ComplianceModeState.js
  - apps/dgfy-migration-runner/tests/phase08CommerceFoundationSchema.test.js
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 08: Code Review Report (08-13 gap-closure re-review)

**Reviewed:** 2026-07-13T02:15:27Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This is a focused re-review of exactly the 5 files touched by plan 08-13 (a
gap-closure fix for a MySQL error 1215 blocker: `shifts.terminal_id`,
`shifts.cashier_account_id`, and `compliance_mode_state.branch_id` foreign
keys were switched from `CASCADE`/`CASCADE` to `RESTRICT`/`RESTRICT` because
MySQL 8.0 forbids `CASCADE` on a base column of a `STORED` generated
column). It supersedes the phase's earlier 08-REVIEW.md, which covered the
other 12 plans/71 files and is not re-litigated here.

The actual diff is small and mechanically correct: three FK definitions
were changed from `CASCADE`→`RESTRICT` (mirrored identically across the
migration and its two corresponding Sequelize models), documentation
comments were added/corrected, and one new opt-in, MySQL-backed integration
test (`phase08CommerceFoundationSchema.test.js`) was added that proves the
fix against a fresh, disposable `dgfy_business_*` schema. I traced this
fix's actual runtime behavior against `apps/dgfy-migration-runner/src/commands/schema.js`
and `apps/dgfy-migration-runner/src/metadata/*` to check whether the "edit
an already-numbered migration in place" approach is actually safe, and
found a real (if currently unconfirmed) gap: the fix's own idempotency
guards mean it cannot self-heal an environment that already has a
partially-applied `shifts`/`compliance_mode_state` table from before this
fix. No BLOCKER-severity finding — the change is correct for the tested
"fresh database" path and the team's own investigation found no evidence
this migration was ever applied elsewhere — but two WARNING-level
robustness gaps and one INFO nit are documented below.

I also checked whether `RESTRICT` vs `CASCADE` changes app-level delete
behavior for `locations`/`terminal_identities`/`staff_accounts` (deleting a
row referenced by `shifts`/`compliance_mode_state` now fails instead of
cascading). No usecase in the codebase currently performs a hard `DELETE`
on any of those three tables — `deleteLocation`
(`apps/dgfy-api/src/modules/businesses/usecases/locationUseCases.js:363`)
is a soft delete (`is_active = false` via
`apps/dgfy-api/src/modules/businesses/repositories/locationRepository.js:232-234`)
and no `deleteTerminal`/`deleteStaffAccount` usecase exists — so this
behavior change is currently inert and not flagged as a finding.

## Warnings

### WR-01: The in-place migration edit cannot self-heal a database that already partially-applied the old CASCADE version

**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260712100000-create-commerce-foundation.cjs:289-360, 407-450`
**Also relevant:** `apps/dgfy-migration-runner/src/migrations/schema/20260712140000-harden-compliance-mode-state-uniqueness.cjs:22-32`

**Issue:** 08-13 fixes the FK type by editing `20260712100000-create-commerce-foundation.cjs`
directly (an already-numbered, previously-shipped migration file), rather
than issuing a new forward-dated migration — the opposite of this codebase's
own stated convention ("additive forward-dated migrations over editing prior
ones, for idempotent-rerun safety against any already-migrated
`dgfy_business_*` database", per `20260712140000`'s own header comment,
lines 13-16 before this diff). The header's own "Correction" paragraph
(lines 22-32) justifies the in-place edit only by asserting the migration
"was NOT, in fact, already-shipped… confirmed never applied to any real
business database (only mocked-queryInterface/grep verification existed)".

That assertion is unenforced by any code path. I checked
`apps/dgfy-migration-runner/src/metadata/checksum.js` (`computeFileChecksum`)
and `apps/dgfy-migration-runner/src/metadata/storage.js` /
`apps/dgfy-migration-runner/src/commands/schema.js`: a `checksum` column
exists on both `schema_migrations` and `command_executions` in
`bootstrap.js`, but it is never populated or compared anywhere in
`schema.js`/`storage.js` (no read/comparison call site found). There is no
migration-content-drift detection at all — if the assumption in the header
comment is ever wrong for any environment, nothing will flag it.

More importantly, even if the assumption is correct today, the fix has no
self-healing path if it is ever violated later (e.g., a stale branch, a
long-lived feature-flagged dev database, or a future backport). The
migration's own idempotency guards work against recovery:

```js
// line 289
if (!await tableExists('shifts')) {
  await queryInterface.createTable('shifts', { /* ...now RESTRICT... */ });
}
// line 344
const shiftsTableDescription = await queryInterface.describeTable('shifts');
if (!shiftsTableDescription.active_terminal_cashier_key) {
  await queryInterface.sequelize.query(`ALTER TABLE shifts ADD COLUMN active_terminal_cashier_key ... STORED`);
}
```

If `shifts` already exists anywhere with the *old* `CASCADE` FK (e.g. from
a version of this file that predates the `STORED` generated column, or a
partially-applied earlier `up()` run), `tableExists('shifts')` is `true`,
so the `createTable` call — which is the only place the RESTRICT fix is
applied — is skipped entirely. Execution then reaches the `ALTER TABLE
shifts ADD COLUMN active_terminal_cashier_key … STORED` unconditionally,
which will throw the exact same MySQL error 1215 again, because the FK on
`terminal_id`/`cashier_account_id` is still `CASCADE` on the pre-existing
table. The same reasoning applies to `compliance_mode_state.branch_id`
versus `20260712140000`'s `ADD COLUMN branch_scope_key … STORED` ALTER.
Editing the source file does not change the DDL already baked into an
existing table; there is no `ALTER TABLE … DROP FOREIGN KEY … / ADD
CONSTRAINT … ON DELETE RESTRICT ON UPDATE RESTRICT` repair step anywhere in
either migration for the case where the table already exists with the
stale FK.

**Fix:** Either (a) add an unconditional post-guard that inspects
`information_schema.referential_constraints` for the `terminal_id`/
`cashier_account_id`/`branch_id` FKs on an already-existing table and
re-creates them with `ON DELETE RESTRICT ON UPDATE RESTRICT` if they are
currently anything else, before attempting the generated-column `ALTER`;
or (b) at minimum, wrap the generated-column `ALTER` in a guard that
produces an explicit, actionable error (rather than a bare MySQL 1215)
identifying the stale FK and pointing at a documented manual remediation
step, so this failure mode is diagnosable if it ever occurs instead of
silently reproducing the original blocker.

### WR-02: New integration test only proves the fix on a pristine database — it does not cover the partial/stale-FK scenario the fix's own commit history flags as a real prior uncertainty

**File:** `apps/dgfy-migration-runner/tests/phase08CommerceFoundationSchema.test.js:70-219`

**Issue:** The new test creates two fully-empty, uniquely-suffixed disposable
databases (`coreDbName`, `businessDbName`) and asserts the full migration
chain applies cleanly and that the RESTRICT FKs / generated columns /
indexes materialize (lines 134-215). This is good evidence for the "fresh
database" path, but it is the one path that was never actually broken by
the CASCADE bug in a scenario where a table did not yet exist — the header
comment's own "Correction" (see WR-01) acknowledges uncertainty about
whether some environment already has a `shifts`/`compliance_mode_state`
table with the old `CASCADE` FK. No test in this file (or elsewhere in the
5 reviewed files) constructs that specific stale-FK precondition (e.g. by
manually creating `shifts` with `CASCADE` first, then running the migration
chain against it) to confirm what actually happens in that case. Right now
that scenario is untested and, per WR-01, still broken.

**Fix:** Add a companion test/case that first creates `shifts` (or
`compliance_mode_state`) with the pre-08-13 `CASCADE` FK directly via raw
DDL, then runs `runSchemaMigrate({})` against it, and asserts the actual
resulting behavior (either a clear, actionable failure, or — once WR-01 is
addressed — a successful self-heal to `RESTRICT`). This closes the
evidence gap between "works on a fresh DB" and "works everywhere this
migration might be encountered."

## Info

### IN-01: Unused `error` binding in empty catch block

**File:** `apps/dgfy-migration-runner/tests/phase08CommerceFoundationSchema.test.js:120-122`
**Issue:** `catch (error) { // best-effort cleanup only — never fail the suite on teardown. }` binds `error` but never references it, inconsistent with the `catch { ... }` (no binding) style used everywhere else in the reviewed migration files (e.g. `20260712100000-create-commerce-foundation.cjs:502-511`, `20260712140000-harden-compliance-mode-state-uniqueness.cjs:114-116, 123-125`).
**Fix:** Drop the unused binding for consistency: `catch { // best-effort cleanup only — never fail the suite on teardown. }`.

---

_Reviewed: 2026-07-13T02:15:27Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
