---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-delivery-run-api
classification: major
surfaces: pos,terminal
reason_codes_impacted: DELIVERY_RUN_ACCOUNTABLE_REQUIRED,DELIVERY_RUN_LOCKED,DELIVERY_RUN_LOCATION_MISMATCH,DELIVERY_JOB_ALREADY_IN_RUN,DELIVERY_ASSIGNMENT_NOT_RUN_OWNED,DELIVERY_RUN_NOT_FOUND,DELIVERY_RUN_MEMBER_NOT_FOUND,DELIVERY_ORDER_REQUIRED,DELIVERY_JOB_REQUIRED,MANUAL_DELIVERY_JOB_REQUIRED,DELIVERY_JOB_ASSIGNMENT_LOCKED,DELIVERY_PERSONNEL_NOT_AVAILABLE,DELIVERY_ASSIGNMENT_REQUIRED
policy_version: 2026.09.01
verification_evidence: apps/dgfy-api/tests/deliveryRun.usecase.test.js -- actually executed (Jest): create/list/get/update/personnel-set happy paths plus the DELIVERY_RUN_LOCKED and exactly-one-accountable validation branches,apps/dgfy-api/tests/deliveryRunWriteThrough.usecase.test.js -- actually executed (Jest): add-with-no-accountable 409 DELIVERY_RUN_ACCOUNTABLE_REQUIRED; add a non-manual job 409 MANUAL_DELIVERY_JOB_REQUIRED; add a cross-location order 409 DELIVERY_RUN_LOCATION_MISMATCH; add an order whose fulfillment_status is preparing (never packed) succeeds; write-through leaves delivery_jobs.status at pending_dispatch; idempotency_key replay does not double-write; free-text accountable name writes through as delivery_personnel_name; removal clears when run-owned + pending_dispatch; removal leaves when the assignment was overwritten per-order; removal leaves when the job is past pending_dispatch,apps/dgfy-api/tests/posValidator.deliveryRun.test.js -- actually executed (Jest): all 7 new validators including the registered-vs-free-text XOR and the dispatched/completed status rejection,apps/dgfy-api/tests/deliveryRunRoutes.transport.test.js -- actually executed (Jest): deliveryRunHandlers.js transport contracts plus a route-registration content check confirming all 7 routes carry checkPermission,apps/dgfy-api/tests/posDeliveryAssignment.usecase.test.js -- actually executed (Jest), unchanged, confirms the applyDeliveryPersonnelAssignment extraction is byte-equivalent for the existing per-order path,apps/dgfy-api/tests/posDeliveryJobStatus.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/posDeliveryCompletionGuard.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/posValidator.deliveryAssignment.test.js -- actually executed (Jest), unchanged, regression-clean,tests/rbacRouteCoverage.contract.test.js -- actually executed (Jest), confirms all 7 new routes carry checkPermission,node --check on every changed/new apps/dgfy-api .js file,npm run check:architecture (check:architecture-guardrails + check:controller-boundaries) -- OK with zero new allowlist entries,npm run check:adr -- OK,npm run lint:docs -- OK,npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added
rollback_note: No schema change in this phase -- Phase 224 (PR #1275) already landed delivery_runs, delivery_run_personnel, and delivery_jobs.delivery_run_id. This phase is API-only (routes/use cases/validators), so rollback is a plain code revert with no migration to reason about. The extracted applyDeliveryPersonnelAssignment helper is additive/refactor-only for the existing per-order assignment path -- reverting this PR restores the prior single inline implementation with no data-shape change.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1273-PHASE-225-DELIVERY-RUN-API
---

# POS delivery run API + accountable write-through (Phase 225, #1273/#1081)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff:

- `apps/dgfy-api/src/modules/pos/**` (`posUseCases.js`, `deliveryRunUseCases.js`,
  `deliveryRunRepository.js`, `deliveryRunHandlers.js`, `deliveryRunSerializer.js`, `index.js`) --
  matches the `modules/pos/` rule -> `surfaces: pos,terminal`, floor `major`.
- `apps/dgfy-api/src/routes/pos.js` -- matches the dedicated `routes/pos.js` rule -> `surfaces:
  pos,terminal`, floor `major`.

`apps/dgfy-api/src/validators/posValidator.js` is not itself in `COMPLIANCE_SENSITIVE_RULES`, but
that changes nothing -- the two rules above already fire independently, and this holds under either
module layout (a sibling `modules/deliveryRun/` would have triggered the same `modules/pos/`-
adjacent `routes/pos.js` rule regardless). Not `regulatory`: nothing in this phase touches
`modules/compliance/`, `routes/compliance.js`, `compliancePolicy.js`, or a tenant-admin surface.

`related_adr`: ADR 0034 (`manual-delivery-job-foundation.md`), `status: amended`. This phase does
**not** amend it further -- Phase 224's 2026-08-31 amendment already authorized everything this
phase's write-through does ("the run writes the accountable person through into each member job's
assignment fields... enforced by the run use case before a member job is added or the run is
dispatched... membership is keyed on delivery_jobs, never on packed"). See `PHASE-225-PLAN.md`
section 1 for the full verdict trail on why no new amendment is required here.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` -- extracts the write half of
   `buildAssignDeliveryPersonnelUseCase` into an exported `applyDeliveryPersonnelAssignment({ ...,
   advanceJobStatus })` helper. `advanceJobStatus: true` reproduces the existing per-order
   assignment endpoint byte-for-byte (unchanged behavior, pinned by the unchanged
   `posDeliveryAssignment.usecase.test.js` suite); `advanceJobStatus: false` is the new run
   write-through path, which populates `delivery_personnel_id`/`_name`/`assigned_by`/
   `assigned_shift_id`/`assigned_at` while leaving `delivery_jobs.status` at `pending_dispatch`.
   Also exports several previously module-private helpers (`POS_OPERATION_KEYS`,
   `findOperationReplayEntry`, `persistOperationReplay`, `assertOpenShiftForPosMutation`,
   `resolvePosOperationalLocationScope`, `parsePositiveInt`, `hashPayload`,
   `normalizeOptionalIdempotencyKey`, `OPERATION_REPLAY_STATUS`, `serializeReplayFailure`,
   `toSerializable`, `ONLINE_ORDER_SOURCE`) so the sibling `deliveryRunUseCases.js` can reuse them
   without duplicating logic; adds two new `POS_OPERATION_KEYS` entries
   (`DELIVERY_RUN_MEMBERSHIP`, `DELIVERY_RUN_PERSONNEL`) for the new idempotency fingerprints.
2. `apps/dgfy-api/src/modules/pos/repositories/deliveryRunRepository.js` (**new**) -- module-local
   data access for `delivery_runs`/`delivery_run_personnel` plus the `delivery_jobs` membership
   helpers (`addJobsToRun`, `removeJobFromRun`, `clearDeliveryJobAssignment`,
   `getDeliveryJobByOrderId`). Deliberately not appended to `posRepository.js`, so
   `posRepository.contract.js`/`assertPosRepositoryContract` stay untouched (precedent:
   `posCashierAttendanceRepository.js`).
3. `apps/dgfy-api/src/modules/pos/usecases/deliveryRunUseCases.js` (**new**) -- the 7 use cases:
   create/list/get/update a run, replace its personnel roster (whole-roster `PUT`, not incremental
   add/remove -- `delivery_run_personnel`'s STORED generated column + unique index enforcing "at
   most one accountable" would reject an incremental edit's transient
   two-accountable/zero-accountable states), bulk-add members, and remove a single member.
   `buildAddDeliveryRunMembersUseCase` is the core of the phase: it refuses when the run has no
   accountable person (`DELIVERY_RUN_ACCOUNTABLE_REQUIRED`), validates the whole batch atomically
   (online delivery order, manual provider, `pending_dispatch`, single-location match via
   `delivery_runs.location_id`, not already in a different run), deliberately does **not** check
   `fulfillment_status` (so an F&B order that never reaches `packed` is not excluded), then calls
   `applyDeliveryPersonnelAssignment` with `advanceJobStatus: false`.
   `buildRemoveDeliveryRunMemberUseCase` implements conditional-clear removal: the assignment is
   cleared only when the job is still `pending_dispatch` **and** its current personnel identity
   still matches the run's accountable person; otherwise `delivery_run_id` is cleared but the
   assignment is left untouched, with `assignment_cleared: false` and a reason code in the response.
4. `apps/dgfy-api/src/modules/pos/controllers/deliveryRunHandlers.js` (**new**) -- transport-only,
   no Sequelize model import, matching `docs/architecture/ARCHITECTURE_BOUNDARIES.md`'s controller
   boundary (confirmed by `npm run check:architecture`'s `check:controller-boundaries` gate passing
   with zero new allowlist entries).
5. `apps/dgfy-api/src/modules/pos/serializers/deliveryRunSerializer.js` (**new**) -- response shape
   for a run + its personnel roster + member jobs (joined to `pos_transactions` for order number,
   customer, address, and fulfillment status).
6. `apps/dgfy-api/src/modules/pos/index.js` -- wires the 7 new use cases.
7. `apps/dgfy-api/src/routes/pos.js` -- registers 7 routes under `/api/pos/delivery-runs`, all
   behind `checkPermission` (`POS.actions.TRANSACT_POS` for mutations, `POS.actions.VIEW_POS` for
   reads) -- **no new permission constant**, reusing the same grant ADR 0034's 2026-08-08 amendment
   already gives per-order delivery assignment, exercised here in bulk.
8. `apps/dgfy-api/src/validators/posValidator.js` -- 7 new Joi validators, including the same
   registered-vs-free-text XOR the existing `assignDeliveryPersonnelSchema` enforces (ADR 0034's
   2026-08-12 amendment), and a status validator that rejects `dispatched`/`completed` on `PATCH`
   (Phase 228/#1271 owns those transitions).

## Compliance Preconditions

1. **No unauthenticated access path exists.** All 7 routes sit behind `checkPermission`
   (`pos:transact` for mutations, `pos:view` for reads) -- confirmed live via
   `tests/rbacRouteCoverage.contract.test.js` passing with zero exemptions needed.
2. **The write-through never advances job status pre-dispatch.** ADR 0034's 2026-08-07 amendment
   authorizes POS to advance `pending_dispatch -> assigned -> picked_up -> delivered` only while the
   order is `out_for_delivery`; the run write-through leaves `delivery_jobs.status` untouched
   (`advanceJobStatus: false`), keeping that clause literally intact. Pinned by
   `deliveryRunWriteThrough.usecase.test.js`'s "leaves job status pending_dispatch" case.
3. **At-least-one-accountable is enforced before any member job is added**, per ADR 0034's
   2026-08-31 amendment -- `buildAddDeliveryRunMembersUseCase` checks this before the batch
   validation loop even runs, pinned by the "refuses to add members to a run with no accountable
   person" test case.
4. **Membership never excludes F&B.** `fulfillment_status` is deliberately not checked when adding a
   member -- pinned by the "adds an order whose fulfillment_status is preparing (never packed)
   succeeds" test case.
5. **A run is single-location**, so the write-through's `assertOpenShiftForPosMutation` call (which
   requires an open shift at the order's location) never needs to reason about an actor holding
   simultaneous open shifts at multiple locations -- `delivery_runs.location_id` (Phase 224) exists
   precisely for this, and a location mismatch 409s before any write (`DELIVERY_RUN_LOCATION_MISMATCH`).
6. **Removal never silently leaves a stale accountable assignment.** The conditional-clear decision
   (identity-matched + still `pending_dispatch`) is documented in full in
   `docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md` and pinned by all three removal test cases.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- New `apps/dgfy-api/tests/deliveryRun.usecase.test.js`, `deliveryRunWriteThrough.usecase.test.js`,
  `posValidator.deliveryRun.test.js`, `deliveryRunRoutes.transport.test.js` -- all actually executed
  (Jest), all passing.
- Existing `posDeliveryAssignment.usecase.test.js`, `posDeliveryJobStatus.usecase.test.js`,
  `posDeliveryCompletionGuard.usecase.test.js`, `posValidator.deliveryAssignment.test.js`,
  `rbacRouteCoverage.contract.test.js` -- all actually executed (Jest), all passing, confirming the
  `applyDeliveryPersonnelAssignment` extraction is behavior-preserving.
- `node --check` on every changed/new `apps/dgfy-api` `.js` file (this app's own `build` script is a
  no-op, so this is the real Tier 0 check per `.agents/skills/implement/SKILL.md`).
- `npm run check:architecture` -- OK, 0 new allowlist entries needed (`deliveryRunHandlers.js`
  imports no Sequelize model; `deliveryRunUseCases.js` follows the `build*UseCase` convention).
- `npm run check:adr` -- OK, 84 ADRs validated.
- `npm run lint:docs` -- OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above), then
  **pass** once this declaration was added.
- Local MySQL/Redis were not reachable in this environment; the live acceptance walk proving
  #1273's three Phase-225 acceptance criteria against a real tenant database was not run. Stated
  explicitly per `.agents/skills/implement/SKILL.md` rather than omitted.

## Residual Risks

1. **No live acceptance walk was run in this environment** (no local MySQL/Redis). The unit-level
   write-through tests exercise the same code paths against an in-memory fake repository, but a
   real end-to-end run (create -> set personnel -> add members -> dispatch -> job-status
   transitions with zero calls to the per-order assignment endpoint -> completion -> removal) has
   not been proven against a live tenant database. Flagged for the PR reviewer / a follow-up QA
   pass once a database is available.
2. **Whole-run dispatch, POS UI, and run-level COD cash totals are out of scope for this phase** --
   Phase 228 (#1271) owns dispatch and the run-level unpacked-order gate (#1272); Phases 226-227
   (#1270) own the POS UI; #838 owns run-level cash totals. Nothing in this phase precludes any of
   them: `PATCH /delivery-runs/:id` rejects `dispatched`/`completed` on purpose, and
   `buildAddDeliveryRunMembersUseCase` does not filter or discard `fulfillment_status`, so the data
   Phase 228's gate needs is present.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
