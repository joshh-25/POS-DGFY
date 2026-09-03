---
status: reference
owner: engineering
last_reviewed: 2026-09-03
declaration_id: 2026-09-03-procurement-csv-export
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.03
verification_evidence: node --check apps/dgfy-api/src/validators/posValidator.js apps/dgfy-api/src/modules/pos/usecases/posUseCases.js apps/dgfy-api/src/modules/pos/controllers/posHandlers.js apps/dgfy-api/src/modules/pos/index.js apps/dgfy-api/src/routes/pos.js (all pass),node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/posReports.usecase.test.js tests/posHandlers.transport.test.js (40 passed at PR-open time; 45 passed after the RF-1 fix-step added two location-scope tests and updated five existing ones to inject resolveLocationScope),npx vitest run (from apps/dgfy-ims) ../../packages/web-core/src/features/pos/__tests__/posReportsAnalyticsWorkspace.contract.test.js (6 passed),npm run build:pos (succeeded),npm run build:skupervisor (succeeded),npm run check:compliance
rollback_note: Revert this PR's diff. Every backend change is additive (a new validator schema, a new usecase, a new controller handler, a new route, plus their wiring exports) and every frontend change is additive (a new service function, a new button + handler) -- no existing endpoint, usecase, or component behavior is modified. Reverting the touched files fully restores prior behavior with no data migration or cleanup required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-03T06:37:12.000Z
preflight_request_ref: NOT-EXECUTED-1488
---

# Pre-run procurement CSV export (#1488)

## Compliance Impact Classification

Major (per `docs/compliance/compliance-classification-matrix.md`'s floor for
`apps/dgfy-api/src/modules/pos/**`, `apps/dgfy-api/src/routes/pos.js`, and
`packages/web-core/src/features/pos/**`). This adds a new downloadable CSV export that includes
customer PII (name, phone, delivery address) sourced from already-existing `PosTransaction` fields
-- no new data is captured or stored, but this is the first time this specific field set leaves the
system as a downloadable file via this new endpoint.

## Affected Surfaces

- New `GET /pos/reports/procurement-export` endpoint (`VIEW_POS` permission, same tier already
  gating `/pos/reports/export` and `/pos/incoming-orders`) -- read-only, no shift requirement (see
  the implementation plan's section 1 for why this deliberately does not reuse the shift-bound
  `buildListIncomingOnlineOrdersUseCase`).
- `buildExportProcurementCsvUseCase` (`apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`) --
  calls the existing `posRepository.listIncomingOnlineOrders()` unchanged, no new repository method,
  no new join, no new database read beyond what that method already performs for the incoming-order
  queue.
- POS Reports & Analytics workspace (`packages/web-core/src/features/pos/components/
  PosReportsAnalyticsWorkspace.jsx`) -- one new "Procurement CSV" button, reachable without an open
  shift (the `reports` view mode is already shift-exempt in `TerminalPage.jsx`), gated behind the
  same `VIEW_POS` permission as the rest of the reports workspace.

## Compliance Preconditions

- No new data model, no new persisted table, no new data captured -- the export reads
  `PosTransaction.customer_name` / `customer_phone` / `delivery_address` (already-existing
  snapshot fields on the transaction itself) plus the existing `lines`/`item`/`location`
  associations already joined by `buildTransactionInclude()`. No schema change.
  `apps/dgfy-migration-runner` is untouched.
  - Guest checkouts fall back to the literal string `"Guest Buyer"` (copying the exact convention
    already used by `IncomingQueueOrderList.jsx`), never a null/empty customer-name cell that could
    be misread as a data-loss bug.
