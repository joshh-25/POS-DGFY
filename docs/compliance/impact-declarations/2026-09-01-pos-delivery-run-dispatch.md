---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-delivery-run-dispatch
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALREADY_DISPATCHED,DELIVERY_ORDER_REQUIRED,DELIVERY_JOB_REQUIRED,MANUAL_DELIVERY_JOB_REQUIRED,ORDER_STATUS_TRANSITION_INVALID,ORDER_METHOD_DELIVERY_REQUIRED,DELIVERY_ASSIGNMENT_REQUIRED,DELIVERY_JOB_ASSIGNMENT_LOCKED,DELIVERY_RUN_LOCATION_MISMATCH,DELIVERY_RUN_NOT_FOUND,DELIVERY_RUN_LOCKED,DELIVERY_RUN_ACCOUNTABLE_REQUIRED,DELIVERY_RUN_EMPTY,DELIVERY_RUN_UNPACKED_MEMBERS
policy_version: 2026.09.01
verification_evidence: node --check on every changed apps/dgfy-api .js file -- OK,npm run build:pos -- real Vite build, OK,npm run build:skupervisor -- real Vite build, OK (apps/dgfy-ims lazily imports the same TerminalPage.jsx tree via packages/web-core),apps/dgfy-api/tests/deliveryRunDispatch.usecase.test.js -- actually executed (Jest), 16/16 passing,apps/dgfy-api/tests/deliveryRunRoutes.transport.test.js -- actually executed (Jest), extended for the dispatch handler + 8-route registration assertion, all passing,apps/dgfy-api/tests/posValidator.deliveryRun.test.js -- actually executed (Jest), extended for the dispatch schema, all passing,apps/dgfy-api/tests/deliveryRun.usecase.test.js -- re-run after the shared test harness was extended, 22/22 passing,apps/dgfy-api/tests/deliveryRunWriteThrough.usecase.test.js -- re-run after the shared test harness was extended, all passing,packages/web-core/src/features/pos/utils/__tests__/deliveryRunDispatchReasons.test.js -- actually executed (Vitest via apps/dgfy-ims), 4/4 passing,packages/web-core/src/features/pos/__tests__/deliveryRunDispatch.behavior.test.jsx -- actually executed (Vitest via apps/dgfy-ims), 11/11 passing,packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- re-run after this phase's changes, all passing,packages/web-core/src/features/pos/__tests__/deliveryRunBulkAssign.behavior.test.jsx -- re-run after this phase's changes, all passing,npm run check:architecture -- OK,npm run check:adr -- OK,npm run lint:docs -- OK,npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added
rollback_note: One new backend route (POST /pos/delivery-runs/:deliveryRunId/dispatch) plus one new use case, handler, validator schema, and repository-free write-through against already-existing repository methods (no new migration, delivery_runs.status's `dispatched` enum value already existed since Phase 224). Rollback is a plain code revert of this PR's commits: removing the route/handler/use-case/validator removes the dispatch capability entirely; the run/personnel/membership endpoints from Phases 225-227 are untouched and continue to function. Frontend rollback similarly removes the Dispatch button, summary panel, and per-row badges, leaving the Phase 226/227 UI intact.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1273-PHASE-228-DISPATCH-RUN
---

# POS Delivery Run dispatch (Phase 228, #1273/#1271) -- final phase of the build track

## Compliance Impact Classification

Major. The floor is mechanical, confirmed against `scripts/check-compliance-impact.js` against
this diff:

- `apps/dgfy-api/src/modules/pos/**` (usecases, controllers, repositories are untouched but the
  route file and validators live under this prefix too) -- matches the
  `/^apps\/dgfy-api\/src\/modules\/pos\//` rule -> `surfaces: pos,terminal`, floor `major`.
- `apps/dgfy-api/src/routes/pos.js` and `apps/dgfy-api/src/validators/posValidator.js` -- same
  surface, same floor.
- `packages/web-core/src/features/pos/**` -- every new/modified frontend file in this phase sits
  under this prefix, matching the dedicated `COMPLIANCE_SENSITIVE_RULES` rule
  (`/^packages\/web-core\/src\/features\/pos\//`), same floor.

Neither rule reaches `regulatory`: nothing in this phase touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. No file under `apps/dgfy-migration-runner/migrations/` is
touched -- `delivery_runs.status`'s `dispatched` enum value was already added by Phase 224's
migration; this phase only starts *writing* it, so the migration checkpoint does not apply and F-5
(no new migration needed) is confirmed live: `grep dispatched apps/dgfy-migration-runner/migrations/*delivery_run*` shows the value already present.

`related_adr`: ADR 0034 (`manual-delivery-job-foundation.md`), `status: amended`. This phase **does**
amend it -- see the 2026-09-01 amendment added in this same PR, recording the `dispatched`
run-status lifecycle, its best-effort/per-order-report contract, and the #1272 packing precondition
on dispatch specifically (restating that `ONLINE_FULFILLMENT_TRANSITIONS` remains untouched by that
gate, so the 2026-08-31 amendment's additive-by-design promise is not reopened). This is an untagged
Consequences-style clause addition, taking the dated `## Amendments` block route per AGENTS.md
Planning Rule 4 (`[default]`/untagged clause -> amendment in the same PR), not a superseding ADR.

## Source-verified findings that shaped this phase

Re-verified against `origin/develop` immediately before implementation (branch cut point
`c065a0d91`, the Phase 227 merge commit):

- **F-1 -- the real per-order guard chain for `-> out_for_delivery`.** Confirmed directly in
  `buildUpdateOnlineOrderFulfillmentStatusUseCase` (`posUseCases.js`): order exists + online_store
  + open shift + `validateOnlineOrderTransition`. `requirePairedTerminal`/
  `requireActiveOperatorForMutation` are money-route-only middlewares and are not on this
  transition -- confirmed not reused here either.
- **F-2 -- the transition guards were module-private.** `normalizeOnlineFulfillmentStatus`,
  `validateOnlineOrderTransition`, and `buildOnlineOrderShiftAttributionPayload` gained an `export`
  keyword only (zero behavior change) so the dispatch use case reuses the exact same state machine
  rather than forking a second copy of `ONLINE_FULFILLMENT_TRANSITIONS`.
- **F-3 -- Phase 225 deliberately left member jobs at `pending_dispatch`.** This phase is what
  advances both `pos_transactions.fulfillment_status -> out_for_delivery` and
  `delivery_jobs.status pending_dispatch -> assigned` per successfully-dispatched order, confirmed
  by the new use case test's job-status assertions.
- **F-4 -- `RUN_MUTATION_BLOCKED_STATUSES` still blocks new members on a dispatched run; member
  removal still has no run-status guard.** Both re-confirmed unchanged by direct read; neither
  constant was touched by this phase.
- **F-5 -- no migration needed.** `delivery_runs.status`'s enum already included `dispatched`
  (Phase 224's migration) -- re-verified live rather than trusted from the plan; no migration file
  added in this phase.
- **F-6/F-7 -- workflow-mode read + repository methods all pre-existed.**
  `resolveWorkflowCapabilitySettings()` + `normalizeWorkflowMode` (already used server-side for
  #1272's retail-only gating elsewhere) are reused as-is; every repository method the dispatch flow
  needs (`getRunById`, `getRunDetail`, `listRunPersonnel`, `updateRun`,
  `getOrderByIdForLifecycle`, `updateOrderById`, `updateDeliveryJobByOrderId`, `createAuditLog`)
  already existed -- confirmed by direct read of `deliveryRunRepository.js` and
  `posRepository.js` before writing the use case; no repository change, no
  `assertPosRepositoryContract` change.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` (**modified**) -- exports the three
   transition-guard functions named above (F-2); adds
   `POS_OPERATION_KEYS.DELIVERY_RUN_DISPATCH` (`'terminal.delivery_run_dispatch'`).
2. `apps/dgfy-api/src/modules/pos/usecases/deliveryRunUseCases.js` (**modified**) -- new
   `buildDispatchDeliveryRunUseCase`: one outer transaction, run-level preconditions in order (not
   found -> locked -> accountable-required -> empty -> #1272 packing gate, retail-only -> one open
   shift check), then a read-before-write per-order fan-out against the taxonomy in
   `reason_codes_impacted` above, the D-3 best-effort run-status flip (>=1 success, never "all"),
   one run-scoped + N per-member audit rows, the two-layer idempotency (durable
   `DELIVERY_RUN_DISPATCH` replay hashed on `{ delivery_run_id }` only, plus the in-fan-out
   `ALREADY_DISPATCHED` skip), and a post-commit best-effort `recordDgfyOrderActivity` call per
   dispatched order.
3. `apps/dgfy-api/src/modules/pos/controllers/deliveryRunHandlers.js`,
   `apps/dgfy-api/src/modules/pos/index.js`, `apps/dgfy-api/src/routes/pos.js`,
   `apps/dgfy-api/src/validators/posValidator.js` (**modified**) -- wiring only: new
   `dispatchDeliveryRun` handler/export, new route (`checkPermission(TRANSACT_POS)` +
   `validateDeliveryRunIdParam` + `validateDeliveryRunDispatch`), new schema (idempotency key only,
   8-120 chars).
4. `packages/web-core/src/features/pos/services/deliveryRunService.js` (**modified**) -- new
   `dispatchDeliveryRun()` wrapper, same shape as every other route wrapper in this file.
5. `packages/web-core/src/features/pos/utils/deliveryRunDispatchReasons.js` (**new**) -- pure
   `reason_code -> operator message` map, no dependencies.
6. `packages/web-core/src/features/pos/components/DeliveryRunDispatchSummary.jsx` (**new**) --
   persistent three-bucket result panel (deliberately not a toast -- Phase 227's own residual-risk
   note flags that a batch of per-order failures does not fit one).
7. `packages/web-core/src/features/pos/components/DeliveryRunsWorkspacePanel.jsx`,
   `packages/web-core/src/features/pos/components/DeliveryRunMembersList.jsx` (**modified**) --
   Dispatch/Re-dispatch button + `ConfirmActionDialog`, the client-side packing pre-flight backstop
   notice, idempotency-key retention keyed on `${runId}:dispatch:${sortedMemberIds}`, and a
   per-row outcome badge sourced from the last dispatch result.
8. Tests -- see `verification_evidence`.

## Compliance Preconditions

1. **No unauthenticated access path introduced.** The new route sits behind the same
   `checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS)` middleware every other delivery-run
   mutation route already uses; the frontend Dispatch button gates on the same
   `canTransactPos`/`locked`/`isOnline`/`hasActiveShift` props every other mutation control in this
   panel already respects.
2. **A best-effort endpoint still reports every failure, never silently drops one.** Every
   non-dispatched member ends up in exactly one of `skipped`/`failed` with a reason code; nothing
   is omitted from the response. The frontend surfaces the full three-bucket result in a persistent
   panel, not a toast that could get dismissed before it's read.
3. **The retail-only packing gate is enforced server-side; the client-side check is a backstop
   only.** The 409 (`DELIVERY_RUN_UNPACKED_MEMBERS`, naming every offending order) is the real
   gate; the frontend's pre-flight notice only saves an operator a round trip and is deliberately
   documented as such in both the code comment and this declaration.
4. **Idempotency is two-layered and both layers are exercised by tests**: the durable
   operation-replay key (hashed on `delivery_run_id` only, so a legitimate retry with a changed
   member set still replays) and the per-member `ALREADY_DISPATCHED` skip (so re-running the
   endpoint with a *different* idempotency key is still a no-op for already-dispatched members).
5. **`dispatched` is narrowly un-locked for this one action.** The dispatch endpoint's own
   locked-status set (`completed`/`cancelled` only) is a distinct constant from the shared
   `RUN_LOCKED_STATUSES`/`RUN_MUTATION_BLOCKED_STATUSES` still used by every other run mutation
   (personnel replace, membership add/remove), each carrying a code comment explaining the
   divergence so a future reader does not "fix" it into one shared list.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- `node --check` on every changed backend `.js` file -- OK.
- `npm run build:pos`, `npm run build:skupervisor` -- both required (a `packages/web-core`
  change); both real Vite builds, both OK.
- Backend: `deliveryRunDispatch.usecase.test.js` (new, 16 cases covering every run-level
  precondition, the packing gate in both retail and F&B, the full fan-out taxonomy in one mixed
  call, the D-3 status flip and its absence, re-dispatch/`ALREADY_DISPATCHED`, and both replay
  outcomes), `deliveryRunRoutes.transport.test.js` and `posValidator.deliveryRun.test.js`
  (extended), `deliveryRun.usecase.test.js` / `deliveryRunWriteThrough.usecase.test.js` (re-run
  after the shared test harness gained `updateDeliveryJobByOrderId` and dispatch-assignment
  fields) -- all passing.
- Frontend: `deliveryRunDispatchReasons.test.js` (new, pure unit), `deliveryRunDispatch.behavior.test.jsx`
  (new, 11 cases covering button gating, the unpacked pre-flight notice, confirm-then-submit,
  idempotency retention, the three-bucket summary panel, the 409's named orders, and the
  Re-dispatch label), `deliveryRunsWorkspace.behavior.test.jsx` /
  `deliveryRunBulkAssign.behavior.test.jsx` (re-run, no regressions) -- all passing.
- `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs` -- all OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Not runnable here, stated rather than omitted:** a live acceptance walk (dispatch a real run
  against a deployed tenant database, confirm order + job status transitions and the audit trail)
  against a deployed tenant database. Every prior phase in this track (224-227) carries the same
  limitation.

## Residual Risks

1. **No live acceptance walk was run in this environment.** The Jest/Vitest suites exercise the
   use case and UI logic against an in-memory fake repository and mocked services, not a real
   backend or database. Flagged for the PR reviewer / a follow-up QA pass, same posture as every
   prior phase.
2. **Functional correctness of the dispatch write itself is not independently verified by
   `verify-deployment.yml`-class infra health checks** -- that is the Verifier/QA role's job
   post-merge, per `.agents/skills/verifier/SKILL.md`'s own stated scope gap (infra health is
   solved there; functional correctness per feature class is not).
3. **This is the final phase of the #1273 build track (#1271/#1272/#1273).** Whether to close the
   tracking issues is a coordinator/PM decision, not made by this phase -- the PR uses `Refs #1273`
   rather than `Closes #1273` deliberately.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
