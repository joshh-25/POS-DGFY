---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-active-queue-delivery-run-filter
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.09.01
verification_evidence: npm run build:pos -- real Vite build, OK,npm run build:skupervisor -- real Vite build, OK (apps/dgfy-ims lazily imports the same TerminalPage.jsx tree via packages/web-core),packages/web-core/src/features/pos/utils/__tests__/deliveryRunQueueFilter.test.js -- actually executed (Vitest via apps/dgfy-ims), 13/13 passing,packages/web-core/src/features/pos/__tests__/deliveryRunQueueFilter.behavior.test.jsx -- actually executed (Vitest via apps/dgfy-ims), 14/14 passing,packages/web-core/src/features/pos/__tests__/deliveryRunBulkAssign.behavior.test.jsx -- re-run after this phase's changes, 12/12 passing,packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- re-run after this phase's changes, 12/12 passing,packages/web-core/src/features/pos/utils/__tests__/deliveryRunEligibility.test.js -- re-run unchanged, 17/17 passing,packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js -- one source-text assertion updated to match the new visibleIncomingOrders map target, re-run, passing,full apps/dgfy-ims Vitest suite -- 1976/1977 passing (1 unrelated pre-existing timeout flake in Settings.deepLinking.integration.test.jsx, confirmed passing in isolation, no reference to any file this phase touches),npm run check:architecture -- OK,npm run check:adr -- OK,npm run lint:docs -- OK,npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added
rollback_note: Frontend-only, zero apps/dgfy-api diff. New files under packages/web-core/src/features/pos/ (utils/deliveryRunQueueFilter.js, hooks/useDeliveryRunOptions.js, components/QueueRunFilterControl.jsx) plus modifications to TerminalOperationsPanels.jsx and QueueRunAssignBar.jsx. Rollback is a plain code revert: removing the new files and reverting the two modified files restores the pre-Phase-230 Active Queue exactly, including QueueRunAssignBar's own independent fetchDeliveryRuns call (the hook it now uses is a strict lift of that same call, not a behavior change to the underlying API usage). No schema, route, or permission change exists to roll back.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1290-POS-ACTIVE-QUEUE-DELIVERY-RUN-FILTER
---

# Active Queue delivery-run filter (Phase 230, #1290)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff: every new and modified file sits under `packages/web-core/src/features/pos/**`,
matching `COMPLIANCE_SENSITIVE_RULES`'s dedicated rule (`/^packages\/web-core\/src\/features\/pos\//`)
-> `surfaces: pos,terminal`, floor `major`.

Does **not** reach `regulatory`: nothing in this phase touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. No file under `apps/dgfy-migration-runner/migrations/` is
touched -- the migration checkpoint does not apply. **Zero `apps/dgfy-api/` diff** -- this phase
adds no route, validator, use case, or repository change; `deliveryJob.delivery_run_id` was already
selected by Phase 227's `posRepository.js` change.

`related_adr`: ADR 0034 (`manual-delivery-job-foundation.md`), `status: amended`. This phase does
**not** amend it -- it adds a read-only client-side view filter over data the API already returns;
no membership rule, no dispatch semantics, no route, no permission, no persistence changes. ADR
0039's Planning Rule 4 (cross-boundary changes) does not fire -- no ADR clause is being changed.

## Source-verified findings that shaped this phase

Re-confirmed against `origin/develop` at `d912c608992df07e9c6c10be4b847182b24bcc2c` before
implementation (see the plan file for the full write-up):

- **F-1 -- the Active Queue has no pagination and no server-side filtering.**
  `refreshIncomingOrders` fetches exactly `shift_id`/`location_id`/`terminal_id`, storing the whole
  order list in browser state -- a client-side filter cannot hide orders a later page would have
  contained, because there is no later page.
- **F-2 -- `deliveryJob.delivery_run_id` is already on every queue order**, added by Phase 227. No
  backend change is needed to know which run an order belongs to.
