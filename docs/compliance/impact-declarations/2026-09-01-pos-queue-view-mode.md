---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-queue-view-mode
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.01
verification_evidence: npm run build:pos -- real Vite build, OK,npm run build:skupervisor -- real Vite build, OK (apps/dgfy-ims lazily imports the same TerminalPage.jsx tree via packages/web-core),packages/web-core/src/features/pos/__tests__/incomingQueueViewMode.behavior.test.jsx -- new, actually executed (Vitest via apps/dgfy-ims), 8/8 passing,packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- re-run after this phase's changes, 12/12 passing (no regressions),packages/web-core/src/features/pos/__tests__/deliveryRunBulkAssign.behavior.test.jsx -- re-run, 12/12 passing (no regressions),packages/web-core/src/features/pos/__tests__/deliveryRunDispatch.behavior.test.jsx -- re-run, 11/11 passing (no regressions),packages/web-core/src/features/pos/__tests__/orderFulfillmentUi.test.js -- re-run, no regressions,packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js -- updated (source-content assertions now also read the extracted incomingQueueOrderActions.js file) and re-run, 61/61 passing,full packages/web-core/src/features/pos/__tests__/ suite -- actually executed (Vitest via apps/dgfy-ims), 134 files/789 tests passing, zero regressions,npm run check:architecture -- OK (51 modules/530 files, 92 controller files -- zero backend change in this phase, confirms the floor),npm run check:adr -- OK (84 ADRs),npm run lint:docs -- OK (29 governed docs),npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added
rollback_note: Purely additive, frontend-only, zero-backend change -- no new API route, no new database field, no schema/migration. Rollback is a plain code revert of this PR's commits: removing the view-mode toggle, QueueOrderTableView.jsx, and the two new utils files restores the Active Queue to card-view-only, exactly as it behaved before this phase. The two small, behavior-preserving extractions this phase makes from TerminalOperationsPanels.jsx (the per-order action-button construction into incomingQueueOrderActions.js, and the order-formatting helpers into incomingQueueOrderFormatting.js) are also revertible as a unit with the rest of this PR -- card view's own rendering is functionally unchanged by the extraction (see the re-run test evidence above), so reverting the whole PR cleanly restores the pre-phase state. The one-line posTerminalStorage.js addition (a new RECOVERABLE_PREFERENCE_PREFIXES entry) is likewise additive and reverts cleanly. The view-mode preference itself lives only in per-terminal localStorage (pos_queue_view_mode_v1) -- no data migration is needed on rollback, a stale stored value is simply never read again.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1288-QUEUE-VIEW-MODE
---

# POS Active Queue view-mode toggle: card and table (Phase 229, #1288)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed against `scripts/check-compliance-impact.js` against
this diff: every new/modified file in this phase sits under
`packages/web-core/src/features/pos/`, matching the dedicated `COMPLIANCE_SENSITIVE_RULES` rule
(`/^packages\/web-core\/src\/features\/pos\//`), same floor Phase 226/227/228 all used for the same
prefix.

Does not reach `regulatory`: nothing in this phase touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. No backend file is touched at all -- zero-backend by
design (see below) -- so no ADR governs this change: ADR 0034 (manual delivery job foundation)
governs the delivery-job data model and run lifecycle, not how the queue's own orders are
rendered; a view-mode toggle changes presentation only, reading the same order objects Phase
226/227 already consume. No file under `apps/dgfy-migration-runner/migrations/` is touched --
confirmed, no migration exists or is needed for this phase.

`reason_codes_impacted: NONE` is deliberate, not an oversight -- this phase introduces no new
backend validation path and therefore no new `DomainErrorCode`/reason-code taxonomy entry. The
frontmatter key is still populated (with the literal token `NONE`) rather than omitted, since
`scripts/check-compliance-impact.js` requires `reason_codes_impacted` to be non-empty for every
declaration regardless of classification.

## What this phase does

A two-option segmented control (Card / Table) in the Active Queue's existing control bar, to the
left of the Sort select. Card view (the existing per-order card grid, unchanged in its own
rendering) stays the default. Table view is a new, additive rendering of the same
`sortedIncomingOrders` array the card view already consumes -- no new endpoint, no new field, no
schema change. The chosen mode persists per-terminal via localStorage
(`pos_queue_view_mode_v1`), following the same pattern as this file's sibling preferences
(`pos_text_size`, `pos_terminal_last_view_v1`, `posTerminalSidebarCollapsed`).

