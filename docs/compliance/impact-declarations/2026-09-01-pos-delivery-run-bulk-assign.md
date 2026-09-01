---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-delivery-run-bulk-assign
classification: major
surfaces: pos,terminal
reason_codes_impacted: DELIVERY_ORDER_REQUIRED,DELIVERY_JOB_REQUIRED,MANUAL_DELIVERY_JOB_REQUIRED,DELIVERY_JOB_ASSIGNMENT_LOCKED,DELIVERY_JOB_ALREADY_IN_RUN,DELIVERY_RUN_LOCATION_MISMATCH,DELIVERY_RUN_ACCOUNTABLE_REQUIRED,DELIVERY_RUN_LOCKED,DELIVERY_RUN_NOT_FOUND
policy_version: 2026.09.01
verification_evidence: node --check apps/dgfy-api/src/modules/pos/repositories/posRepository.js -- OK,npm run build:pos -- real Vite build, OK,npm run build:skupervisor -- real Vite build, OK (apps/dgfy-ims lazily imports the same TerminalPage.jsx tree via packages/web-core),packages/web-core/src/features/pos/utils/__tests__/deliveryRunEligibility.test.js -- actually executed (Vitest via apps/dgfy-ims), 17/17 passing,packages/web-core/src/features/pos/__tests__/deliveryRunBulkAssign.behavior.test.jsx -- actually executed (Vitest via apps/dgfy-ims), 12/12 passing,packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- re-run after this phase's changes, 12/12 passing (one RF-3 test's mock updated to key off location_id rather than raw call count, since QueueRunAssignBar now also calls fetchDeliveryRuns independently of DeliveryRunsWorkspacePanel),apps/dgfy-api/tests/posRepository.transactionInclude.contract.test.js -- actually executed (Jest, no DB -- dbStore.get stubbed), 2/2 passing,npm run check:architecture -- OK,npm run check:adr -- OK,npm run lint:docs -- OK,npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added
rollback_note: One additive/nullable/read-only backend line (apps/dgfy-api/src/modules/pos/repositories/posRepository.js -- delivery_run_id added to an existing SELECT attribute whitelist, no schema/migration change) plus new frontend-only files under packages/web-core/src/features/pos/ and one one-line frontend bugfix drive-by. Rollback is a plain code revert: removing the backend attribute stops the field being returned (existing consumers that don't reference it are unaffected); removing the new toolbar/checkbox/eligibility files removes the bulk-select UI entirely, leaving the per-order Delivery Runs tab UI (Phase 226) and the per-order delivery-assignment UI untouched, since neither is modified by this phase beyond the one-line F-3 fix.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T01:05:32.411Z
preflight_request_ref: PREFLIGHT-33457125207-2026-09-01-POS-DELIVERY-RUN-BULK-ASSIGN
---

# POS Delivery Run bulk "add to run" from the Active Queue (Phase 227, #1273/#1270)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff:

- `packages/web-core/src/features/pos/**` -- every new and modified frontend file in this phase
  sits under this prefix, matching `COMPLIANCE_SENSITIVE_RULES`'s dedicated rule
  (`/^packages\/web-core\/src\/features\/pos\//`) -> `surfaces: pos,terminal`, floor `major`.
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- matches the separate
  `/^apps\/dgfy-api\/src\/modules\/pos\//` rule, same floor (`major`), same surfaces.

Neither rule reaches `regulatory`: nothing in this phase touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. No file under `apps/dgfy-migration-runner/migrations/`
is touched -- the migration checkpoint does not apply, and the one backend change is a plain SELECT
attribute addition, not a schema change.

`related_adr`: ADR 0034 (`manual-delivery-job-foundation.md`), `status: amended`. This phase does
**not** amend it -- membership is still keyed on `delivery_jobs` exactly as the 2026-08-31
amendment (Phase 224) already states, and the bulk-add flow built here is a client-side
convenience layer over Phase 225's existing `POST .../members` route (unchanged in this phase) --
no new backend mutation semantics, no new ADR clause implicated. Planning Rule 4 (cross-boundary
changes) does not apply: no ADR clause is being changed.

## Three source-verified findings that shaped this phase

Re-verified against `origin/develop` at merge-base `82ee4eccb` before implementation (the plan was
originally written against the same commit):

- **F-1 -- Active Queue has no pagination.** `TerminalOperationsPanels.jsx`'s
  `IncomingQueueWorkspace` (the plan's own working name, "OnlineOrderWorkspace," does not exist as
  a function in this codebase -- this is the actual component `sortedIncomingOrders` renders from,
  confirmed by direct read) renders the entire order list (server-capped, no offset) in one grid.
  The "don't force page-by-page selection" acceptance criterion is already structurally met, so no
  pagination/virtualization work was built -- a sticky toolbar + select-all-eligible instead.
- **F-2 -- `POST /pos/delivery-runs/:id/members` is all-or-nothing, not best-effort.**
  Re-read directly in `deliveryRunUseCases.js`'s `buildAddDeliveryRunMembersUseCase`: Step 4
  validates the *entire* batch before any write and throws on the first per-order problem,
  rejecting every already-validated order in the same call along with it. `skipped` (Step 7) only
  ever carries already-in-this-run idempotent no-ops, confirmed at
  `deliveryRunUseCases.js` around the `DELIVERY_JOB_ALREADY_IN_RUN`/`idempotent_no_op: true` push.
  Chunking the request or making the backend best-effort were both deliberately rejected (chunking
  turns an atomic failure into a partially-applied one; changing the backend contract is Pat's own
  call, tracked separately alongside #1271/Phase 228's dispatch model) -- instead this phase builds
  a client-side eligibility pre-filter (`utils/deliveryRunEligibility.js`) mirroring the use case's
  own rejection order exactly, so an invalid batch is unconstructable from the UI, plus a
  named-order 409 recovery loop for the unavoidable client-read-vs-server-lock race window.
- **F-3 -- `error_code` is the DomainErrorCode (`'CONFLICT'`), not the reason.** Confirmed directly
  in `useCaseResponder.js`/`deliveryRunHandlers.js`'s `defaultErrorPayload`: the response shape is
  `{ error_code: failure.code, errors: failure.details, ... }`, i.e. the per-condition reason lives
  under `errors.reason_code`/`errors.pos_transaction_id`, not `error_code` itself.
  `DeliveryRunsWorkspacePanel.jsx`'s existing `errorCode === 'DELIVERY_RUN_LOCKED'` check (Phase
  226) compared against the wrong field and could never fire. Fixed as a one-line drive-by here
  (read `error?.response?.data?.errors?.reason_code` instead) and used correctly in every new code
  path this phase adds.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` (**modified**, Task 1) --
   `buildTransactionInclude()`'s `deliveryJob` include now also selects `delivery_run_id`
   (immediately after `delivery_job_id`), so the frontend can read whether an order already
   belongs to a run without a second round trip. Additive, nullable, read-only -- no nested
   `deliveryRun` include added; the frontend maps id -> label from its own already-loaded runs
   list. Also newly exports `buildTransactionInclude` (previously module-private) purely so
   `apps/dgfy-api/tests/posRepository.transactionInclude.contract.test.js` can assert on the
   include descriptor directly without a DB connection; no behavior change from the export itself.
2. `packages/web-core/src/features/pos/utils/deliveryRunEligibility.js` (**new**) -- two pure
   functions. `getRunAssignEligibility(order, { targetRunLocationId })` mirrors
   `buildAddDeliveryRunMembersUseCase`'s Step 4 rejection order exactly: delivery order -> manual
   job -> pending_dispatch -> no existing `delivery_run_id` -> location match (the location check
   is skipped, not failed, when no target run is given yet, so the same function also serves as a
   target-run-agnostic "still a plausible candidate" check for the drift hint below).
   `getEligibleRunTargets(runs, { locationId })` excludes any run that is
   dispatched/completed/cancelled, lacks *exactly* one accountable person
   (`.filter(...).length === 1`, matching Phase 226's RF-5 fix -- deliberately not `.some()`), or
   whose `location_id` doesn't match the active shift's location -- this third filter is new for
   this phase and is what makes `DELIVERY_RUN_LOCATION_MISMATCH` unreachable by construction from
   the picker.
3. `packages/web-core/src/features/pos/components/QueueRunAssignBar.jsx` (**new**) -- sticky
   selection toolbar, always rendered when retail-gated and the Active Queue tab is showing (even
   at 0 selected -- it's the discoverability surface for the whole feature). Owns its own
   `fetchDeliveryRuns` call and the target-run picker's local state (mirroring
   `DeliveryRunsWorkspacePanel.jsx`'s own RF-3 request-generation staleness guard, since this is a
   second, independent caller of the same service function); selection state itself lives in the
   parent so it survives a tab switch.
4. `packages/web-core/src/features/pos/components/QueueOrderSelectCheckbox.jsx` (**new**) --
   per-card checkbox; a disabled, ineligible order surfaces its reason via both `title` and
   `aria-label`.
5. `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx` (**modified**) --
   `IncomingQueueWorkspace` gains a `Set<Number>` selection of `pos_transaction_id` (never an
   index, since `sortedIncomingOrders` is re-sorted every render), the batched-submit handler
   (idempotency key retained across a retry of the identical batch via
   `${targetRunId}:${sortedSelectedIds.join(',')}`, regenerated on a genuinely different selection
   or target run -- the same RF-1/RF-4 pattern Phase 226 already established), and renders
   `QueueRunAssignBar` + a `QueueOrderSelectCheckbox` per card. The selection Set is deliberately
   **not** pruned against the polled order list on every tick (a transient poll error returning
   `orders: []` would otherwise wipe it); eligibility is instead re-derived live each render, and an
   ineligible-drift hint appears when the Set's size exceeds the currently-eligible subset. The
   existing mode-flip reset effect (Phase 226) now also clears this selection so it never survives
   a flip into F&B mode.
6. `packages/web-core/src/features/pos/components/DeliveryRunsWorkspacePanel.jsx` (**modified**,
   F-3 fix only) -- `handleSavePersonnel`'s locked-run message now reads
   `error?.response?.data?.errors?.reason_code` instead of the never-firing
   `error?.response?.data?.error_code`.
7. Tests -- `utils/__tests__/deliveryRunEligibility.test.js` (new, pure unit),
   `__tests__/deliveryRunBulkAssign.behavior.test.jsx` (new, behavior),
   `apps/dgfy-api/tests/posRepository.transactionInclude.contract.test.js` (new, structural
   contract, no DB). `__tests__/deliveryRunsWorkspace.behavior.test.jsx`'s RF-3 stale-response test
   was updated (not functionally weakened) to key its mock off the request's `location_id`
   argument rather than raw call count/order, since `QueueRunAssignBar` is now a second,
   independent caller of `fetchDeliveryRuns` alongside `DeliveryRunsWorkspacePanel` -- see that
   test's own updated comment for the full reasoning.

## Compliance Preconditions

1. **No unauthenticated access path is introduced.** This phase adds no new route, permission, or
   backend mutation path -- it consumes Phase 225's already-`checkPermission`-gated
   `POST /pos/delivery-runs/:id/members` route (unchanged) through the existing authenticated API
   client. Every new control (`QueueRunAssignBar`, each `QueueOrderSelectCheckbox`) gates on the
   same `canTransactPos`/`locked`/`isOnline`/`hasActiveShift` props every other POS mutation control
   in this file already respects (`handleMoveMember`'s existing guard pattern, Phase 226).
2. **An invalid batch is unconstructable, not merely discouraged.** Because F-2 makes the add route
   genuinely all-or-nothing, this phase's whole design center is prevention: ineligible checkboxes
   are disabled with a stated reason, "select all eligible" only ever selects eligible orders, and
   the target-run picker excludes every run that would 409 regardless of which orders are selected
   (locked, wrong accountable-person count, wrong location). The residual gap -- a genuine race
   between the client's read and the server's own row lock -- is handled, not ignored: a 409 reads
   `errors.reason_code`/`errors.pos_transaction_id` (F-3's corrected pattern), shows a persistent
   (`{ duration: Infinity }`) toast stating plainly that nothing was added (the whole batch was
   rejected together, not partially applied), auto-deselects the named order, and offers a retry
   with the remaining selection via the same button.
3. **The idempotency key is retained across a retry of the identical batch and regenerated on any
   genuine change**, matching the RF-1/RF-4 precedent `DeliveryRunsWorkspacePanel.jsx` already
   established for the personnel-save and move-ADD requests -- a retry of the same submit after a
   transient failure must be recognized as a replay by the server, not treated as a fresh write.
4. **Retail gating is enforced at both the toolbar and every checkbox**, and the selection itself
   is cleared on a mode flip away from retail (the existing `WORKFLOW_MODE_CHANGED_EVENT`-driven
   reset effect from Phase 226), so a stale bulk-selection can never survive into F&B mode where
   the concept doesn't apply.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- `node --check apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- OK.
- `npm run build:pos` -- real Vite build, OK.
- `npm run build:skupervisor` -- also required (a `packages/web-core` change; `apps/dgfy-ims`
  lazily imports the same tree). OK.
- `packages/web-core/src/features/pos/utils/__tests__/deliveryRunEligibility.test.js` -- actually
  executed (Vitest via `apps/dgfy-ims`), 17/17 passing.
- `packages/web-core/src/features/pos/__tests__/deliveryRunBulkAssign.behavior.test.jsx` --
  actually executed, 12/12 passing.
- `packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx` --
  re-run after this phase's changes (one RF-3 test's mock updated, see above), 12/12 passing.
