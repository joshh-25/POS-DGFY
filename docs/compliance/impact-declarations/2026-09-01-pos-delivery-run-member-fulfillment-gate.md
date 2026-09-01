---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-delivery-run-member-fulfillment-gate
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.09.01
verification_evidence: node --check apps/dgfy-api/src/modules/pos/repositories/posRepository.js -- OK,npm run build:pos -- real Vite build, OK,npm run build:skupervisor -- real Vite build, OK (apps/dgfy-ims lazily imports the same TerminalPage.jsx tree via packages/web-core),apps/dgfy-api/tests/posRepository.transactionInclude.contract.test.js -- extended (Jest, no DB -- dbStore.get stubbed), 3/3 passing,packages/web-core/src/features/pos/utils/__tests__/deliveryRunEligibility.test.js -- extended (Vitest via apps/dgfy-ims), 25/25 passing,packages/web-core/src/features/pos/__tests__/incomingQueueRunMemberFulfillmentGate.behavior.test.jsx -- new (Vitest via apps/dgfy-ims), 6/6 passing,packages/web-core/src/features/pos/__tests__/deliveryRunBulkAssign.behavior.test.jsx -- re-run unmodified, 12/12 passing,packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- re-run unmodified, 12/12 passing,packages/web-core/src/features/pos/__tests__/deliveryRunDispatch.behavior.test.jsx -- re-run unmodified, 11/11 passing,packages/web-core/src/features/pos/__tests__/orderFulfillmentUi.test.js -- re-run unmodified, 12/12 passing (proof the shared getNextStatusActions contract was not disturbed),npm run check:architecture -- OK,npm run check:adr -- OK,npm run lint:docs -- OK,npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added
rollback_note: One additive/nullable/read-only backend nested include (apps/dgfy-api/src/modules/pos/repositories/posRepository.js -- a `deliveryRun` include with `{delivery_run_id, label, status}` added inside the existing `deliveryJob` include, no schema/migration change) plus one new pure frontend helper (`getActiveRunMembership`) and one `disabled`/`title`/`aria-label` change scoped to a single button in TerminalOperationsPanels.jsx. Rollback is a plain code revert: removing the backend nested include stops `deliveryRun` being returned (existing consumers that don't reference it are unaffected, matching the other 6 call sites of buildTransactionInclude); removing the frontend gate restores the per-order "Out for Delivery" control to always-enabled (subject to the pre-existing permission/lock/online/shift gating), with no other UI removed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T04:22:52.918Z
preflight_request_ref: PREFLIGHT-33469394801-2026-09-01-POS-DELIVERY-RUN-MEMBER-FULFILLMENT-GATE
---

# Disable the per-order "Out for Delivery" action for active Delivery Run members (Phase 229, #1291)

## Compliance Impact Classification

Major. Both mechanical rules in `scripts/check-compliance-impact.js` fire against this diff:

- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- matches
  `/^apps\/dgfy-api\/src\/modules\/pos\//` -> `surfaces: pos,terminal`, floor `major`.
- `packages/web-core/src/features/pos/utils/deliveryRunEligibility.js` and
  `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx` -- both match
  `/^packages\/web-core\/src\/features\/pos\//`, same floor, same surfaces.

Neither rule reaches `regulatory`: nothing in this phase touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. No file under `apps/dgfy-migration-runner/migrations/`
is touched -- the migration checkpoint does not apply, and the one backend change is a plain
additive, read-only, `required: false` nested include, not a schema change.

`related_adr`: ADR 0034 (`manual-delivery-job-foundation.md`), `status: amended`. No clause --
binding, default, or untagged -- requires the per-order fulfillment control to stay available, and
`ONLINE_FULFILLMENT_TRANSITIONS` (which the 2026-09-01/Phase 228 amendment pins as untouched) is
untouched here too, so no new ADR clause is implicated. A short, optional dated `## Amendments`
block is nonetheless added to ADR 0034 in this same PR to record the new behavioral contract, per
ADR 0039's "default tier, same-PR amendment" cheapest path for an untagged/Consequences-level fact
-- not because a clause changed.

## Why the run's own status has to be read, not just `delivery_run_id`

Source-verified before implementation, not assumed:

- `delivery_runs.status` enum is `draft | scheduled | dispatched | completed | cancelled`
  (`apps/dgfy-api/src/models/DeliveryRun.js`).
- A run can be set to `cancelled` via `PATCH /pos/delivery-runs/:id`
  (`RUN_UPDATABLE_STATUSES = ['draft','scheduled','cancelled']`, `deliveryRunUseCases.js`).
  **Cancelling a run does not clear its members' `delivery_run_id`** -- only the explicit
  remove-member use case (`deliveryRunRepository.removeJobFromRun`) does that. A cancelled run also
  cannot be dispatched (`RUN_DISPATCH_BLOCKED_STATUSES = ['completed','cancelled']`). Gating the
  per-order control on `delivery_run_id` alone would therefore strand those orders with neither the
  per-order action nor a working run dispatch -- the exact dead end this phase avoids by also
  reading `deliveryRun.status`.
- The gate is a **blocklist**, mirroring `RUN_DISPATCH_BLOCKED_STATUSES` exactly: an order with a
  truthy `delivery_run_id` but a missing/unknown `deliveryRun` record (a stale cached payload, or a
  future status value) is treated as still-active -- fail-closed toward "use the run." This is safe
  because removing a member has no run-status guard at all
  (`buildRemoveDeliveryRunMemberUseCase` checks only run-exists/member-exists), so an operator
  always has an escape hatch.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` (**modified**) --
   `buildTransactionInclude()`'s `deliveryJob` include gains a nested `deliveryRun` include
   (`{ delivery_run_id, label, status }`, `required: false`) alongside its existing
   `deliveryPersonnel`/`assignedByUser`/`assignedShift` nested includes. Additive only; the outer
   LEFT JOIN chain is unaffected, and this is shared read-only by all 6 call sites of
   `buildTransactionInclude` (including the mobile checkpoint), none of which can regress from an
   extra nullable nested object.
2. `packages/web-core/src/features/pos/utils/deliveryRunEligibility.js` (**modified**) -- adds
   `RUN_INACTIVE_STATUSES` and the pure helper `getActiveRunMembership(order)`, returning
   `{ inActiveRun, runId, runLabel, runStatus }`. Deliberately not added to
   `orderFulfillmentUi.js`'s `getNextStatusActions`, whose two-arg signature is pinned by
   `orderFulfillmentUi.test.js` for the un-updated `TerminalSidebarPanel.jsx` call site (no render
   site on `develop` -- Phase 211/this phase both leave it alone).
3. `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx` (**modified**) --
   `IncomingQueueWorkspace` computes `activeRunMembership` once per card and, for the
   `out_for_delivery` action **only**, ORs `activeRunMembership.inActiveRun` into the button's
   existing `disabled` expression (composed with, never replacing, the pre-existing
   `actionLoading`/`canTransactPos`/`locked`/`isOnline`/`hasActiveShift`/`isCompletionPaymentPending`
   checks) and sets `title`/`aria-label` to an explanatory reason mirroring
   `QueueOrderSelectCheckbox.jsx`'s existing disabled-with-reason pattern. Every other entry in
   `nextActions` (critically, `packed`) is untouched -- disabling the whole array at `preparing` in
   retail mode would deadlock Phase 228's `DELIVERY_RUN_UNPACKED_MEMBERS` dispatch precondition,
   which requires every run member to be `packed` before the run can dispatch.
4. Tests -- `apps/dgfy-api/tests/posRepository.transactionInclude.contract.test.js` (extended, one
   new assertion), `packages/web-core/src/features/pos/utils/__tests__/deliveryRunEligibility.test.js`
   (extended, `getActiveRunMembership` cases), and a new
   `packages/web-core/src/features/pos/__tests__/incomingQueueRunMemberFulfillmentGate.behavior.test.jsx`
   covering: no-run enabled, active-run disabled-with-tooltip, the `packed`-stays-enabled deadlock
   guard, cancelled-run re-enabled, a pickup order unaffected, and composition with the existing
   permission gate.

## Rejected alternative -- server-side enforcement

Considered and rejected: `buildDispatchDeliveryRunUseCase` itself calls
`validateOnlineOrderTransition` for every member, so a run-membership block inside that shared
validator would make the run's own Dispatch action reject every member it is supposed to advance.
A guard scoped only to the per-order fulfillment route is possible but is a real API behavior
change (new reason code, new 409 path) larger than this issue's ask. Kept UI-only plus the
read-only field; a follow-on "server-side guard on the per-order route" idea is left for `pm` to
shape separately if defense in depth is wanted later.

## Compliance Preconditions

1. **No unauthenticated access path is introduced.** This phase adds no new route, permission, or
   backend mutation path -- it only extends an existing read-only SELECT and disables an existing
   client-side control. Every existing permission/lock/online/shift gate on the affected button is
   preserved, composed with (never replaced by) the new condition.
2. **Fail-closed, not fail-open.** An order with a truthy `delivery_run_id` but a missing/unknown
   `deliveryRun` record is treated as still in an active run (button stays gated), never the
   reverse -- see "Why the run's own status has to be read" above.
3. **No new escape-hatch dependency introduced.** The existing remove-member use case (no
   run-status guard) remains the operator's way out of a stuck state; this phase does not change
   that use case.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- `node --check apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- OK.
- `npm run build:pos` and `npm run build:skupervisor` -- real Vite builds, both OK.
- `apps/dgfy-api/tests/posRepository.transactionInclude.contract.test.js` -- extended, 3/3 passing.
- `packages/web-core/src/features/pos/utils/__tests__/deliveryRunEligibility.test.js` -- extended,
  25/25 passing.
- `packages/web-core/src/features/pos/__tests__/incomingQueueRunMemberFulfillmentGate.behavior.test.jsx`
  -- new, 6/6 passing.
- Regression re-runs, all unmodified and all passing: `deliveryRunBulkAssign.behavior.test.jsx`
  (12/12), `deliveryRunsWorkspace.behavior.test.jsx` (12/12), `deliveryRunDispatch.behavior.test.jsx`
  (11/11), `orderFulfillmentUi.test.js` (12/12) -- proof the shared `getNextStatusActions` contract
  was not disturbed.
- `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs` -- all OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Not runnable here, stated rather than omitted:** a live acceptance walk (create a run, add a
  `packed` delivery order, confirm the card's "Out for Delivery" is greyed with the tooltip while
  "Mark Packed"/"Collect Cash" still work; dispatch the run; cancel a different draft run and
  confirm its member's button comes back) against a deployed tenant database. Every prior phase in
  this track (227/228) carries the same limitation.

## Residual Risks

1. **No server-side enforcement of this gate.** The per-order fulfillment route itself does not
   reject an `out_for_delivery` transition for an active run member -- this is a UI-only
   presentation gate. See "Rejected alternative" above for why a server-side guard was scoped out
   of this phase.
2. **No live acceptance walk was run in this environment.** The Vitest/Jest suites exercise the UI
   logic and the include descriptor's structure against mocks, not a real backend or database.
   Flagged for the PR reviewer / a follow-up QA pass, same posture as every prior phase in this
   track.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