Every card field is mapped to a table column or an explicit, presentation-only omission (full
mapping in `plan-1288-queue-view-mode.md`, "Table columns" section) -- nothing about order state,
eligibility, or write paths changes; every omitted control (the "Collected by" derived detail, the
interactive `DeliveryAssignmentControl`/`DeliveryAddressEditControl` widgets) stays one click away
via card view, which is never removed.

## Affected Surfaces

1. `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx` (**modified**) --
   new `viewMode` state (initialized from `readQueueViewModePreference()`, write-through on
   change), the segmented toggle control, and the render branch to `<QueueOrderTableView />` when
   `viewMode === 'table'`. The ~150-line per-order button-eligibility construction that used to live
   inline in the card `.map()` is extracted (behavior-preserving, confirmed by the re-run test
   evidence) into `utils/incomingQueueOrderActions.js`; the small order-formatting helpers
   (`formatOrderDateTime`, `formatOrderAmount`, `resolveOrderDownpaymentSplit`,
   `resolveBalanceCollectionLabel`, `parseDeliveryCoords`, `humanizeOrderStatus`) are similarly
   extracted into `utils/incomingQueueOrderFormatting.js` -- both extractions exist so card view and
   the new table view call one shared code path rather than maintaining two copies of the same
   eligibility/formatting logic, and so that `QueueOrderTableView.jsx` does not need to import
   from `TerminalOperationsPanels.jsx` (which itself imports `QueueOrderTableView.jsx` to render
   it -- a circular import this split avoids).
2. `packages/web-core/src/features/pos/components/QueueOrderTableView.jsx` (**new**) -- the
   `<table>` renderer. Reuses `QueueOrderSelectCheckbox` (unchanged) and
   `buildIncomingQueueOrderActions` (the extraction above) so selection and the action-button set
   are byte-identical between the two view modes by construction. Receives the same props
   `IncomingQueueWorkspace` already threads to the card `.map()` -- no new prop surface.
3. `packages/web-core/src/features/pos/utils/incomingQueueOrderActions.js` (**new**) -- pure
   `buildIncomingQueueOrderActions(order, deps)`, aside from the handler closures passed via `deps`.
   Written with `React.createElement` rather than JSX syntax, deliberately: this repo's Vite/esbuild
   configuration does not enable the JSX loader for plain `.js` files (only `.jsx`/`.tsx`), and this
   utility intentionally is not itself a component.
4. `packages/web-core/src/features/pos/utils/incomingQueueOrderFormatting.js` (**new**) -- the
   small pure formatting/derivation helpers named above, moved verbatim (no logic change) out of
   `TerminalOperationsPanels.jsx`.
5. `packages/web-core/src/features/pos/utils/queueViewModePreference.js` (**new**) --
   `normalizeQueueViewMode`, `readQueueViewModePreference`, `writeQueueViewModePreference`; storage
   key `pos_queue_view_mode_v1`, values `'card' | 'table'`, default `'card'`. Reads/writes go
   through `safeLocalStorageGet`/`safeLocalStorageSet` (`posTerminalStorage.js`) for the existing
   quota-exceeded recovery behavior, rather than raw `window.localStorage`.
6. `packages/web-core/src/features/pos/utils/posTerminalStorage.js` (**modified**, one line) --
   `'pos_queue_view_mode_v1'` added to `RECOVERABLE_PREFERENCE_PREFIXES` so a quota-cleanup pass can
   safely evict this preference like the other recoverable UI prefs already listed there.
7. `packages/web-core/src/features/pos/__tests__/incomingQueueViewMode.behavior.test.jsx`
   (**new**) -- see Verification Evidence.
8. `packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js`
   (**modified**) -- this file's own source-content assertions read
   `TerminalOperationsPanels.jsx`'s raw text for specific strings (e.g. `'Print Receipt'`,
   `"utilityActions.includes('print_receipt')"`). Since those strings moved into
   `incomingQueueOrderActions.js` by this phase's extraction, the test now concatenates both files
   into `terminalOperationsPanelsContent` before asserting -- the same multi-file-join pattern this
   test already uses for `terminalPageContent`. No assertion's intent changed, only which file(s)
   its source string is read from.

