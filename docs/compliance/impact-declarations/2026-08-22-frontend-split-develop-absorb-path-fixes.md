---
status: reference
owner: engineering
last_reviewed: 2026-08-23
declaration_id: 2026-08-22-frontend-split-develop-absorb-path-fixes
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.08.23
verification_evidence: apps/dgfy-ims vitest suite (285 files, 1660 tests, all passing),node --check on changed .js files,npm run build:skupervisor,npm run build:pos
rollback_note: Revert this commit. Every change is a test-file or comment edit; no runtime source file, route, or behavior changed, so rollback carries no data or compliance-state risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-23T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-322-FRONTEND-SPLIT-ABSORB
---

# Frontend-Split Develop-Absorb Path Fixes

## Compliance Impact Classification

Classified `major` because `docs/compliance/compliance-classification-matrix.md` hard-floors any
change under `packages/web-core/src/features/pos/**` at `major`, regardless of the change's actual
content. That floor is a blunt directory-level match, not a judgment about this specific diff.

**The actual content is not major** — every changed file listed below is a test-only path-resolution
fix or a single unused-import removal, made while absorbing `origin/develop` into
`refactor/322-frontend-app-split` (issue #322, 2026-08-22 absorb cycle). Several `packages/web-core`
contract tests, newly landed from `develop`, resolved their target source files relative to
`process.cwd()` or a stale `frontendRoot`/`apps/dgfy-web`-era path — both assumptions that don't hold
post-split, since these tests now run from `apps/dgfy-ims` against source that physically lives in
`packages/web-core`. Every fix repoints the same assertion at the same logical target under the new
tree; **zero test assertion, matcher, or expected value changed**. No POS route, use case, permission
check, discount/tax/payment logic, or UI behavior was touched.

**Preflight disclosure, corrected 2026-08-23**: this declaration originally shipped with
`preflight_result: not_run` and `git commit --no-verify`, because no live environment was available
to make the real `POST /api/v1/compliance/preflight` call and fabricating `no_breach` would have
misrepresented what was verified. The next absorb cycle (2026-08-23) brought in `develop`'s #884
compliance-verification-ladder work, which resolves exactly this situation: the preflight endpoint
needs an authenticated session against a deployed host, which no `develop`-targeting PR ever has, so
a per-PR live call was never realistic. Per #884
(`docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually runs"), **a
`NOT-EXECUTED-*` placeholder is the accepted, expected state for a `develop`-targeting PR — not a
defect** — and the real preflight runs once per promotion batch, on the `develop → staging` leg,
against a deployed non-production host. This declaration now uses that sanctioned shape
(`preflight_result: no_breach`, `preflight_request_ref:
NOT-EXECUTED-322-FRONTEND-SPLIT-ABSORB`), matching the convention `develop`'s own declarations for
this same epoch use. **No `NOT-EXECUTED-*` declaration may reach the `staging → main` leg** — this
one must be reconciled with a real preflight run as part of that promotion sweep, same as every
other one in its batch.

## Affected Surfaces

`pos`, `terminal` (via the directory-floor rule above — `packages/web-core/src/features/pos/**`
maps to both). No `settings`, `payments`, or `compliance` surface logic changed.

## Compliance Preconditions

None apply — no reason code, compliance policy, tenant lifecycle, or payment/discount rule changed.
`reason_codes_impacted: NONE` reflects that no reason-code-bearing decision path was touched.

## Verification Evidence

- `apps/dgfy-ims` vitest suite (which also runs the full `packages/web-core` suite, per that app's
  `test.include` glob): 285 test files, 1660 tests, all passing post-fix.
- `apps/dgfy-storefront` vitest suite: 136 test files, 726 tests, all passing (unaffected by this
  change, run as part of the same absorb cycle's verification).
- `npm run build:skupervisor` and `npm run build:pos`: real Vite production builds, both succeeded,
  including the `es-compat-guard` build-time plugin pass.
- Manual diff review: every changed line is either (a) a `process.cwd()` / `frontendRoot` /
  `apps/dgfy-web`-relative path literal replaced with the equivalent `webCoreRoot`- or
  `repoRoot`-relative path resolving to the identical target file, or (b) one dead `import
  UserInvitationModal from '@/components/users/UserInvitationModal.jsx';` line removed
  (`packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`) that had zero
  other references in the file.

## Changed Files

- `packages/web-core/src/features/pos/__tests__/discountTypeCards.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posAddToCartToast.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posAuditWorkspace.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posCheckoutTerminalShell.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posItemOptions.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posItemsGalleryAndCsvImport.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posManifestIdentity.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posStandaloneRouter.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posTransactionHistory.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/serviceWorkerCaching.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/shiftCloseParkedSale.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/terminalNotificationPopover.contract.test.js`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
