---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-delivery-run-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: DELIVERY_RUN_ACCOUNTABLE_REQUIRED,DELIVERY_RUN_LOCKED,DELIVERY_RUN_LOCATION_MISMATCH,DELIVERY_JOB_ALREADY_IN_RUN,DELIVERY_ASSIGNMENT_NOT_RUN_OWNED,DELIVERY_RUN_NOT_FOUND,DELIVERY_RUN_MEMBER_NOT_FOUND,DELIVERY_JOB_ASSIGNMENT_LOCKED,DELIVERY_PERSONNEL_NOT_AVAILABLE,POS_LOCATION_ACCESS_DENIED
policy_version: 2026.09.01
verification_evidence: npm run build:pos -- real Vite build, OK,npm run build:skupervisor -- real Vite build, OK (apps/dgfy-ims lazily imports the same TerminalPage.jsx tree via packages/web-core),packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- actually executed (Vitest, run from apps/dgfy-ims per its vite.config.js's packages/web-core test include), 11/11 passing (6 original + 5 added for PR #1277's RF-1/RF-2/RF-3 review fixes: personnel-submit idempotency-key retry retention, move-ADD idempotency-key retry retention, no-accountable-target exclusion from the move picker, a stale fetchDeliveryRuns response discarded after a location-scope switch, selected-run/detail cleared immediately on a location-scope switch),npm run check:architecture -- OK, trivially green (dgfy-api-scoped, this phase touches no backend file),npm run lint:docs -- OK,npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added
rollback_note: No schema or backend change in this phase -- Phase 224 (PR #1275) and Phase 225 (PR #1276) already shipped the schema and the 7-route API this UI consumes. This phase is frontend-only (packages/web-core/src/features/pos/), so rollback is a plain code revert with no migration or API-contract change to reason about. The new tab is additive and retail-gated; reverting it removes the tab and its 5 new files with no effect on the F&B workflow or the existing per-order delivery-assignment UI, which this phase does not modify.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1273-PHASE-226-DELIVERY-RUN-UI
---

# POS Delivery Run management UI (Phase 226, #1273/#1270)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff:

- `packages/web-core/src/features/pos/**` -- every new and modified file in this phase sits under
  this prefix, which matches `COMPLIANCE_SENSITIVE_RULES`' dedicated rule
  (`/^packages\/web-core\/src\/features\/pos\//`) -> `surfaces: pos,terminal`, floor `major`.

Not `regulatory`: nothing in this phase touches `packages/web-core/src/features/compliance/`,
`services/complianceService.js`, `services/adminService.js`, `pages/Settings*`, or any tenant-admin
surface. No file under `apps/dgfy-migration-runner/migrations/` is touched -- the migration
checkpoint does not apply.

`related_adr`: ADR 0034 (`manual-delivery-job-foundation.md`), `status: amended`. This phase does
**not** amend it -- the 2026-08-31 amendment (Phase 224) already authorizes the run mechanism this
UI is a *view* over: "Membership is keyed on `delivery_jobs`, never on `packed`... [this] keeps the
mechanism workflow-mode-agnostic and does not lock F&B out." A retail-gated view over a
mode-agnostic mechanism is ordinary implementation work, not a cross-boundary change (Planning
Rule 4 -- no ADR clause is being changed). See `PHASE-226-PLAN.md` section 1 for the full verdict
trail.

## Affected Surfaces

All paths relative to `packages/web-core/src/features/pos/`.

1. `services/deliveryRunService.js` (**new**) -- thin wrappers over Phase 225's 7 routes
   (`/pos/delivery-runs*`), mirroring `services/deliveryPersonnelService.js`'s shape exactly. No
   terminal headers, matching the API's own transport (none of the 7 routes carry
   `requirePairedTerminal`/`requireActiveOperatorForMutation`).