## Compliance Preconditions

1. **Zero-backend, confirmed mechanically.** `git diff --name-only` against this phase's changes
   contains no file under `apps/dgfy-api/` or `apps/dgfy-migration-runner/` -- every touched file is
   frontend-only, under `packages/web-core/src/features/pos/`.
2. **No new data surface.** Table view reads the exact same `incomingOrdersState.orders` array the
   card view already reads and displays; no field is fetched, computed, or exposed that card view
   does not already show (with the two named, presentation-only omissions documented above and in
   the plan).
3. **No write-path change.** The action buttons in table view are the exact same elements
   (`buildIncomingQueueOrderActions`) card view renders -- same eligibility predicates, same
   handlers, same disabled-state gating (`canTransactPos`/`locked`/`isOnline`/`hasActiveShift`).
   Nothing about which mutations an operator can trigger, or under what conditions, changes.
4. **Card view stays the default**, enforced both as the persistence default
   (`DEFAULT_QUEUE_VIEW_MODE = 'card'`) and the fallback path (`normalizeQueueViewMode` returns the
   default for any unset/unrecognized stored value) -- confirmed by the "defaults to card when
   unset/invalid" test case.
5. **Selection state (`selectedOrderIds`) and the Phase 227 bulk-assign flow are unaffected by which
   branch renders.** Both live in `IncomingQueueWorkspace`, untouched by this phase; only the render
   branch changes. Confirmed by the "Selection survives a toggle" test case, which flips view mode
   mid-selection and completes a real `QueueRunAssignBar` submit afterward.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- `npm run build:pos`, `npm run build:skupervisor` -- both required (a `packages/web-core`
  change); both real Vite builds, both OK.
- New `incomingQueueViewMode.behavior.test.jsx` (8 cases: default-to-card, toggle switches render
  branch and back, persistence across remount, default-on-invalid-stored-value, selection survives
  a toggle plus a real bulk-assign submit with table view active, every mapped column renders for a
  fixture order including the downpayment-split Balance column and the delivery Address/Delivery
  columns, the two omitted interactive widgets are absent without throwing, and a non-delivery order
  renders without a crash) -- all passing.
- `deliveryRunsWorkspace.behavior.test.jsx`, `deliveryRunBulkAssign.behavior.test.jsx`,
  `deliveryRunDispatch.behavior.test.jsx`, `orderFulfillmentUi.test.js` -- re-run, no regressions.
- `terminalViewModeContracts.test.js` -- updated (see Affected Surfaces #8) and re-run, all
  passing.
- Full `packages/web-core/src/features/pos/__tests__/` suite -- actually executed (Vitest via
  `apps/dgfy-ims`), 134 files / 789 tests, all passing, zero regressions from this phase's two
  behavior-preserving extractions.
- `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs` -- all OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Not runnable here, stated rather than omitted:** a live acceptance walk (toggle view modes
  against a deployed tenant, confirm the table renders live order data and every action button
  works identically to card view) against a deployed tenant database. Every prior phase in this
  build sequence (224-228) carries the same limitation -- no deployed tenant database reachable in
  this environment.

## Residual Risks

1. **No live acceptance walk was run in this environment.** The Vitest suite exercises the
   component tree against fixture order objects and mocked services, not a real backend or
   database. Flagged for the PR reviewer / a follow-up QA pass, same posture as every prior phase
   in this repo's recent history.
2. **Table view's Actions column can make a row visually tall** when an order has many available
   action buttons (a stacked list rather than card view's 2-column grid). This is a stated,
   accepted tradeoff (see the plan's "Table columns" mapping) -- no functionality is dropped, only
   the layout differs from card view.
3. **The two interactive delivery widgets (assign/reassign, address edit) are not reachable from
   table view.** An operator must switch to card view to use them. This is by design (documented in
   the plan and in this file's Affected Surfaces #2), not an oversight, but is worth naming
   explicitly as a residual UX friction point for a future phase to reconsider if it proves
   material in practice.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
