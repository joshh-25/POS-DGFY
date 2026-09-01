---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-delivery-run-split-view-dnd
classification: major
surfaces: pos,terminal
reason_codes_impacted: DELIVERY_ORDER_REQUIRED,DELIVERY_JOB_REQUIRED,MANUAL_DELIVERY_JOB_REQUIRED,DELIVERY_JOB_ASSIGNMENT_LOCKED,DELIVERY_JOB_ALREADY_IN_RUN,DELIVERY_RUN_LOCATION_MISMATCH,DELIVERY_RUN_ACCOUNTABLE_REQUIRED,DELIVERY_RUN_LOCKED,DELIVERY_RUN_NOT_FOUND
policy_version: 2026.09.01
verification_evidence: npm run build:pos -- real Vite build, OK,npm run build:skupervisor -- real Vite build, OK (apps/dgfy-ims lazily imports the same TerminalPage.jsx tree via packages/web-core),packages/web-core/src/features/pos/utils/__tests__/queueRunDropAssignment.test.js -- actually executed (Vitest via apps/dgfy-ims), 9/9 passing,packages/web-core/src/features/pos/__tests__/deliveryRunSplitViewDnd.behavior.test.jsx -- actually executed (Vitest via apps/dgfy-ims), 8/8 passing,packages/web-core/src/features/pos/__tests__/deliveryRunBulkAssign.behavior.test.jsx -- re-run after this phase's extraction and signature change, all passing (regression guard),packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- re-run, all passing (regression guard),packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js -- updated for the extraction (assertions targeting moved content now read IncomingQueueOrderList.jsx) and re-run, all passing,full apps/dgfy-ims Vitest suite -- re-run in full, 314 files / 1966 tests passing, no regressions,npm run check:architecture -- OK,npm run check:adr -- OK,npm run lint:docs -- OK,npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added,PR #1305 review fix (RF-1/RF-2) -- npm run build:pos OK, npm run build:skupervisor OK, deliveryRunSplitViewDnd.behavior.test.jsx + queueRunDropAssignment.test.js re-run 17/17 passing, full apps/dgfy-ims Vitest suite re-run 314 files / 1966 tests passing
rollback_note: Pure frontend addition plus one pure-move extraction, zero apps/dgfy-api changes, zero migrations. Removing the 4th "Queue + Run" tab, DeliveryRunDropPanel.jsx, queueRunDropAssignment.js, and reverting the handleBulkAssignSubmit optional-ids parameter back to single-arg restores Phase 227's checkbox-only bulk-add flow exactly. The IncomingQueueOrderList.jsx extraction is independently revertible (inline the JSX back into TerminalOperationsPanels.jsx) without touching the split-view feature at all, since it changes only where the card-grid JSX lives, not its behavior -- the two pre-existing Phase 227 behavior tests (deliveryRunBulkAssign.behavior.test.jsx, deliveryRunsWorkspace.behavior.test.jsx) pass unmodified against it. DeliveryRunMembersList.jsx's new `readOnly` prop defaults to false, so DeliveryRunsWorkspacePanel.jsx's existing call site is unaffected either way.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T02:48:17.000Z
preflight_request_ref: NOT-EXECUTED-NO-LIVE-ENVIRONMENT
---

# POS Active Queue + Delivery Run split view with drag-and-drop assignment (Phase 229, #1289)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed against `scripts/check-compliance-impact.js` against
this diff: every new/modified frontend file in this phase sits under
`packages/web-core/src/features/pos/`, matching the dedicated `COMPLIANCE_SENSITIVE_RULES` rule
(`/^packages\/web-core\/src\/features\/pos\//`) -> `surfaces: pos,terminal`, floor `major`. This is
exactly the precedent set by
`docs/compliance/impact-declarations/2026-09-01-pos-delivery-run-bulk-assign.md` (Phase 227) and
`2026-09-01-pos-delivery-run-dispatch.md` (Phase 228).