2. `components/DeliveryRunsWorkspacePanel.jsx` (**new**) -- the tab body: master/detail run list +
   selected-run editor, panel-local state modeled on `DeliveryPersonnelManagementPanel.jsx` /
   `EmployeeCreditManagementPanel.jsx`. Owns its own fetches; guards every mutation on
   `!isOnline`/`locked`/`!canTransactPos`, and additionally on `!hasActiveShift` for adding members
   (mirrors `DeliveryAssignmentControl`'s existing guard set). Generates an idempotency key per
   *logical* submit for `PUT .../personnel` and `POST .../members`, held in a ref and reused across
   retries of that same submit (see the 2026-08-31 Amendment below -- the original cut regenerated
   the key on every call, defeating replay safety on a retry).
3. `components/DeliveryRunFormDialog.jsx` (**new**) -- create/edit dialog. `status` is edit-only
   and offers only `draft`/`scheduled`/`cancelled` -- the three values the `PATCH` validator
   accepts; `dispatched`/`completed` (Phase 228's job) are never offered client-side either.
4. `components/DeliveryRunPersonnelEditor.jsx` (**new**) -- whole-roster editor (the API is a
   `PUT` replace, not incremental -- Phase 225's own note that the schema's STORED generated column
   would reject a transient two-accountable/zero-accountable state). A single
   `<input type="radio" name="run-accountable">` group makes "exactly one accountable" structural
   before the request is ever sent. Each row reuses `DeliveryAssignmentControl.jsx`'s exact
   datalist + name-match pattern, so a registry pick sends `delivery_personnel_id` and a typed name
   sends `delivery_personnel_name` -- never both.
5. `components/DeliveryRunMembersList.jsx` (**new**) -- renders a run's member jobs; per-row Remove
   (confirm -> `DELETE`) and Move-to-another-run (confirm -> `DELETE` then `POST members`, in that
   order -- see Compliance Preconditions #3 below for the residual-risk handling this enforces).
6. `components/TerminalOperationsPanels.jsx` -- adds a third, retail-only "Delivery Runs" tab to
   `OrderWorkspaceTabs`/`IncomingQueueWorkspace`. Gate is
   `normalizeWorkflowMode(workflowMode) === 'retail'`, reused verbatim from the existing
   `orderFulfillmentUi.js:56` precedent (**not** `WORKFLOW_PAGE_CAPABILITIES`/
   `isWorkflowPageVisible` -- that is a route-level capability gate, and the run API itself is
   mode-agnostic by design per ADR 0034, so a capability entry would misrepresent the backend). A
   `React.useEffect` resets `activeView` back to `'active'` whenever the mode flips off retail
   while the runs tab is open (`WORKFLOW_MODE_CHANGED_EVENT` can fire mid-session), and the render
   branch itself is additionally guarded by the same `isRetailMode` check.
7. `components/TerminalOperationsWorkspace.jsx` -- threads a new `ensureDeliveryPersonnelLoaded`
   prop into `IncomingQueueWorkspace` so the runs panel's personnel picker reuses
   `TerminalPage.jsx`'s existing single-flight fetch and the state `handleDeliveryPersonnelChanged`
   already keeps live after an admin registry edit (Phase 205 RF-3), instead of forking a second
   independent fetch.
8. `components/TerminalPageLayout.jsx`, `pages/TerminalPage.jsx` -- one prop hop each, threading
   the existing `ensureDeliveryPersonnelLoaded` callback down to `TerminalOperationsWorkspace`. No
   new state introduced at either layer.

## Compliance Preconditions

1. **No unauthenticated access path is introduced.** This phase adds no new route or permission --
   it consumes Phase 225's already-`checkPermission`-gated 7 routes (`pos:view`/`pos:transact`)
   through the existing authenticated API client (`@/services/api`). No new client-side permission
   bypass is possible: `canManage` in `DeliveryRunsWorkspacePanel.jsx` gates every write action on
   the same `canTransactPos`/`locked` props every other POS mutation control already respects.
2. **The accountable-before-members ordering is enforced twice.** The server 409s
   `DELIVERY_RUN_ACCOUNTABLE_REQUIRED` if a run has no accountable person when
   `POST .../members` is called (Phase 225); this UI additionally renders an inline warning ("Set
   an accountable person on this run before adding orders") whenever `hasAccountablePersonnel` is
   false, so the constraint is visible before the operator attempts the action, not only after a
   409. The server remains authoritative either way.
3. **"Move to another run" is DELETE-then-ADD, matching the server's actual constraint** (there is
   no move verb; `POST .../members` 409s `DELIVERY_JOB_ALREADY_IN_RUN` for a job already in a
   different run). This is **not atomic**: if the ADD leg fails after the DELETE leg succeeded, the
   order is left in no run. Mitigated, not eliminated: the confirm dialog states the two-step
   nature up front ("Moving is two separate steps... If the second step fails, the order is left in
   no run and must be re-added from the target run"), and on ADD failure the panel shows a
   persistent (non-auto-dismissing) error toast naming the order and target run, then refreshes
   both runs so the operator can see the order is unassigned and retry the add. A transactional
   server-side move verb is out of scope for this phase and is a candidate to hand to `pm` as a
   follow-up, not filed here. **Since the 2026-08-31 Amendment below, the single largest cause of
   the ADD leg failing -- a target run with no accountable person, which 409s
   `DELIVERY_RUN_ACCOUNTABLE_REQUIRED` -- is prevented client-side**: the target-run picker excludes
   any run without exactly one accountable person, and `handleMoveMember` refuses to even attempt
   the DELETE against such a target. The residual non-atomicity gap (a transient network/server
   failure on the ADD leg itself, after the guard passes) is unchanged and still mitigated only by
   the toast + refresh above.
4. **A locked run (`dispatched`/`completed`) renders read-only client-side**, in addition to the
   server's own `RUN_LOCKED_STATUSES` 409 on `PATCH`/`PUT personnel` -- the personnel editor is
   replaced with a static "this run is read-only" message rather than left interactive against a
   guaranteed-to-fail request.
5. **Every mutation guards on `!isOnline`** with a toast telling the operator to reconnect, matching
   `DeliveryAssignmentControl`'s existing pattern -- no request is attempted while the client knows
   it is offline.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- `npm run build:pos` -- real Vite build (this app's actual compiler), OK.
- `npm run build:skupervisor` -- also required per `.agents/skills/implement/SKILL.md`'s rule that
  a `packages/web-core` change is built for every app it affects: `apps/dgfy-ims/src/main.jsx`
  lazily imports the same `TerminalPage.jsx` tree. OK.
- New `packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx` --
  actually executed (Vitest, `cd apps/dgfy-ims && npx vitest run
  ../../packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx` --
  `apps/dgfy-ims/vite.config.js` is where `packages/web-core`'s own suite runs from, not
  `apps/dgfy-pos`, per that config's own `include` entry and comment), 6/6 passing.
- `npm run check:architecture` -- OK, trivially green (`apps/dgfy-api`-scoped; this phase touches
  no backend file). Run anyway rather than assumed.
- `npm run lint:docs` -- OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above), then
  **pass** once this declaration was added.
- **Not runnable here, stated rather than omitted:** a live acceptance walk (create a run -> set
  personnel -> add a real order -> list -> remove -> move) against a deployed tenant database.
  Phase 225's own declaration carries the same limitation for the API this UI consumes.

## Residual Risks

1. **The "move" operation is not atomic** -- see Compliance Precondition #3 above for the full
   mitigation. A transactional server-side move verb would close this gap but is out of scope here.
   As of the 2026-08-31 Amendment below, the no-accountable-target failure mode is prevented
   client-side; the residual gap is narrower (a transient failure on the ADD leg itself) but not
   closed.
2. **No live acceptance walk was run in this environment.** The Vitest suite exercises the UI logic
   against mocked service calls, not a real backend. Flagged for the PR reviewer / a follow-up QA
   pass once a database is available, same posture as Phases 224/225.
3. **Bulk multi-select ("Add to run" from the Active Queue) is deliberately not built here** --
   Phase 227's job. This phase leaves it the exact seams it needs
   (`fetchDeliveryRuns` for the target-run picker, `addDeliveryRunMembers` which already accepts up
   to 500 ids in one call, and the remove-then-re-add move sequence), all in
   `services/deliveryRunService.js` and none of them private to this panel. The empty-members state
   ("No orders in this run yet. Add orders from the Active Queue.") states this honestly rather than
   implying bulk-add already exists.
4. **`delivery_run_id` is not yet surfaced on an Active-Queue order** (it is not in
   `buildTransactionInclude()`'s `deliveryJob` attribute whitelist,
   `apps/dgfy-api/src/modules/pos/repositories/posRepository.js:834-853`), so the Active Queue
   cannot today show "already in run X" inline. Named in Phase 225's own declaration as Phase 227's
   first backend task; unchanged by this phase.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.

## Amendments

### 2026-08-31: RF-1/RF-2/RF-3 fixes -- idempotency retry retention, no-accountable move target, stale-response guard

PR #1277 review (pr-reviewer, blockers RF-1/RF-2/RF-3):

- **RF-1.** The personnel-save (`PUT .../personnel`) and move-ADD (`POST .../members`) idempotency
  keys were generated fresh inside their handlers on every call, so retrying the *same* user submit
  after a transient failure sent a *new* key -- defeating the whole point of an idempotency key
  (recognizing a retry as a replay rather than a fresh write). Fixed by holding the key in a ref per
  logical submit: `personnelSubmitRef` (keyed on a JSON snapshot of the personnel payload -- an
  identical retry reuses the key, a genuinely edited roster gets a new one) and
  `moveAddSubmitRef` (keyed on the `(posTransactionId, targetRunId)` pair). Both clear on success so
  the next distinct submit starts clean. Covered by two new tests asserting the key is byte-identical
  across a failed-then-retried call.
- **RF-2.** The move-to-another-run target picker allowed selecting a run with no accountable
  person, so the DELETE leg succeeded and the ADD leg 409d on `DELIVERY_RUN_ACCOUNTABLE_REQUIRED` --
  leaving the order in no run, surfaced only as a generic error (see Compliance Precondition #3
  above). Fixed two ways: `DeliveryRunMembersList.jsx`'s `moveTargets` filter now excludes any
  candidate run without exactly one accountable person from the picker entirely, and
  `handleMoveMember` independently refuses to attempt the DELETE at all if the resolved target
  lacks an accountable roster (defense in depth against any caller that bypasses the picker).
  Covered by a new negative test asserting `removeDeliveryRunMember` is never called when the only
  available target has no accountable person.
- **RF-3.** A location-scope switch (`queueLocationScopeId` changing) could leave stale,
  wrong-location data visible: an older `fetchDeliveryRuns` response resolving after a newer one
  could overwrite `runsState`, and `selectedRunId`/`runDetailState` were never cleared on the scope
  change, so a previously selected run's detail could keep rendering under the new location -- a
  cross-location data leakage risk in a multi-location tenant. Fixed with a request-generation
  counter per fetch kind (`runsRequestIdRef`, `runDetailRequestIdRef`) so a response is committed
  only if it's still the most recent request in flight, plus a dedicated effect that clears
  `selectedRunId`/`runDetailState` synchronously the moment `queueLocationScopeId` changes, without
  waiting for the new fetch to resolve. Covered by two new tests: one starting a slow
  `fetchDeliveryRuns` for the old scope, switching scope before it resolves, and asserting the stale
  response never renders; one asserting the selected run's detail panel is gone immediately after a
  scope switch even while the next fetch never resolves.

No new file, no schema change, no new route -- all three fixes are contained to the same three files
this declaration already lists (`components/DeliveryRunsWorkspacePanel.jsx`,
`components/DeliveryRunMembersList.jsx`, and the test file). Classification, surfaces, and every
Compliance Precondition/Residual Risk not called out above are unchanged.

Verification for this amendment: `npm run build:pos` OK, `npm run build:skupervisor` OK, the full
`packages/web-core` Vitest suite (308 files / 1904 tests) passing including the 5 tests added here,
`npm run check:architecture` OK (trivially green, no backend file touched), `npm run lint:docs` OK,
`npm run check:compliance` re-run against this amendment.
