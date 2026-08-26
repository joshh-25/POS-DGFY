---
status: reference
owner: engineering
last_reviewed: 2026-08-26
declaration_id: 2026-08-26-pos-attendance-permission-gate
classification: major
surfaces: pos,terminal
reason_codes_impacted: POS_ATTENDANCE_PERMISSION_REQUIRED,POS_ATTENDANCE_FEATURE_DISABLED,PERMISSION_DENIED
policy_version: 2026.08.26
verification_evidence: npm run build:pos,npm run build:skupervisor,npm run check:architecture,npm run check:compliance,vitest run terminalShiftEntryDecision.test.js (apps/dgfy-ims),vitest run TerminalPageLayout.attendanceVisibility.test.jsx (apps/dgfy-ims),node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs posCashierLifecycle.usecases.test.js posOperatorAuthority.usecases.test.js posCashierAttendance.route.contract.test.js authCheckPermission.unit.test.js posOperatorAuthority.security.contract.test.js posOperatorAuthority.migration.test.js (apps/dgfy-api)
rollback_note: Revert this commit. The route-level checkPermission guard removed from GET /terminal/operator/current and POST /terminal/operator/resume is replaced by an equivalent (and, for getCurrent, strictly new) in-use-case check in the same commit -- reverting restores the removed guard exactly as it was, re-introducing the reported defect but changing no schema, migration, or persisted permission data. The checkPermission 403 payload change and the frontend classifier/banner changes are additive and read-only over existing fields.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-26T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1045-POS-ATTENDANCE-PERMISSION-GATE
---

# POS Register Owner Still Blocked: The #1054 Fix Was Unreachable Behind a Route-Level Permission Guard

## Compliance Impact Classification

Major. `apps/dgfy-api/src/routes/pos.js`, `apps/dgfy-api/src/modules/pos/`, and
`packages/web-core/src/features/pos/` are each `check-compliance-impact.js`'s exact-prefix/pattern
floor at `major`/`pos,terminal`. This is an authorization-ordering and error-classification fix: no
new permission is granted to any account, no schema or migration changes, and the server's actual
checkout-authorization decision (`authorizeMutation` / `requireActiveOperatorForMutation`) is
untouched.

## What is wrong and why

