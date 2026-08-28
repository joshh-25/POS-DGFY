---
status: reference
owner: engineering
last_reviewed: 2026-08-28
declaration_id: 2026-08-28-pos-service-worker-update-safety-session-guard
classification: major
surfaces: pos, terminal
reason_codes_impacted: N/A
policy_version: 2026.08.26
verification_evidence: packages/web-core/src/features/pos/__tests__/posUpdateSafety.test.js (23 passed, run from apps/dgfy-ims per its vitest test.include),packages/web-core/src/features/pos/__tests__/serviceWorkerCaching.contract.test.js (part of the same 23),npm run build:pos,npm run build:skupervisor
rollback_note: Revert this commit. The change only widens when a service-worker update is deferred (adds a second, session-aware safety source alongside the existing cart/checkout one) and adds an "Update now" activation path that did not exist before; reverting restores the prior unconditional login-screen/idle-terminal auto-reload behavior (the #990 defect) with no schema, migration, or persisted-state impact.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-28T00:00:00Z
preflight_request_ref: NOT-EXECUTED-990-POS-UPDATE-SAFETY-SESSION-GUARD
---

# POS Update-Safety Gate Now Covers the Login Screen and Idle Authenticated Sessions

## Compliance Impact Classification

Major. `scripts/check-compliance-impact.js` sets an exact-prefix floor of `major` /
`surfaces: pos, terminal` on any change under `packages/web-core/src/features/pos/`; this PR
touches `posUpdateSafety.js` and `TerminalPage.jsx` in that tree, plus the POS-only
`apps/dgfy-pos/src/main.jsx`.

## What is wrong and why

Fixes #990: the POS service worker's update-safety gate (`registerPosServiceWorker` in
`apps/dgfy-pos/src/main.jsx`) only ever consulted cart/checkout/receipt/drawer state published by
`POSCheckoutTerminal.jsx` — a component that mounts only after login. On the login screen, or on an
idle authenticated terminal, that state was always the module default `{ unsafe: false }`, so a
waiting service worker discovered after a redeploy activated immediately and forced an unconditional
`window.location.reload()` — losing in-progress login/unlock input or unexpectedly reloading a
logged-in session. A second, related defect found during investigation: the checkout component's own
unmount effect published `{}` ("safe"), which could release a *previously deferred* update (e.g.
deferred during an active cart) the instant a user logged out, reloading the login screen they had
just reached.

## Affected Surfaces

- `pos`, `terminal` — `packages/web-core/src/features/pos/utils/posUpdateSafety.js` (safety state is
  now keyed by publishing source — `checkout` and a new `shell` — and merged on read, instead of a
  single last-write-wins snapshot; adds `derivePosShellUpdateSafety`/`publishPosShellUpdateSafety`),
  `packages/web-core/src/features/pos/pages/TerminalPage.jsx` (publishes the new `shell` source:
  unsafe while the terminal is unauthenticated with dirty login/unlock/re-auth input, a submit in
  flight, or simply an authenticated session at all), `apps/dgfy-pos/src/main.jsx` (the deferred-update
  branch now also offers a working "Update now" button via the already-existing notice UI, and picks
  its message based on whether the deferral reason is transaction- or session-related).

## Compliance Preconditions

- No payment, auth-token, schema, or persisted-state code path is touched — this is entirely
  client-side service-worker update timing.
- The existing cart/checkout/receipt/drawer deferral behavior and its user-facing message are
  unchanged (pinned by the existing source-string contract test).
- The change can only make auto-update *more* conservative (defer in more cases) or offer an
  explicit user-triggered activation — it introduces no new path that force-reloads a page the old
  code would not already have reloaded.
- **Amendment 2026-08-28 (PR #1118 review, RF-1):** the "Update now" force-activation button
  originally bypassed every safety reason unconditionally, including an active cart/checkout/
  receipt/drawer reason — a click during a live transaction could have reloaded the terminal
  mid-sale. Fixed before merge: `hasCheckoutOwnedSafetyReason` (new, exported from
  `posUpdateSafety.js` as the single source of truth for which reasons are transaction-owned) now
  gates the `activate` callback so it is only ever offered for a pure "shell" (session/login)
  reason — never while any checkout-owned reason is present. Covered by
  `posUpdateSafety.test.js`'s `hasCheckoutOwnedSafetyReason` suite, including the exact scenario
  flagged in review (an active cart merged with dirty login-screen state).
- `apps/dgfy-ims` and `apps/dgfy-storefront` are unaffected: `dgfy-ims`'s own SW registration never
  force-reloads today and is untouched by this change; `TerminalPage.jsx`'s new publish effect is
  gated by the same `IS_DGFY_POS_SURFACE` constant `POSCheckoutTerminal.jsx` already uses, so it is a
  no-op when the same shared component renders inside `dgfy-ims`.

## Verification Evidence

- `packages/web-core/src/features/pos/__tests__/posUpdateSafety.test.js` and
  `.../serviceWorkerCaching.contract.test.js` — 23/23 passing, run from `apps/dgfy-ims`
  (`packages/web-core` has no test runner of its own; its tests execute via `apps/dgfy-ims`'s vitest
  `test.include` glob).
- `npm run build:pos` and `npm run build:skupervisor` — both real Vite builds, both succeed with no
  errors (Tier 0 per `.agents/skills/implement/SKILL.md`; `packages/web-core` has no build step of
  its own but is the shared trunk compiled into both apps).
- No `package.json` changed in this PR; no lockfile step required.

## Changed Files

- `packages/web-core/src/features/pos/utils/posUpdateSafety.js`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-pos/src/main.jsx`
- `packages/web-core/src/features/pos/__tests__/posUpdateSafety.test.js`
- `packages/web-core/src/features/pos/__tests__/serviceWorkerCaching.contract.test.js`

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-990-POS-UPDATE-SAFETY-SESSION-GUARD` is expected on
a PR targeting `develop`, not a finding — per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> staging`/`main`
promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment), not per PR.