- Repository call is capped at `limit: 500` (the repository's own hard ceiling, unchanged) --
  documented as a known limitation in the PR body rather than a silent truncation; not a compliance
  concern since it never expands the surface beyond what `/pos/incoming-orders` and
  `/pos/reports/export` already expose to the same permission tier.
- Permission model: `VIEW_POS` only, no new tier -- unchanged. **Superseded by the RF-1 fix below**:
  the paragraph originally here argued that no location-scope check was needed because
  `/pos/reports/*`'s own `location_id` filter already grants cross-location visibility to any
  non-cashier `VIEW_POS` holder. pr-reviewer's review of PR #1504 correctly rejected that reasoning
  as the actual vulnerability -- it let an unscoped or arbitrary `location_id` request through with
  no authorization check at all, which is not the same thing as an *authorized* cross-location grant.
  The usecase now resolves `query.location_id` through `resolvePosReadLocationScope` (the same
  helper `buildListOnlineOrderHistoryUseCase` uses) before ever touching the repository, so a
  `VIEW_POS` holder can only export orders for a location they hold a `UserLocationGrant` for (or
  their tenant's sole active location, matching every other POS read path's resolution rules) --
  see "Fix-step Amendment" below.
- No fiscal print event, payment field, checkout payload, or API contract changes. This is a
  read + CSV-serialize + buffered-download action only, structurally incapable of mutating any
  transaction, shift, or delivery state.

## Verification Evidence

- `buildExportProcurementCsvUseCase` unit tests (`tests/posReports.usecase.test.js`): rejects a
  non-object query, requires an authenticated user, rejects a non-numeric `location_id`, returns a
  header-only CSV with zero pending orders, resolves an unscoped request to the caller's own
  authorized location scope, resolves a requested `location_id` through the scope resolver before
  calling the repository, rejects a request for a location the caller is not authorized for
  (`AUTHORIZATION_FAILED`/403, repository never called), and flattens a multi-line-item /
  multi-order fixture into one CSV row per line item (including the `Guest Buyer` fallback for a
  null `customer_name`).
- `exportProcurementCsv` transport tests (`tests/posHandlers.transport.test.js`): buffered
  `Content-Type`/`Content-Disposition`/200-status response shape, and the standardized error
  payload on a usecase failure.
- `posReportsAnalyticsWorkspace.contract.test.js`: asserts the new button/handler are present and
  not gated on `reportData` (the export is independent of whatever report section/date range is
  currently loaded).
- `npm run build:pos` and `npm run build:skupervisor` both succeed -- both apps consume
  `packages/web-core`'s touched files (`posService.js`, `PosReportsAnalyticsWorkspace.jsx`) through
  their `file:` dependency.
- `node --check` passes on every changed `apps/dgfy-api` `.js` file (no real build step in that
  app).

## Residual Risks

- The 500-order repository cap (pre-existing, unchanged by this PR) means a pending-order count
  above 500 silently truncates to the oldest 500. Acceptable for the issue's stated
  "deliberately small" scope; pagination is explicitly out of scope per #1488's own Scope section.
- No dedicated procurement page/route or persisted worklist -- this is a one-button CSV dump, by
  design (#1488's Scope section).

## Fix-step Amendment (RF-1, PR #1504 review)

pr-reviewer's review of PR #1504 posted a `BLOCK` verdict: the export authenticated the caller but
never checked a POS read-location scope, so a `VIEW_POS` user could download pending-order PII
(customer name, phone, delivery address) across every location, or for an arbitrary location, with
no authorization check -- the exact class of gap this declaration's original "Considered and
rejected" paragraph (see Compliance Preconditions above) failed to catch, since it reasoned about
*authorized* cross-location visibility rather than the absence of any check at all.

Fixed by injecting `resolvePosReadLocationScope` (default-wired in `modules/pos/index.js`'s
composition root, exactly like `buildListOnlineOrderHistoryUseCase`): `query.location_id` is
resolved against the caller's `UserLocationGrant` rows before the repository call, and only
`locationScope.location_id` -- never the raw query value -- reaches
`posRepository.listIncomingOnlineOrders()`. This changes the classification's underlying risk
profile for the better, not worse: the export is now held to the *same* per-location authorization
bar as every other POS read path (`buildListOnlineOrderHistoryUseCase`,
`buildListIncomingOnlineOrdersUseCase`), rather than the unscoped bar the original implementation
shipped with. Classification stays `major` -- this is still the first endpoint exposing this PII
field set as a downloadable file -- but the specific gap RF-1 identified is closed.

## Preflight Reconciliation

`NOT-EXECUTED-1488` is expected for a `develop`-targeting PR; the live preflight sweep
(`compliance-preflight-sweep.yml`) runs continuously against `develop` per
`docs/compliance/request-time-preflight-protocol.md`, not at promotion time, and will reconcile this
declaration's front matter automatically once triggered by this PR's merge.