Does **not** reach `regulatory`: nothing in this phase touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. **Zero `apps/dgfy-api` files touched at all** -- this is a
frontend-only phase (plan §2.2, "no-architecture-impact" change class); the drop calls the
already-existing `addDeliveryRunMembers` -> `buildAddDeliveryRunMembersUseCase` write path Phase
227 already exercises, unchanged. No file under `apps/dgfy-migration-runner/migrations/` is
touched, so the migration checkpoint does not apply.

`related_adr`: ADR 0034 (`manual-delivery-job-foundation.md`), `status: amended`. **Cited, not
amended** -- no new write path exists (plan §2.2): membership stays keyed on `delivery_jobs`
exactly as ADR 0034's 2026-08-31 amendment states, and the split view's drop is a UI-only entry
point onto the same use case Phase 227's checkbox flow already calls.

## Source-verified plan decisions that shaped this phase

Full investigation and the two-tab-alternative rejection reasoning: see the plan document (§0-§1,
not reproduced here). Summary of what actually shaped the diff:

- **§2.3 -- no new dependency.** `@dnd-kit/core` ^6.3.1 + `@dnd-kit/utilities` ^3.2.2 were already
  dependencies of all three frontend apps; `ItemsPage.jsx`'s existing drag-to-folder interaction
  (`PointerSensor` + `TouchSensor`, `DragOverlay`, multi-drag driven by an existing checkbox
  selection) is the copied precedent, confirmed live at `ItemCard.jsx`'s `useDraggable` /
  `FolderCard.jsx`'s `useDroppable`.
- **§2.4/§2.6 -- a 4th tab, not a tab replacement**, gated on `normalizeWorkflowMode(...) ===
  'retail'` (Phase 226's own precedent) AND a `matchMedia('(min-width: 1280px)')` listener --
  narrow viewports and F&B mode keep the unmodified 3-tab arrangement.
- **§2.5 -- `DeliveryRunDropPanel.jsx` is not `DeliveryRunsWorkspacePanel.jsx`** reused at half
  width (that component is a 598-line master/detail, unusable at half width on a 1280px terminal).
  It's a narrow, purpose-built panel: the same `getEligibleRunTargets` filter
  `QueueRunAssignBar.jsx` already uses (so an ineligible run is never a drop target by
  construction), the picked run's header, and `DeliveryRunMembersList.jsx` reused **read-only**
  (new `readOnly` prop, defaults `false`, existing caller unaffected).
- **§2.7 -- the order-card grid extracted as `IncomingQueueOrderList.jsx`**, a pure move (verified
  by the two pre-existing Phase 227 behavior tests passing unmodified against it) so both the
  Active Queue tab and the split view render one component, and so #1288/#1290 (neither landed;
  no PR open for either, re-checked at commit time) each only have to change one place.
- **§2.8 -- coexist, not replace.** The checkbox + `QueueRunAssignBar` flow is unchanged and stays
  the accessible/touch-reliable path; drag is purely additive. Drag-eligibility uses the exact
  same predicate the checkbox already disables on
  (`!canTransactPos || locked || !isOnline || !hasActiveShift || bulkAssignSubmitting`) plus
  `getRunAssignEligibility`, so drag and checkbox can never disagree about which cards are
  actionable.
- **§2.9 -- one signature change to the existing write path.**
  `handleBulkAssignSubmit(targetRunId, explicitOrderIds = null)` -- when `explicitOrderIds` is
  passed (a drag), those ids are re-filtered through the same `getRunAssignEligibility` check and
  used instead of the checkbox selection; the idempotency-key retention/regeneration signature,
  the 409 recovery loop, and `refreshIncomingOrders()` are all reused verbatim.
  `QueueRunAssignBar.jsx`'s own call site is unchanged (still passes one argument).
- **§2.10 -- stable ids.** `useDraggable({ id: Number(pos_transaction_id) })`, never an index,
  matching Phase 227's own selection-identity rule (the queue list re-sorts on every poll tick).

