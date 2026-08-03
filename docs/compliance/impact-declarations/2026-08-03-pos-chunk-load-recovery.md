---
status: reference
owner: engineering
last_reviewed: 2026-08-03
declaration_id: 2026-08-03-pos-chunk-load-recovery
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.03
verification_evidence: POS catalog performance contract tests,POS page shell contract tests,terminal view-mode contract tests,service worker caching contract tests,chunkLoadRecovery unit tests,ErrorBoundary chunk-recovery tests
rollback_note: Revert chunkLoadRecovery.js, the ErrorBoundary chunk-detection changes, the vite:preloadError listener in apps/pos/src/main.jsx, all lazyWithChunkRetry conversions, and this declaration together. The nginx and service-worker changes in the same batch are safe to keep independently -- they only change caching/cache-validation behavior for static assets, not POS terminal logic.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-03T00:00:00+08:00
preflight_request_ref: POS-CHUNK-LOAD-RECOVERY-20260803
---

# POS Chunk-Load Recovery

## Compliance Impact Classification

Major. This batch changes governed POS terminal error-handling and module-loading
behavior: every `React.lazy()` dynamic import in the POS surface (checkout terminal,
operations workspace, tenant setup modal, barcode scanner, receipt/order preview,
transaction history) is wrapped with a retry-then-reload recovery helper, and
`ErrorBoundary` gains chunk-load-specific detection with an automatic one-shot
reload path. No checkout, payment, discount, inventory, shift, or receipt logic is
touched -- this is purely how the terminal recovers when a deployed build's static
assets are missing from a stale tab.

## Affected Surfaces

1. Every lazy-loaded POS component now retries a failed dynamic import once before
   falling back to a one-shot, cooldown-limited full-page reload
   (`frontend/src/utils/chunkLoadRecovery.js`).
2. `ErrorBoundary` (mounted around the entire POS app tree) distinguishes a
   chunk-load failure from a genuine render error: the former recovers
   automatically and is only reported to Sentry once the automatic reload budget
   is spent; the latter is reported and shown to the user exactly as before.
3. The manual "Reload Page" button now also clears the reload-cooldown marker and
   purges the service worker's caches, so an explicit human click always gets a
   full recovery path -- this is a strictly stronger manual recovery than before,
   not a new failure mode.
4. A `vite:preloadError` listener is added to the POS entry point to catch the
   idle-time workspace prefetch, which sits outside any Suspense/ErrorBoundary and
   would otherwise surface as an unhandled promise rejection.

## Compliance Preconditions

1. The backend remains authoritative for tenant membership, permissions, terminal
   assignment, shifts, prices, payments, and inventory -- none of that is touched.
2. No checkout, payment, or receipt code path is modified; only the module-loading
   and error-boundary layer around already-existing components.
3. The automatic recovery path never triggers more than once per 10-minute window
   per tab (`CHUNK_RELOAD_COOLDOWN_MS`), so it cannot become a reload loop that
   disrupts an in-progress transaction.
4. A cashier's open cart, in-progress payment, or unprinted receipt is unaffected
   by this change: the automatic reload only fires when a component genuinely
   fails to load (nothing rendered yet to lose), never as a proactive
   "new version available" interruption of an already-loaded workspace.

## Verification Evidence

1. Frontend focused validation passed for the POS and chunk-recovery surfaces:
   `posCatalogPerformance.contract.test.js` (5 tests, including the new
   chunk-recovery assertion), `posPageShell.contract.test.js`,
   `terminalViewModeContracts.test.js`, `serviceWorkerCaching.contract.test.js`
   (7 tests, all 11 originally pinned strings unchanged plus 4 new assertions
   per app), `chunkLoadRecovery.test.js` (19 new unit tests covering error
   classification, the reload cooldown, and the retry-then-reload sequence), and
   `errorBoundary.chunkRecovery.test.jsx` (3 new tests covering the automatic
   reload path, the report-after-budget-spent path, and the unchanged generic
   render-error path).
2. Full frontend suite run before and after this batch to confirm no regressions
   beyond this change's own additions (see PR body for the exact before/after
   counts).
3. `npm run check:compliance -- --staged` passed with this declaration staged
   alongside the `frontend/src/features/pos/**` changes it covers.