- `apps/dgfy-api/tests/posRepository.transactionInclude.contract.test.js` -- actually executed
  (Jest, no DB connection -- `dbStore.get` stubbed to a bare marker), 2/2 passing.
- `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs` -- all OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Not runnable here, stated rather than omitted:** a live acceptance walk (bulk-select several
  Active Queue orders, add to a run, confirm the queue and run both reflect it; trigger a real
  409 race) against a deployed tenant database. Phases 224/225/226's own declarations carry the
  same limitation.

## Residual Risks

1. **`POST .../members` remains genuinely all-or-nothing** -- unchanged, out of scope for this
   phase per Pat's own call (tracked alongside #1271/Phase 228's best-effort-dispatch decision, not
   blocking this PR). This phase's mitigation is prevention (an invalid batch is unconstructable)
   plus a race-window recovery loop, not a backend contract change.
2. **The 409 recovery loop still requires a manual retry click** -- it does not automatically
   resubmit the remaining orders. This matches the existing "move to another run" pattern's own
   posture (persistent toast + manual retry, Phase 226) rather than introducing a new interaction
   model for this one flow.
3. **No live acceptance walk was run in this environment.** The Vitest/Jest suites exercise the UI
   logic and the include descriptor's structure against mocks, not a real backend or database.
   Flagged for the PR reviewer / a follow-up QA pass, same posture as every prior phase in this
   track.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
