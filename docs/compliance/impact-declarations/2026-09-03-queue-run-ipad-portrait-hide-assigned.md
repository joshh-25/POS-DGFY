---
status: reference
owner: engineering
last_reviewed: 2026-09-03
declaration_id: 2026-09-03-queue-run-ipad-portrait-hide-assigned
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.03
verification_evidence: npx vitest run (from apps/dgfy-ims) ../../packages/web-core/src/features/pos/__tests__/deliveryRunSplitViewDnd.behavior.test.jsx ../../packages/web-core/src/features/pos/__tests__/incomingQueueRunMemberFulfillmentGate.behavior.test.jsx ../../packages/web-core/src/features/pos/utils/__tests__/deriveQueueSelectionCounts.test.js ../../packages/web-core/src/features/pos/utils/__tests__/deliveryRunQueueFilter.test.js ../../packages/web-core/src/features/pos/utils/__tests__/posTabletViewport.test.js (49 passed),npx vitest run ../../packages/web-core/src/features/pos (189 files / 1163 passed),npm run build:skupervisor (succeeded),npm run build:pos (succeeded),npm run check:compliance
rollback_note: Revert this PR's diff. TerminalOperationsPanels.jsx's changes are (a) SPLIT_VIEW_MIN_WIDTH_PX now imports POS_TABLET_MIN_WIDTH_PX (768) instead of the literal 1024 -- a pure constant/import swap, no new state or behavior beyond the widened eligibility window; (b) a new splitQueueCandidates derivation (filterOrdersByRun against QUEUE_RUN_FILTER_UNASSIGNED) that the split ("Queue + Run") branch alone reads for its rendered list, drag source/target lookups, and QueueRunAssignBar counts -- the standalone Active Queue tab's own visibleIncomingOrders/runFilter path is untouched. deriveQueueSelectionCounts.js is a new, pure, side-effect-free util extracted verbatim from the pre-existing inline selection-math block, called twice (once per candidate list) with no change to either call's own math. No API, database, or hardware-dispatch code changes at all -- reverting the touched files fully restores prior behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-03T08:25:46.102Z
preflight_request_ref: PREFLIGHT-33731997295-2026-09-03-QUEUE-RUN-IPAD-PORTRAIT-HIDE-ASSIGNED
---

# Queue+Run iPad portrait split-view fix + hide-assigned-orders in split view only (#1491)

## Compliance Impact Classification

Major. Every file this change touches lives under `packages/web-core/src/features/pos/`, which
`scripts/check-compliance-impact.js`'s own sensitive-file rules map to surfaces `pos,terminal` at
minimum classification `major` -- this declaration exists to satisfy that gate, not because the
change itself introduces a new compliance-relevant capability. There is no ADR impact: this is
`within-existing-boundary` frontend UI work (a Tailwind/media-query breakpoint correction plus a
client-side list-filtering derivation), not a new cross-boundary decision.

## Affected Surfaces

- **Split ("Queue + Run") view viewport gate** (`TerminalOperationsPanels.jsx`'s
  `SPLIT_VIEW_MIN_WIDTH_PX`) -- lowered from 1024px to 768px, sourced from the existing
  `POS_TABLET_MIN_WIDTH_PX` constant (`posTabletViewport.js`) rather than a second literal. This
  view was already reachable on every iPad in *landscape* (all >=1024px); the fix widens
  eligibility to portrait iPad mini/standard/Air/11"-Pro (~768-834px), which were excluded purely
  because the gate reused a wider threshold than the view's own two-panel grid actually needs (the
  grid's `xl:` breakpoint, Tailwind's default 1280px, is untouched -- below it the view already
  renders as the same single-column stacked layout it always has, just now reachable at a narrower
  width). No new layout was built; an existing, already-shipped stacked layout is now reachable at
  a width it was previously gated out of.