## Affected Surfaces

1. `packages/web-core/src/features/pos/components/DeliveryRunDropPanel.jsx` (**new**) -- the split
   view's right-hand panel (§2.5).
2. `packages/web-core/src/features/pos/components/IncomingQueueOrderList.jsx` (**new**) -- pure
   extraction of the order-card grid (§2.7), with an added `draggable` prop for the split view's
   drag-to-assign wiring.
3. `packages/web-core/src/features/pos/utils/queueRunDropAssignment.js` (**new**) -- pure
   `resolveRunDropAssignment()`, the multi-drag-vs-single decision pulled out of the component for
   testability without simulating a pointer drag in jsdom.
4. `packages/web-core/src/features/pos/utils/orderListFormatting.js` (**new**) -- pure formatting
   helpers (`formatOrderDateTime`, `formatOrderAmount`, `humanizeOrderStatus`,
   `parseDeliveryCoords`, `resolveOrderDownpaymentSplit`, `resolveBalanceCollectionLabel`) factored
   out of `TerminalOperationsPanels.jsx` so both it and the new `IncomingQueueOrderList.jsx` can
   import them without a circular import between the two component files. Zero behavior change --
   every function is copied verbatim from its prior location.
5. `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx` (**modified**) --
   4th tab key + gate, the split render branch, `DndContext`/sensors/`DragOverlay` wiring,
   `handleBulkAssignSubmit`'s optional-ids param, the viewport-eligibility hook, the mode/viewport
   reset effect, and the order-card grid call sites now delegating to `IncomingQueueOrderList.jsx`.
6. `packages/web-core/src/features/pos/components/DeliveryRunMembersList.jsx` (**modified**) --
   new `readOnly` prop (default `false`) hiding the remove/move controls for the split panel's
   read-only reuse; `DeliveryRunsWorkspacePanel.jsx`'s existing call site is untouched and
   unaffected.
7. Tests -- see `verification_evidence`, including an update to the pre-existing
   `terminalViewModeContracts.test.js` (a raw-source-string contract test) to read
   `IncomingQueueOrderList.jsx` for the handful of assertions whose target content moved there by
   the extraction; no assertion's *meaning* changed, only which file it reads.

## Compliance Preconditions

1. **No new write path, no new permission surface.** The drop calls the same
   `addDeliveryRunMembers` route Phase 227's checkbox flow already calls, behind the same
   `canTransactPos`/`locked`/`isOnline`/`hasActiveShift` gating.
2. **A run that cannot legally receive members is never a drop target**, by construction --
   `DeliveryRunDropPanel.jsx` reuses the exact same `getEligibleRunTargets` filter
   `QueueRunAssignBar.jsx` already uses (locked/dispatched/completed/cancelled runs, runs without
   exactly one accountable person, and location-mismatched runs are all excluded from the picker
   entirely, not merely disabled).
3. **Drag and checkbox selection can never disagree about eligibility** -- both read
   `getRunAssignEligibility` and the same disablement predicate; there is exactly one source of
   truth for "can this order join a run right now."
4. **Idempotency is preserved on the new drag path** -- the drag path reuses
   `handleBulkAssignSubmit`'s existing signature-keyed idempotency-key retention verbatim (see
   `deliveryRunSplitViewDnd.behavior.test.jsx`'s retention/regeneration coverage).
5. **The extraction changes no user-visible behavior in the non-split path.** The two pre-existing
   Phase 227 behavior tests (`deliveryRunBulkAssign.behavior.test.jsx`,
   `deliveryRunsWorkspace.behavior.test.jsx`) pass unmodified against `IncomingQueueOrderList.jsx`.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- `npm run build:pos`, `npm run build:skupervisor` -- both required (a `packages/web-core`
  change); both real Vite builds, both OK.
- New: `queueRunDropAssignment.test.js` (9/9), `deliveryRunSplitViewDnd.behavior.test.jsx` (8/8) --
  both actually executed via Vitest (`apps/dgfy-ims`).
