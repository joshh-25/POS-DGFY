---
status: reference
owner: engineering
last_reviewed: 2026-08-26
declaration_id: 2026-08-26-pos-attendance-feature-disabled-gate
classification: major
surfaces: pos,terminal
reason_codes_impacted: POS_ATTENDANCE_FEATURE_DISABLED,POS_OPERATOR_FEATURE_DISABLED
policy_version: 2026.08.26
verification_evidence: npm run build:pos,npm run build:skupervisor,vitest run terminalShiftEntryDecision.test.js (apps/dgfy-ims),vitest run TerminalPageLayout.attendanceVisibility.test.jsx (apps/dgfy-ims)
rollback_note: Revert this commit. `isPosOperatorFeatureDisabledReason` and its two call sites are additive and read-only over the existing `checkoutOperatorLocked` derivation; reverting restores the single-code equality check exactly as it was, re-introducing the reported defect but changing no schema, migration, or persisted state.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-26T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1045-POS-ATTENDANCE-FEATURE-DISABLED-GATE
---

# POS Checkout Wrongly Gated on an Unrecognised Feature-Disabled Reason Code

## Compliance Impact Classification

Major. `packages/web-core/src/features/pos/` is `check-compliance-impact.js`'s exact-prefix floor
at `major`/`pos,terminal` — this PR touches `TerminalPage.jsx`, `terminalShiftEntryDecision.js`, and
their tests. It is a client-side gating-logic fix only: no schema, migration, permission, or
payment-capture change.

## What is wrong and why

`GET /pos/terminal/operator/current` is wired to the *throwing* feature resolver
(`apps/dgfy-api/src/modules/pos/index.js:357`, `resolveFeature: requirePosCashierAttendanceFeature`),
so a location with `pos_cashier_attendance_lifecycle_v1` disabled returns HTTP 404 with
`error_code: "POS_ATTENDANCE_FEATURE_DISABLED"` (`services/posCashierAttendanceFeature.js:15,36-45`).

The frontend's disabled-code check at `TerminalPage.jsx:3039` recognised only
`POS_OPERATOR_FEATURE_DISABLED` — a *different* reason code, emitted by a different, unreachable
branch on this call path (`posOperatorAuthorityUseCases.js:140`, injected via the non-throwing
resolver used only for the mutation-authorization path, `index.js:358`). The mismatch meant
`featureDisabled` was always `false` on this path, so the client fell through to
`required: true, valid: false`, rendering the "Register is assigned to X. Sign in as a cashier to
sell." banner and blocking checkout — for every account, on every location where the attendance
lifecycle feature is off, including the register's own owner.

**Confirmed the server was never actually blocking the sale.** `authorizeMutation`
(`posOperatorAuthorityUseCases.js:668-680`) uses the non-throwing resolver and returns
`{ authority_valid: true, legacy_fallback: true }` when the feature is disabled, so
`requireActiveOperatorForMutation` (`controllers/posHandlers.js:343`) already lets
`POST /pos/checkouts` through. This PR removes a client-side false block on a request the API was
already going to accept — it grants no new server-side authority and changes no server behavior.

## Affected Surfaces

- `pos`, `terminal` — POS checkout gating logic:
  `packages/web-core/src/features/pos/utils/terminalShiftEntryDecision.js` (new exported helper,
  additive), `packages/web-core/src/features/pos/pages/TerminalPage.jsx` (one equality check
  widened to a two-value membership check).

## Compliance Preconditions

- No reason code, permission, compliance policy, or tenant-lifecycle *rule* changed. The two reason
  codes this PR reconciles (`POS_OPERATOR_FEATURE_DISABLED`, `POS_ATTENDANCE_FEATURE_DISABLED`)
  already existed and already meant the same thing operationally (the register is not under
  operator authority); this PR only makes the client recognise both.
- The guard still fires correctly for the case it exists to cover: a location with the attendance
  lifecycle **enabled** and a genuinely different, unauthorized user attempting to sell — untouched
  by this change, verified by the unchanged `TerminalPageLayout.attendanceVisibility.test.jsx` suite.
- No change to `authorizeMutation`, `requireActiveOperatorForMutation`, or any backend authorization
  path — this is a display/gating correction on the client only.

## Verification Evidence

- `npm run build:pos` and `npm run build:skupervisor`: real Vite production builds of both apps that
  consume `TerminalPage.jsx`/`TerminalPageLayout.jsx` — both succeeded.
- `vitest run` (from `apps/dgfy-ims`, which is where `packages/web-core` tests run —
  `apps/dgfy-pos/vite.config.js:126`) on
  `packages/web-core/src/features/pos/__tests__/terminalShiftEntryDecision.test.js`: 20/20 passing,
  including two new cases covering both recognised codes, an unrelated code, empty string, and
  `undefined`.
- Same runner on `packages/web-core/src/features/pos/__tests__/TerminalPageLayout.attendanceVisibility.test.jsx`
  (existing regression coverage for the banner itself): 5/5 passing, unchanged.
- Root cause confirmed against a live production response body (not inferred): a direct
  authenticated request to `GET /api/v1/pos/terminal/operator/current` on `pos.dgfy.ph` returned
  `404 POS_ATTENDANCE_FEATURE_DISABLED`.

## Changed Files

- `packages/web-core/src/features/pos/utils/terminalShiftEntryDecision.js`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/__tests__/terminalShiftEntryDecision.test.js`

## Preflight Reconciliation

**Not run — explicitly authorized to skip, not silently omitted.** This PR targets `main` directly
as a same-day production hotfix (`.agents/skills/incident-responder/SKILL.md`'s manual `/hotfix`
entry, #331/#546/#861), not the normal `develop`-targeting path #884's "expected, not a finding"
framing covers. No `DGFY_DEV_TOKEN`/DEV-host credential was available in the executing session to
run the real `POST /api/v1/compliance/preflight` call. Pat explicitly authorized skipping it for
this hotfix in the same conversation that authorized the `main` merge — logged in full (timestamp,
what's skipped, why) in the authorization comment on issue #1045 before the merge, per the
incident-responder override's every-invocation logging requirement. This is a narrow, single-PR
skip, not a standing exemption.