- **Split view's own candidate list** (new `splitQueueCandidates` derivation) -- the split view's
  queue panel, `QueueRunAssignBar`'s counts, and its drag-to-assign source/target resolution now
  read from an always-unassigned-only list (`filterOrdersByRun(sortedIncomingOrders,
  QUEUE_RUN_FILTER_UNASSIGNED)`), independent of the standalone Active Queue tab's own `runFilter`
  state. Zero backend change: `deliveryJob.delivery_run_id` was already present on every queue
  order (`posRepository.js`'s `buildTransactionInclude()`, Phase 227) and
  `QUEUE_RUN_FILTER_UNASSIGNED`/`filterOrdersByRun` already implemented exactly this predicate,
  fully unit-tested before this change.
- **Deliberately NOT changed**: the standalone Active Queue tab's `runFilter` default or its
  `visibleIncomingOrders` derivation. An order stays "assigned" to its run for its entire remaining
  lifecycle (assigned -> picked_up -> delivered), and the standalone tab is the only screen with
  the per-order cash-collection/balance-settlement/delivery-status-change/personnel-assignment
  actions an operator still needs for an assigned order (`DeliveryRunDropPanel.jsx` and
  `DeliveryRunsWorkspacePanel.jsx` both expose none of these). Flipping the shared filter's default
  would have hidden those orders, by default, from the one screen with the buttons to act on them --
  a real workflow regression, not a hypothetical one. The hide-behavior is scoped to the split
  view's own new candidate list instead, at one call site.
- `deriveQueueSelectionCounts.js` (new util) -- a pure extraction of the pre-existing selection
  math (Phase 231/#1290's own correctness crux: eligible/drift/hidden counts re-derived against
  whichever list is actually visible, never the raw unfiltered list), parameterized so both the
  standalone tab's existing call and the split view's new call share one implementation rather than
  two copies that could drift apart.

## Compliance Preconditions

- No API, database, payment, fiscal-receipting, or hardware-dispatch code changes. Every touched
  file is a frontend component or a pure, side-effect-free client-side utility under
  `packages/web-core/src/features/pos/`.
- No new or changed reason codes, checkout flow, or settlement path. `addDeliveryRunMembers`
  (the write path both the checkbox and drag-to-assign flows call) is unchanged -- this PR only
  changes which orders are *offered* as candidates and at which viewport widths the split view
  itself is reachable, never what happens once a bulk-add is submitted.
- The split view's own "already in a run" exclusion (`splitQueueCandidates`) and
  `getRunAssignEligibility`'s pre-existing `ALREADY_IN_RUN` check remain in full agreement: an order
  filtered out of the candidate list was already going to be rejected as ineligible by the existing
  eligibility check if somehow still selected, so this change cannot let an already-assigned order
  reach the server as part of a bulk-add that wasn't already impossible before this PR.

## Verification Evidence

- `deliveryRunSplitViewDnd.behavior.test.jsx` -- updated the stale ">=1280px"/"1024px" description
  strings to the corrected 768px threshold; added a regression guard asserting the actual
  `matchMedia` query string built is exactly `(min-width: 768px)` (not the old 1024/1280 values);
  added a mid-session `matchMedia` flip-to-non-matching case confirming the existing reset effect
  still force-navigates out of the split view at the new threshold; added a new "Hide
  already-assigned orders in the split view only (#1491 Part 2)" describe block covering (a) an
  already-assigned order is absent from the split view's rendered list, its checkbox, and
  `QueueRunAssignBar`'s counts, with the informational hint naming the hidden count, and (b) the
  same fixture leaves the standalone Active Queue tab's own list (including that order's checkbox,
  rendered ineligible rather than absent) unaffected -- the explicit regression guard for the Part
  2 scoping decision.
- `incomingQueueRunMemberFulfillmentGate.behavior.test.jsx` -- one pre-existing split-view test
  ("disables Out for Delivery ... in the split view", for an order already assigned to a
  *dispatched* run) was superseded by this change's own design and rewritten: that order no longer
  renders in the split view at all (rather than rendering disabled-with-tooltip), so the test now
  asserts the new hidden-entirely behavior. The equivalent standalone-tab test above it is
  unchanged, confirming the disabled-with-tooltip gate still applies there.
- `deriveQueueSelectionCounts.test.js` (new) -- unit coverage for the extracted pure function:
  eligible/visible/drift/hidden counts for a candidate-list order, an ineligible-but-visible order
  (drift, not hidden), a selected-but-absent-from-candidates order (hidden, not drift), and the
  same `allOrders`/selection producing different results against two different candidate lists (the
  whole point of parameterizing by candidate list).
- `deliveryRunQueueFilter.test.js`, `posTabletViewport.test.js` -- confirmed unchanged/still
  passing; used as negative-control references (neither `filterOrdersByRun`/
  `QUEUE_RUN_FILTER_UNASSIGNED` nor `POS_TABLET_MIN_WIDTH_PX` themselves needed any change).
- Full `packages/web-core/src/features/pos/__tests__/` + `utils/__tests__/` suite run from
  `apps/dgfy-ims`: 189 files / 1163 tests, all passed.
- `npm run build:skupervisor` and `npm run build:pos` both succeed -- both consume
  `packages/web-core`'s touched files through their `file:` dependency (confirmed the only two
  apps that import `features/pos`; `apps/dgfy-storefront` does not).
- Manual portrait-iPad (or portrait-emulated responsive-mode) check recommended before merge per
  the plan's own testing section -- a `matchMedia`-mocked RTL test proves the gate logic, not
  actual Safari touch/scroll feel; noted here rather than silently assumed covered by the automated
  suite alone.

## Residual Risks

- The drag-handle touch target (28x28px, `IncomingQueueOrderList.jsx`'s grip) remains below
  Apple's 44pt HIG minimum. Deliberately not fixed in this PR -- primary interaction on touch stays
  button-based (`QueueRunAssignBar`, unconditionally visible above the grid at every eligible
  width), drag is a secondary/opportunistic path. Filed as a separate fast-follow issue via `pm`
  rather than bundled into this change.
- The queue list's `max-h-[70vh]` portrait polish (a narrower cap below the `xl:` breakpoint so
  both split-view panels have a better chance of being visible together without scrolling) is
  explicitly skipped for this PR, per the plan's own "worth a quick pass but not required" framing
  -- cosmetic, not functional, and no design opinion was sought.

## Preflight Reconciliation

`NOT-EXECUTED-1491` is expected for a `develop`-targeting PR; the live preflight sweep
(`compliance-preflight-sweep.yml`) runs continuously against `develop` per
`docs/compliance/request-time-preflight-protocol.md`, not at promotion time, and will reconcile this
declaration's front matter automatically once triggered by this PR's merge.
