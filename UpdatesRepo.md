# DGFY POS Repository Handoff

Last updated: 2026-09-10
Repository root: `C:\xampp\htdocs\POS-DGFY`
Working branch: `POS-Development`
Current HEAD: `2b55bf4f0 docs(pos): record phase 321 performance validation`
Phase 321 is committed locally in `a26e3dbe2` (frontend), `ca74f9352` (API), and `2b55bf4f0` (documentation). No push or PR has been performed.

## Architecture

- `apps/dgfy-pos` is the standalone POS application.
- `packages/web-core` contains the shared POS terminal hooks, components, services,
  hardware drivers, and utilities consumed by POS and the other frontend apps.
- `apps/dgfy-api` is the backend. Its required flow is
  `routes -> controllers/handlers -> usecases -> repositories -> models`.
- `apps/dgfy-ims` and `apps/dgfy-storefront` consume shared frontend code but were
  not changed by the current performance fix.
- POS catalog reads go through `packages/web-core/.../pos/services/posService.js`
  to the API. iMin printing executes in the client driver and reports an
  idempotent audit result to the API.
- No database migration is needed for the current work.

Authoritative starting points are `docs/START_HERE.md`,
`docs/architecture/ARCHITECTURE_BOUNDARIES.md`, and
`docs/architecture/ARCHITECTURE_GOVERNANCE.md`. Relevant decisions are ADR 0014
(read performance/cache contracts), ADR 0053 (client hardware audit), and ADR
0067 (Chrome 80-84/iMin compatibility).

## Completed change: Phase 321

The reported slowdown when a POS sale has more than ten cart lines was a real
performance gap. The local implementation now:

1. Cancels stale catalog search requests with `AbortController`, while retaining
   the existing request-sequence guard for older WebViews and stale responses.
2. Builds one `Map` of cart quantities per render instead of filtering the entire
   cart once for every catalog card.
3. Memoizes cart subtotal, item discounts, governed discounts, discount previews,
   and VAT breakdowns so search-only renders do not recalculate financial data.
4. Keeps client-driver receipt auditing compliant with ADR 0053, but fetches only
   receipt identity/contract metadata. The client path no longer loads the full
   transaction graph, settings, or a logo raster before recording the audit.
5. Leaves server-driver printing, receipt content, payment totals, audit
   idempotency, and tenant authorization unchanged.

The implementation is intentionally local to POS search/rendering and receipt
audit latency. It does not make auditing fire-and-forget and does not change
checkout or financial rules.

## Relevant files

- `packages/web-core/src/features/pos/hooks/usePosCatalogWorkflow.js` — stale
  request cancellation and cleanup.
- `packages/web-core/src/features/pos/services/posService.js` — optional Axios
  request config for catalog cancellation.
- `packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx` —
  linear cart quantity lookup.
- `packages/web-core/src/features/pos/hooks/usePosFinancialWorkflow.js` —
  memoized financial calculation graph. The targeted
  `react-hooks/preserve-manual-memoization` suppression documents that inputs
  are immutable React state snapshots.
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` — optional
  attributes/include controls for lightweight transaction reads.
- `apps/dgfy-api/src/modules/pos/usecases/posDeviceUseCases.js` — lightweight
  client-driver receipt audit path; server-driver path remains complete.
- `packages/web-core/src/features/pos/__tests__/posCatalogPerformance.contract.test.js` —
  search, render, and financial performance contracts.
- `apps/dgfy-api/tests/posDevicePrintReceipt.unit.test.js` — client/server receipt
  printing and audit behavior.
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` — Phase 321 completion entry.
- `docs/compliance/impact-declarations/2026-09-10-pos-large-cart-performance.md` —
  compliance declaration for this change.

## Validation already completed

From the repository root:

```powershell
cd packages/web-core
npx vitest run src/features/pos/__tests__/posCatalogPerformance.contract.test.js src/features/pos/__tests__/iminPerformanceProfile.contract.test.js src/features/pos/services/__tests__/posCatalogReadCoordinator.test.js
```

Result: 3 files and 15 tests passed.

```powershell
cd apps/dgfy-api
npm test -- --runInBand tests/posDevicePrintReceipt.unit.test.js
npx eslint src/modules/pos/repositories/posRepository.js src/modules/pos/usecases/posDeviceUseCases.js
```

Result: 12 receipt tests passed and both changed API files lint cleanly.

```powershell
cd apps/dgfy-pos
npm run lint
npm run build
```

Both passed. The build still emits the repository's existing large-chunk
warnings; it completes successfully.

Additional completed checks:

```powershell
cd C:\xampp\htdocs\POS-DGFY
npm run lint:docs
npm run check:architecture
npm run check:compliance
git diff --check
```

All passed at the time of handoff.

## Remaining work and limits

- A physical iMin/APK printer run has not been performed. Backend and client
  audit paths are covered by tests, but real-device print timing still needs
  field verification.
- Full API lint still has four unrelated baseline errors in the bulk-image-import
  files (`no-control-regex` and `no-empty`). Do not attribute them to Phase 321.
- The broader API test run has a known unrelated image-lifecycle v2 fixture
  mismatch. The focused receipt suite is the relevant gate for this change.
- The working tree contains unrelated existing files and untracked artifacts.
  Preserve them; do not clean or stage them blindly.

## Next-agent operating rules

- Continue using the local `POS-Development` branch. Do not create a PR or push
  unless the user explicitly requests it.
- Before any commit, inspect `git status`, read `docs/ai/PR.md` if a PR is being
  prepared, run `rg "DO NOT COMMIT"` over changed files, and batch commits by
  domain using Conventional Commits.
- If the next task changes architecture, database, payment, checkout, or hardware
  contracts, repeat the mandatory documentation lookup and update the phase
  ledger. Phase 321 is completed. Phases 322 and 323 already exist and are
  in_progress; the next unused phase number is 324. Continue their existing
  scope only when requested; do not allocate Phase 322 again.
- Do not run a migration unless a schema change is actually introduced.
