---
status: reference
owner: engineering
last_reviewed: 2026-08-28
declaration_id: 2026-08-28-terminalpage-activeshiftid-tdz-crash
classification: major
surfaces: pos, terminal
reason_codes_impacted: none
policy_version: 2026.08.28
verification_evidence: packages/web-core/src/features/pos/__tests__/terminalPageSessionEndActiveShiftId.contract.test.js (2 passed, new), packages/web-core/src/features/pos/__tests__/posSettingsCashier.contract.test.js (10 passed, unaffected), npm run build:pos (apps/dgfy-pos), npm run build:skupervisor (apps/dgfy-ims), npm run check:architecture
rollback_note: Revert this commit. Pure code-motion within one existing useEffect -- no new state, no new write path, no schema/migration. Reverting restores the prior (broken) state where TerminalPage throws "Cannot access 'activeShiftId' before initialization" on every render.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-28T09:20:56Z
preflight_request_ref: PREFLIGHT-2026-08-28-TERMINALPAGE-ACTIVESHIFTID-TDZ-CRASH-20260828T092056Z
---

# TerminalPage No Longer Crashes on Every Render

## Compliance Impact Classification

Major. `packages/web-core/src/features/pos/pages/TerminalPage.jsx` is a tracked `major`/`pos`,
`major`/`terminal` surface. The change is a pure behavioral no-op: it neither adds nor removes any
capability, permission, discount, payment, or fiscal logic -- it fixes a JavaScript temporal-dead-
zone bug that made the file unusable at all.

## What is wrong and why

Filed as #1107, surfaced while locally verifying an unrelated PR (#1105, `Refs #1093`).
`c7e16bdd8` (part of PR #1102, `Refs #1101`, merged into `develop` 2026-08-28T02:00:48Z) added
`activeShiftId` to a `useEffect` dependency array at what is now line 2833, but
`const activeShiftId = shiftState?.shift?.pos_terminal_shift_id || null;` isn't declared until
line 2967, later in the same component body. A dependency array is evaluated synchronously during
render (it is just an argument expression to `useEffect`), so this was a genuine temporal-dead-zone
violation -- `TerminalPage` threw `ReferenceError: Cannot access 'activeShiftId' before
initialization` on every single render, on `develop`. Confirmed via `git merge-base
--is-ancestor c7e16bdd8 origin/main` returning false: this had not reached `main`/production.

## What changed

Both the dependency-array entry and the sale-draft-cleanup closure inside the affected effect
(the `auth:session-expired` / `auth:session-cleared` / `auth:logout` handler) now derive the shift
id inline from `shiftState?.shift?.pos_terminal_shift_id`, which is already in scope from its
`useState` declaration at line 574 -- rather than depending on the later-declared `activeShiftId`
binding. No other code path referenced `activeShiftId` before its declaration.

## Affected Surfaces

- `packages/web-core/src/features/pos/pages/TerminalPage.jsx` -- the fix itself, two lines.
- `packages/web-core/src/features/pos/__tests__/terminalPageSessionEndActiveShiftId.contract.test.js`
  -- new regression test (source-text assertions, matching this test suite's existing pattern),
  guarding against the dependency array re-referencing `activeShiftId` before its declaration.

## Compliance Preconditions

- No new payment method, capability, permission, or write path is added or enabled.
- No new database column, table, or migration -- `shiftState`/`activeShiftId` are unchanged in
  shape and meaning; only the timing of one component-local derivation changed.
- `dine_in`/`takeout`, payment, discount, and voucher logic are untouched -- the diff is confined
  to two lines inside one existing `useEffect`.
- The fix is pure code motion: the same `shiftState?.shift?.pos_terminal_shift_id || null`
  expression that later feeds `const activeShiftId` is evaluated inline at the two points that
  previously referenced the not-yet-declared `activeShiftId` binding. No new branch, condition, or
  side effect is introduced.

## Verification Evidence

- `packages/web-core/src/features/pos/__tests__/terminalPageSessionEndActiveShiftId.contract.test.js`
  -- new, 2/2 passing: confirms the affected effect's dependency array no longer references the
  bare `activeShiftId` binding and instead reads `shiftState?.shift?.pos_terminal_shift_id`
  directly; confirms that binding's declaration still comes after the effect closes (so a future
  edit reintroducing a bare reference inside the effect body would be a real regression, not a
  false positive); confirms the sale-draft-cleanup closure was updated the same way.
- `packages/web-core/src/features/pos/__tests__/posSettingsCashier.contract.test.js` -- 10/10
  passing, unmodified -- confirms no regression to the other `TerminalPage.jsx` source-text
  contracts this same file already pins (Settings/PIN-gate view-mode logic).
- `npm run build:pos` (`apps/dgfy-pos`) and `npm run build:skupervisor` (`apps/dgfy-ims`) -- real
  Vite builds, both apps that bundle `packages/web-core/src/features/pos/pages/TerminalPage.jsx`.
- `npm run check:architecture`.
- Root cause confirmed via `git show c7e16bdd8^:packages/web-core/src/features/pos/pages/
  TerminalPage.jsx | grep -n activeShiftId` (no reference before the L2948-then declaration in the
  pre-regression tree) and `git merge-base --is-ancestor c7e16bdd8 origin/main` (false -- not on
  `main`).

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-1107-TERMINALPAGE-ACTIVESHIFTID-TDZ-CRASH` is
expected on a PR targeting `develop`, not a finding -- per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> staging`/`main`
promotion sweep, not per PR.

## Rollback

Revert the commit. No schema, migration, or persisted-state change; no new setting or capability.

**Update (2026-08-28, promotion-time sweep, #1017/#884 protocol):** Live `POST /api/v1/compliance/preflight` run against the deployed `staging` host (dedicated one-off `preflight-bot` account, since removed) returned `result: no_breach`, `reason_code: ALLOWED`. Recorded above as `preflight_request_ref: PREFLIGHT-2026-08-28-TERMINALPAGE-ACTIVESHIFTID-TDZ-CRASH-20260828T092056Z`.