- **F-3 -- the run *label* is not on the order**, only the id. Mapped from the same
  `GET /pos/delivery-runs` list the frontend already loads (Phase 227's own declared pattern).
- **F-4 -- `getEligibleRunTargets` is the wrong list for a view filter.** It excludes
  dispatched/completed/cancelled runs because it answers "which run can I add MORE orders to." A
  dispatched run's members are still sitting in the Active Queue as `out_for_delivery` orders --
  exactly what an operator most wants to filter to. `utils/deliveryRunQueueFilter.js`'s
  `getQueueRunFilterOptions` is a deliberately separate, broader function; a code comment states
  this so a future reader does not "unify" the two.
- **F-5 -- two components already independently fetch `GET /pos/delivery-runs`** on this screen
  (`DeliveryRunsWorkspacePanel.jsx`, `QueueRunAssignBar.jsx`). A third independent fetch for the
  filter would let the filter dropdown and the assign picker momentarily disagree about which runs
  exist -- so `QueueRunAssignBar`'s fetch was lifted into a new shared hook
  (`hooks/useDeliveryRunOptions.js`) both the filter and the assign picker now consume.

## Affected Surfaces

1. `packages/web-core/src/features/pos/utils/deliveryRunQueueFilter.js` (**new**) -- two pure
   functions: `getQueueRunFilterOptions(runs, { locationId })` (excludes
   completed/cancelled, keeps draft/scheduled/dispatched, requires a location match, sorted by
   scheduled_date then label) and `filterOrdersByRun(orders, runFilter)` (`'all'` passes
   everything, `'unassigned'` keeps orders with no `delivery_run_id`, any other value filters to
   that run id, with Number coercion on both sides since the `<select>` value is always a string).
2. `packages/web-core/src/features/pos/hooks/useDeliveryRunOptions.js` (**new**) -- the shared
   `GET /pos/delivery-runs` fetch, carrying the same RF-3 request-generation staleness guard
   `DeliveryRunsWorkspacePanel.jsx` and the pre-lift `QueueRunAssignBar.jsx` both already used.
   Takes an `enabled` flag so the fetch itself is gated on retail mode (D-3) rather than only the
   UI that displays it -- an F&B tenant issues zero calls to this endpoint.
3. `packages/web-core/src/features/pos/components/QueueRunFilterControl.jsx` (**new**) --
   presentational `<select>` (All orders / Unassigned / one option per visible run) plus a
   "Showing N of M" readout and a "Clear filter" affordance. Value and handler come from the
   parent.
4. `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx` (**modified**,
   `IncomingQueueWorkspace`) -- the real work:
   - New `runFilter` state (default `'all'`), placed in the existing header controls row next to
     `Sort` -- a *view* control, not a mutation control, so it stays usable when `canTransactPos`
     is false or the assign bar is otherwise disabled.
   - `visibleIncomingOrders = filterOrdersByRun(sortedIncomingOrders, runFilter)` -- the grid now
     maps over this, not `sortedIncomingOrders` directly.
   - **`selectedEligibleOrders` and `selectedDriftCount` are re-derived against
     `visibleIncomingOrders`, not the full list** -- the correctness crux named in the plan. Without
     this, an order selected before the filter was applied would still be eligible-and-submitted by
     `handleBulkAssignSubmit` while invisible on screen.
   - New `selectedHiddenCount` -- ids selected in the full list but not present in the filtered
     view -- passed to `QueueRunAssignBar` as `hiddenCount` and surfaced as a hint that those
     selections will not be added.
   - The selection `Set` itself is **not** pruned on a filter change, matching the existing
     "not pruned on poll tick" behavior -- clearing the filter restores the selection rather than
     having silently destroyed it.
   - Three reset triggers for `runFilter`: the existing mode-flip-off-retail effect (extended), a
     location-scope change, and the selected run dropping out of the option list (mirrors
     `QueueRunAssignBar`'s own `targetRunId` reset effect).
   - A distinct filtered-empty state ("No orders in this run are in the active queue." + a "Show
     all orders" button) -- never the existing illustrated "no online orders" branch, which would
     misleadingly read as a data outage.
   - The tab badge (`activeCount`) stays `incomingOrders.length`, unfiltered, deliberately.
   - A per-card `Run: <label>` chip (falls back to `Run #<id>` for a run outside the already-loaded
     list's scope), rendered next to the existing fulfillment-status badge, retail-mode only.
5. `packages/web-core/src/features/pos/components/QueueRunAssignBar.jsx` (**modified**) -- its
   internal `fetchDeliveryRuns`/`runsState`/`runsRequestIdRef` block is deleted; `runs`/
   `runsLoading`/`runsError` now arrive as props from the shared hook. `getEligibleRunTargets`
   usage, the picker, and the idempotency contract are untouched. New `hiddenCount` prop renders
   one additional hint line ("N selected order(s) are hidden by the run filter and will not be
   added"). Net fetches of `GET /pos/delivery-runs` on this screen: 2 -> 2 (not 3) -- the filter and
   the assign picker can no longer disagree about which runs exist.
6. Tests -- `utils/__tests__/deliveryRunQueueFilter.test.js` (new, pure unit),
   `__tests__/deliveryRunQueueFilter.behavior.test.jsx` (new, behavior),
   `__tests__/terminalViewModeContracts.test.js` (one source-text assertion updated to match the
   new `visibleIncomingOrders` map target -- not functionally weakened, still asserts the sort +
   empty-guidance contract).

## Compliance Preconditions

1. **No new backend surface, no new permission path.** This phase consumes the same
   already-`checkPermission`-gated `GET /pos/delivery-runs` route (unchanged) and the same
   already-present `deliveryJob.delivery_run_id` field (Phase 227). No new route, validator, use
   case, or repository change exists.
2. **A filter-hidden selection can never be silently submitted.** `selectedEligibleOrders` is
   derived from the filtered list, and `QueueRunAssignBar` itself receives only
   `visibleIncomingOrders` as its `orders` prop -- so `Select all eligible` and the final submit
   both operate strictly within what's currently visible. A pre-existing selection that becomes
   hidden by a filter change is neither auto-submitted nor auto-dropped -- it is surfaced via the
   new `hiddenCount` hint and restored the moment the filter is cleared.
3. **Retail gating is enforced identically to Phase 226/227's existing gate** -- the filter control,
   its underlying fetch (via the hook's `enabled` flag), and the run chip are all gated on
   `normalizeWorkflowMode(workflowMode) === 'retail'`, and `runFilter` is cleared by the same
   mode-flip reset effect that already clears the bulk-add selection.
4. **The view filter is deliberately not built on `getEligibleRunTargets`** (F-4) -- reusing it
   would silently exclude dispatched runs, whose members are exactly the `out_for_delivery` orders
   an operator most wants to filter the queue to. A code comment in
   `deliveryRunQueueFilter.js` states this explicitly.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- `npm run build:pos`, `npm run build:skupervisor` -- both real Vite builds, both OK (a
  `packages/web-core` change; `apps/dgfy-ims` lazily imports the same `TerminalPage.jsx` tree).
- New unit tests (13/13) and new behavior tests (14/14) -- actually executed (Vitest via
  `apps/dgfy-ims`).
- Every pre-existing delivery-run test file (bulk-assign, workspace, eligibility) re-run,
  no regressions: 12/12, 12/12, 17/17.
- `terminalViewModeContracts.test.js`'s source-text assertion updated to match the new map target,
  re-run, passing.
- Full `apps/dgfy-ims` Vitest suite: 1976/1977 passing. The one failure
  (`Settings.deepLinking.integration.test.jsx`, a 10s timeout under full-suite resource contention)
  is unrelated to this change -- it touches no file this phase modifies and passes 29/29 when run
  in isolation.
- `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs` -- all OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Not runnable here, stated rather than omitted:** a live acceptance walk (create/dispatch a run,
  filter the queue to it, confirm counts and chips, confirm a hidden selection is not submitted)
  against a deployed tenant. Same posture and same stated limitation as Phases 224-228.

## Residual Risks

1. **Client-side filtering assumes the Active Queue stays unpaginated (F-1).** If the Active Queue
   ever gains server-side pagination (plausible via #1288/#1289), this filter becomes wrong -- it
   would filter one page rather than the whole run. Migration path, stated rather than deferred
   silently: add a `delivery_run_id` param to the incoming-orders query and switch this control to
   drive it server-side.
2. **Order History gets no run filter this phase**, deliberately -- `refreshOrderHistory` is
   genuinely server-side paginated, so a client-side filter there would filter one page and
   silently lie. Named as deferred; a follow-up would need a real API param with its own backend
   compliance surface.
3. **No live acceptance walk was run in this environment.** The Vitest suite exercises the UI logic
   against mocks, not a real backend or database. Flagged for the PR reviewer / a follow-up QA
   pass, same posture as every prior phase in this track.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