PR #1054 (merged, live on production) taught the POS frontend to treat reason code
`POS_ATTENDANCE_FEATURE_DISABLED` as "feature off, unlock checkout." That fix is correct but was
**unreachable** for one class of account, because `GET /pos/terminal/operator/current` and
`POST /pos/terminal/operator/resume` were gated by a **route-level**
`checkPermission(PERMISSIONS.POS.actions.VIEW_ATTENDANCE / OPERATE_ATTENDANCE)`
(`apps/dgfy-api/src/routes/pos.js:153,155`, pre-fix). That middleware runs *before* the handler, so
a user whose stored `users.permissions` snapshot predates `pos:attendance:*` shipping (#970) gets a
bare 403 with no reason code -- the handler, and therefore
`requirePosCashierAttendanceFeature`'s `POS_ATTENDANCE_FEATURE_DISABLED` response, is never reached.

**Confirmed against the production database** (tenant `sku_tenant_eaterynidoe_2e561dbb`): user
CAIN (user_id 4, role `cashier`, `is_master_admin: 0`, provisioned 2026-08-07) owns open shift 23 on
terminal COUNTER-02 -- the exact account and terminal named in #1045's original report. CAIN's
stored `permissions` lacks `pos:attendance:view`/`pos:attendance:operate`. The tenant admin
(`is_master_admin: 1`, bypasses `checkPermission` entirely) and a cashier created 2026-08-26 (stored
permissions include both keys) are both unaffected -- exactly the three-way split Pat observed. The
tenant's `pos_cashier_attendance_lifecycle_v1` setting is `{"enabled":false,"location_ids":[]}`, so
the feature is off fleet-wide; this permission gate was blocking checkout for a feature nobody has
enabled.

The fix moves the permission check **inside** each use case, evaluated **after** the feature
resolve -- mirroring the ordering `resume` already had internally
(`posCashierLifecycleUseCases.js:279-284`, pre-existing) and adding the equivalent to `getCurrent`,
which previously had no permission check of its own at all
(`posOperatorAuthorityUseCases.js:614-621`). Both use cases now share one policy module
(`apps/dgfy-api/src/modules/pos/services/posAttendancePermissionPolicy.js`) so the requirement and
reason code cannot drift between the two routes the way `POS_OPERATOR_FEATURE_DISABLED` vs.
`POS_ATTENDANCE_FEATURE_DISABLED` did.

## Affected Surfaces

- `pos`, `terminal` -- operator-authority boot-path routes and their in-use-case authorization:
  - `apps/dgfy-api/src/routes/pos.js` -- route-level `checkPermission` removed from exactly two
    routes (`GET /terminal/operator/current`, `POST /terminal/operator/resume`); every other
    operator/attendance route on the same file is untouched (see Scope Boundary below).
  - `apps/dgfy-api/src/modules/pos/services/posAttendancePermissionPolicy.js` (new) -- the shared
    permission check both use cases now call.
  - `apps/dgfy-api/src/modules/pos/usecases/posCashierLifecycleUseCases.js` -- `resume`'s existing
    inline check replaced with a call to the shared policy (byte-identical reason code/message).
  - `apps/dgfy-api/src/modules/pos/usecases/posOperatorAuthorityUseCases.js` -- `getCurrent` gains
    the permission check it previously lacked, ordered after the existing feature-disabled check.
  - `apps/dgfy-api/src/middleware/auth.js` -- `checkPermission`'s 403 gains additive
    `error_code`/`errors.reason_code` fields (existing `message`/`required` fields unchanged); this
    is shared middleware used across the product, not POS-specific, but the change is additive-only
    for every other consumer.
  - `packages/web-core/src/features/pos/utils/terminalShiftEntryDecision.js` -- new exported
    classifier (`isPosAttendancePermissionDeniedReason` / `isPosOperatorPermissionDeniedError`).
  - `packages/web-core/src/features/pos/pages/TerminalPage.jsx` -- skips the guaranteed-failing
    resume retry on a permission-denied 403; surfaces an actionable message instead of the generic
    "Register is assigned to X" text when a specific reason is known.
  - `packages/web-core/src/features/pos/components/TerminalPageLayout.jsx` -- the visible banner now
    renders the same resolved reason instead of reconstructing a second, independent copy of the
    owner-name string (removes a latent drift point between the two render sites).

## Scope Boundary

Deliberately limited to the two routes the terminal calls unconditionally on the authority-check
boot path (`GET /terminal/operator/current`, `POST /terminal/operator/resume`). Every other route on
`pos.js:151-161` (`pin/enroll`, `pin/reset`, `eligible`, `takeover`, `return`, `shared-relief/*`,
`handoff/count`, `end`) keeps its route-level `checkPermission` unchanged:

- `/terminal/operator/eligible`'s handler does not pass `user` to its use case and that use case has
  no permission check of its own -- removing the route guard there would leave it with **zero**
  authorization. Not on the boot path, so not needed for this fix.
- `/operator/pin/enroll`'s use case only conditionally checks the feature
  (`if (resolveFeature && locationId)`) -- removing its route guard would be a real fail-open.
- Every mutating custody-transition route (takeover/return/shared-relief/handoff) is user-initiated
  via a cashier PIN, not part of the page-load probe that produces the reported banner; relaxing
  those is disproportionate blast radius for this incident.

## Compliance Preconditions

- No permission is granted to any account by this change. A feature-off location now correctly
  answers "feature off" instead of "permission denied" for **every** account regardless of stored
  permissions; a feature-**on** location still denies a user missing `pos:attendance:*`, with a
  strictly *stronger* check for `getCurrent` than existed before (previously zero permission
  enforcement on that endpoint; a defect independently confirmed while implementing this fix, not
  something introduced by it).
- The guard still fires correctly for the case it exists to cover: a feature-enabled location and a
  user genuinely missing `pos:attendance:*` -- verified by new fail-closed tests on both use cases
  (see Verification Evidence) asserting the 403 and `POS_ATTENDANCE_PERMISSION_REQUIRED` persist,
  and that no repository access happens past the permission check (ordering assertion via spy).
- A genuinely different cashier (not the shift owner) remains blocked by the existing
  `POS_OPERATOR_NOT_ON_BREAK` / `POS_OPERATOR_ALREADY_ACTIVE` paths in `resume`, unchanged by this
  PR -- covered by the pre-existing "missing operator recovery does not let a different cashier
  claim the shift" test, still green.
- No change to `authorizeMutation`, `requireActiveOperatorForMutation`, or `POST /pos/checkouts`.

## Verification Evidence

Backend (`apps/dgfy-api`, `node --experimental-vm-modules node_modules/jest/bin/jest.js --config
jest.config.cjs --runInBand`):
- `posCashierLifecycle.usecases.test.js`: all cases pass, including two new --
  "resume succeeds for a stale-permission user when the feature is disabled" (the CAIN regression
  case) and "resume still denies a stale-permission user when the feature is enabled" (fail-closed),
  both with a repository-spy ordering assertion.
- `posOperatorAuthority.usecases.test.js`: all cases pass, including three new -- the same two
  disabled/enabled pair for `getCurrent`, plus a positive case for a permitted user.
- `posCashierAttendance.route.contract.test.js`: updated to pin the new route literals **and** the
  absence of `checkPermission` on both routes, so a well-meaning "restore" of the guard fails CI.
- `authCheckPermission.unit.test.js` (new): `checkPermission`'s 403 payload, additive fields, and
  the master-admin bypass.
- `posOperatorAuthority.security.contract.test.js`, `posOperatorAuthority.migration.test.js`: run
  unchanged as a regression check on the surrounding operator-authority route surface -- all pass.
- 31 + 7 = 38 backend tests total, all passing.

Frontend (`apps/dgfy-ims`, `npx vitest run`):
- `terminalShiftEntryDecision.test.js`: all cases pass, including new coverage for
  `isPosAttendancePermissionDeniedReason` / `isPosOperatorPermissionDeniedError` (recognizes both
  new codes, does not misclassify a feature-disabled or unrelated code, and confirms a
  permission-denied error is never also "authority unavailable").
- `TerminalPageLayout.attendanceVisibility.test.jsx`: unchanged, still passing (existing regression
  coverage for the banner).
- 41 tests total, all passing.

Build (`npm run build:pos`, `npm run build:skupervisor` from repo root): both real Vite production
builds succeeded.

Static checks (repo root): `npm run check:architecture` -- passes; `assertAttendancePermission` is
injected into both use-case factories from the composition root (`modules/pos/index.js`) rather than
statically imported inside `usecases/`, satisfying the `usecaseLayerLeak` guardrail. `npm run
check:compliance` -- passes, this declaration recognized for all 9 sensitive files touched.

## Changed Files

- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/src/modules/pos/services/posAttendancePermissionPolicy.js` (new)
- `apps/dgfy-api/src/modules/pos/usecases/posCashierLifecycleUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posOperatorAuthorityUseCases.js`
- `apps/dgfy-api/src/modules/pos/index.js` (composition root -- injects the shared
  policy into both use-case factories, per the `usecaseLayerLeak` architecture guardrail: a
  use-case module must not statically import from `services/`, so the dependency is wired here
  instead)
- `apps/dgfy-api/src/middleware/auth.js`
- `apps/dgfy-api/tests/posCashierAttendance.route.contract.test.js`
- `apps/dgfy-api/tests/posCashierLifecycle.usecases.test.js`
- `apps/dgfy-api/tests/posOperatorAuthority.usecases.test.js`
- `apps/dgfy-api/tests/authCheckPermission.unit.test.js` (new)
- `packages/web-core/src/features/pos/utils/terminalShiftEntryDecision.js`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/components/TerminalPageLayout.jsx`
- `packages/web-core/src/features/pos/__tests__/terminalShiftEntryDecision.test.js`

## Preflight Reconciliation

**Not run against a live DEV host -- expected on a `develop`-targeting PR, not a finding.** Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and
`pr-reviewer`'s own #884 (2026-08-22) clarification, the real
`POST /api/v1/compliance/preflight` sweep runs once per batch at the `develop -> staging` promotion,
not on every PR into `develop`. This declaration carries a `NOT-EXECUTED-*`
`preflight_request_ref` for that reason, to be reconciled at the next promotion sweep along with any
other batched declarations, per `.agents/skills/promoter/SKILL.md`'s compliance preflight sweep
step.

## Related work

- Issue #1045 stays open pending production deployment of this fix and verification against the
  original terminal.
- #1052 (banner's "Sign in as a cashier" remedy is unfollowable on an owner-solo tenant) is a
  distinct defect on the same banner, out of scope here.
- #1053 (`develop`) touches the same three frontend files for an adjacent, different problem
  (mixed-API-version route-missing compatibility) -- flagged separately so the next merge/promotion
  does not silently regress either fix.
- A stale-permission-snapshot data backfill (the immediate production relief for CAIN specifically)
  is an operational action tracked separately from this code fix -- see #1045 for status; it is not
  a substitute for this fix, since any future permission addition would reproduce the same class of
  outage for any user whose snapshot predates it.