- Regression guard: `deliveryRunBulkAssign.behavior.test.jsx`, `deliveryRunsWorkspace.behavior.test.jsx`
  re-run unmodified against the extraction and the changed `handleBulkAssignSubmit` signature, all
  passing.
- `terminalViewModeContracts.test.js` updated (assertions whose target content moved into
  `IncomingQueueOrderList.jsx` now read that file) and re-run, all passing.
- Full `apps/dgfy-ims` Vitest suite re-run in full: 314 test files, 1966 tests, all passing, no
  regressions.
- `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs` -- all OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Not runnable here, stated rather than omitted:** a live acceptance walk (drag several queue
  orders onto a real run on a deployed tenant, confirm both the Active Queue and the split panel
  reflect it, confirm the checkbox path still works side by side). Every prior phase in this track
  (224-228) and every other build in this repo's history carries the same limitation absent a
  reachable deployed tenant database in this environment.

## Residual Risks

1. **No live acceptance walk was run in this environment.** The Vitest suite exercises the
   component wiring against mocked services and a mocked `@dnd-kit/core` (per the plan's own risk
   table -- constructing a real pointer-drag gesture in jsdom is not worth the cost; the
   multi-drag-vs-single decision has its own pure-function coverage instead). Flagged for the PR
   reviewer / a follow-up QA pass, same posture as every prior phase in this track.
2. **1280px is genuinely tight for two panels on the primary hardware target (iMin Falcon 1).**
   The plan's own risk table names this; the mitigation (hard `>=1280` viewport gate, single-column
   card list inside the split, drop panel capped at `26rem`) means the worst case is the tab simply
   not appearing on a device it doesn't fit -- no regression to the existing 3-tab flow.
3. **Out-of-scope finding, already filed separately.** The two-tab-alternative investigation (plan
   §1.3) found a real, pre-existing gap -- the POS terminal lock and cart draft do not synchronize
   across browser tabs (no `storage` event listener anywhere in `packages/web-core/src`). This is
   independent of #1289 and has already been filed as issue #1300 by the conducting session; it is
   not folded into this PR's scope and is not re-filed here.
4. **The `develop → main` promotion order relative to #1288/#1290.** Neither issue has an open PR
   as of this phase's implementation (re-checked at commit time, per the plan's own caveat); if
   either lands first, the shared seam (`IncomingQueueOrderList.jsx`) is exactly where the plan
   expected the next change to go, so no structural rework is anticipated -- but this is not
   independently verified here since neither change exists yet.

## Amendment (PR #1305 review, same day)

`pr-reviewer`'s review of PR #1305 (verdict `COMMENT`) raised two should-fix findings against
`IncomingQueueOrderList.jsx` and `TerminalOperationsPanels.jsx`, both fixed on the same branch
before merge -- classification, surfaces, and reason codes above are unchanged (no new write path,
no new permission surface, still frontend-only):

- **RF-1/RF-3** -- the dnd-kit activator (`listeners`/`attributes`, and the `touch-action: none`
  that comes with them) moved off the card root onto a dedicated grip handle
  (`setActivatorNodeRef`), per dnd-kit's own guidance for a draggable inside a scrollable list. The
  card root keeps `setNodeRef` only, so the queue stays touch-scrollable on the Falcon 1 inside the
  split view's `max-h-[70vh]` container. The handle only carries the activator when the card is
  actually drag-enabled, which also removes the `role="button"`/`aria-roledescription` spread from
  disabled and ineligible cards.
- **RF-2** -- the Active Queue's access/error/`shift_required`/loading ladder is now extracted into
  one `queueAccessNotice` shared by both the tab branch and the split branch, so a failed poll in
  the split view surfaces the same recoverable messaging instead of a friendly empty-queue
  illustration; the split view also gained its own Refresh Queue button for manual recovery.

Neither change touches the write path, the eligibility predicate, or the idempotency-key
retention/regeneration logic -- both remain exactly as described above.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
