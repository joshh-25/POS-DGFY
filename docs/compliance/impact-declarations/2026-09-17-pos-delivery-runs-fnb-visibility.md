---
status: reference
owner: engineering
last_reviewed: 2026-09-17
declaration_id: 2026-09-17-pos-delivery-runs-fnb-visibility
classification: major
surfaces: pos,terminal
reason_codes_impacted: DELIVERY_RUN_UNPACKED_MEMBERS,DELIVERY_RUN_ACCOUNTABLE_REQUIRED,DELIVERY_RUN_LOCKED,DELIVERY_RUN_LOCATION_MISMATCH,DELIVERY_JOB_ALREADY_IN_RUN,DELIVERY_ASSIGNMENT_NOT_RUN_OWNED,DELIVERY_RUN_NOT_FOUND,DELIVERY_RUN_MEMBER_NOT_FOUND,DELIVERY_JOB_ASSIGNMENT_LOCKED,DELIVERY_PERSONNEL_NOT_AVAILABLE,POS_LOCATION_ACCESS_DENIED
policy_version: 2026.09.17
verification_evidence: npm run build:pos -- real Vite build, OK,npm run build:skupervisor -- real Vite build, OK (apps/dgfy-ims consumes the same shared TerminalOperationsPanels tree via packages/web-core),focused Vitest suites run from apps/dgfy-ims -- 82/82 passing across deliveryRunsWorkspace, deliveryRunSplitViewDnd, deliveryRunBulkAssign, deliveryRunQueueFilter, deliveryRunLoading, deliveryRunDispatch -- plus 113/113 across 7 adjacent suites (incomingQueueRunMemberFulfillmentGate, terminalViewModeContracts, terminalBalanceSettlement, terminalDownpaymentVisibility, incomingQueueViewMode, webViewStringCompat, orderFulfillmentUi),npm run check:architecture -- OK (55 modules, 588 files; controller boundaries OK),npm run lint:docs -- OK (30 governed docs, 90 ADRs),production-build preview smoke -- vite preview serves HTTP 200 app shell,npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added,RF-1/RF-2 review follow-up -- dgfy-pos + dgfy-ims 1.18.0 -> 1.19.0 minor bumps per propose-version-level, QueueOrderTableView conditional indentation fix, 151/151 focused + adjacent tests re-run green
rollback_note: No schema, API, permission, or route change in this phase -- the run API consumed here is Phase 225's (PR #1276) and the remittance/loading APIs are Phases 333-334's, all unchanged. This phase is frontend-only (packages/web-core/src/features/pos/ plus two governed docs), so rollback is a plain code revert with no migration or API-contract change to reason about. Reverting restores the retail-only tab gate; F&B tenants lose the tab again but no data-layer access changes either way, since the API was and remains mode-agnostic.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-17T08:30:00.000Z
preflight_request_ref: PREFLIGHT-LOCAL-2026-09-17-POS-DELIVERY-RUNS-FNB
---

# Delivery Runs workspace visible to F&B tenants in POS (Phase 337, #1924)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff:

- `packages/web-core/src/features/pos/**` -- every modified source and test file in this phase
  sits under this prefix, which matches `COMPLIANCE_SENSITIVE_RULES`' dedicated rule
  (`/^packages\/web-core\/src\/features\/pos\//`) -> `surfaces: pos,terminal`, floor `major`.

Not `regulatory`: nothing in this phase touches `packages/web-core/src/features/compliance/`,
`services/complianceService.js`, `services/adminService.js`, `pages/Settings*`, or any tenant-admin
surface. No file under `apps/dgfy-migration-runner/migrations/` is touched -- the migration
checkpoint does not apply.

`related_adr`: ADR 0034 (`manual-delivery-job-foundation.md`), `status: amended`. This phase does
**not** amend it -- the 2026-08-31 amendment already authorizes the mechanism this UI is a view
over ("Membership is keyed on `delivery_jobs`, never on `packed`... [this] keeps the mechanism
workflow-mode-agnostic and does not lock F&B out"), and the 2026-09-01 amendment already decides
that F&B dispatch skips the packing precondition. Widening the *view* from retail-only to
retail + F&B over that already-mode-agnostic mechanism is ordinary implementation work, not a
cross-boundary change (Planning Rule 4 -- no ADR clause is being changed).

## Affected Surfaces

All paths relative to `packages/web-core/src/features/pos/`.

1. `components/TerminalOperationsPanels.jsx` -- introduces the shared `isDeliveryRunMode`
   predicate (`normalizeWorkflowMode(workflowMode)` is `retail` or `fnb`; services and every
   other mode stay excluded) and uses it for the Delivery Runs / Queue + Run tab props, the
   `runs`/`split` render branches, the run-option fetch enablement, the bulk-assign bar, the
   queue run filter, the per-order selection checkbox, and the run label. The mode-flip reset
   effect now falls back to Active Queue and clears run-only selection/filter state only when
   leaving the supported modes -- a retail <-> F&B flip keeps the run surface open. `isRetailMode`
   is retained unchanged for genuinely retail-only presentation (the packed fulfillment
   affordance via `orderFulfillmentUi.js`, untouched). No permission, shift, lock, online,
   location, or accountable-person guard is weakened: every run mutation keeps its existing
   `canTransactPos`/`locked`/`isOnline`/`hasActiveShift` gate.
2. `components/DeliveryRunsWorkspacePanel.jsx` -- takes a new `isRetailMode` prop (default
   `true`, preserving the historical behavior for direct renders) and applies the client-side
   packed-order dispatch preflight (`unpackedMembers`, the "Every order must be packed" notice,
   and its leg of `dispatchDisabled`) only when true. For F&B the notice never renders and the
   preflight never blocks; the server 409 (`DELIVERY_RUN_UNPACKED_MEMBERS`) stays the real gate
   for retail, exactly as before. No other panel behavior changes.
3. `hooks/useDeliveryRunOptions.js` -- comment-only change documenting that `enabled` now covers
   retail + F&B; the fetch itself is unchanged.
4. `components/IncomingQueueOrderList.jsx`, `components/QueueOrderTableView.jsx`,
   `components/QueueRunAssignBar.jsx` -- the bulk-select checkbox prop is renamed
   `isRetailMode` -> `isDeliveryRunMode` (it gates only run-assignment selection, never retail
   packing presentation) and the assign-bar header comment is updated. No behavior change beyond
   receiving the widened predicate value from the caller.
5. `__tests__/deliveryRunsWorkspace.behavior.test.jsx`,
   `__tests__/deliveryRunSplitViewDnd.behavior.test.jsx`,
   `__tests__/deliveryRunBulkAssign.behavior.test.jsx`,
   `__tests__/deliveryRunQueueFilter.behavior.test.jsx`,
   `__tests__/deliveryRunDispatch.behavior.test.jsx` -- the suites that encoded the old
   retail-only contract now assert retail + F&B visibility, services exclusion (tabs hidden, no
   run fetch), supported-mode flip retention (tabs, split view, queue filter value), unsupported-
   mode reset, and the retail-vs-F&B dispatch-preflight split (F&B unpacked member dispatches
   with no notice; retail stays blocked with the notice).
6. `docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md` -- the "Delivery run management UI" and queue-
   filter sections now state the workspace is visible in retail and F&B while membership stays
   mode-agnostic and the packed dispatch precondition stays retail-only.
7. `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` -- Phase 337 entry; no renumbering.

## Compliance Preconditions

1. **No unauthenticated access path is introduced.** This phase adds no new route or permission --
   it surfaces Phase 225's already-`checkPermission`-gated run routes (`pos:view`/`pos:transact`)
   to a second workflow mode through the existing authenticated API client. The F&B operator still
   needs the same `pos:view` to see runs and `pos:transact` plus an open shift at the order
   location to mutate them; `canManage`/`canTransactPos`/`locked`/`isOnline`/`hasActiveShift`
   gating is byte-identical for both modes.
2. **The packed precondition is narrowed nowhere it matters.** Retail keeps the exact
   client-side preflight and server 409 it had; F&B never had the packing requirement at the
   data layer (membership never checked `fulfillment_status`), so showing F&B the workspace
   without the preflight removes a misleading block, not a real guard. The backend contract is
   untouched -- a retail dispatch with unpacked members still 409s.
3. **Services and other modes gain nothing.** The predicate is an explicit two-mode allowlist,
   not a negation of services; any future mode must be deliberately added with its own
   product/API decision. Services renders no run tabs, issues no run fetch, and keeps no
   run-only selection/filter state.
4. **Mode and viewport transitions cannot strand run-only UI.** The reset effect covers both the
   supported-mode exit (tabs, selection, filter) and the `<768px` viewport exit (split view),
   each asserted by a dedicated test; the render branches carry the same guards belt-and-braces.
5. **Cash custody and remittance posture is unchanged.** This phase neither implements nor shows
   remittance UI; collection/remittance/variance semantics from Phase 334 (#1887/ADR 0083) are
   untouched, and provider-owned jobs stay read-only exactly as before.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- `npm run build:pos` -- real Vite build (this feature's actual consumer), OK.
- `npm run build:skupervisor` -- also required per the implement skill's shared-trunk rule, OK.
  `npm run build:store` recorded as not required: the changed shared import graph does not reach
  the storefront (verified: only the untouched `skupervisorHandoff.js` util is shared).
- Focused Vitest suites (run from `apps/dgfy-ims`, where the shared suite executes): 82/82
  passing across the six delivery-run suites, plus 113/113 across seven adjacent suites covering
  the fulfillment gate, view-mode contracts, settlement, downpayment visibility, queue view mode,
  webview-string compat, and the fulfillment-UI unit contract.
- `npm run check:architecture` -- OK. `npm run lint:docs` -- OK.
- Production-build preview smoke -- `vite preview` serves the built POS shell (HTTP 200).
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Not runnable here, stated rather than omitted:** rendered POS proof at logged-in depth
  (retail + F&B at desktop/tablet widths, F&B below 768px, opening Delivery Runs, one primary
  run interaction) and the live staging F&B end-to-end walk (create/configure run, add eligible
  COD order, loading, dispatch, delivery-status advance, cash collection, remittance) -- flagged
  for the PR reviewer / verifier once a deployed environment is available, same posture as
  Phases 226/333/334.

## Residual Risks

1. **F&B dispatch has no client-side packing backstop by design** -- an F&B operator can dispatch
   a run whose members would read as "unpacked" in retail terms. This is the authorized contract
   (ADR 0034, 2026-09-01 amendment), not a gap: the server applies no packing gate for F&B, so a
   client-side block would be a false gate. Retail's backstop is unchanged.
2. **No live acceptance walk was run in this environment.** The Vitest suites exercise the UI
   logic against mocked service calls, not a real backend -- same limitation every prior
   delivery-run phase declared.
3. **The pre-existing `check:app-versions` FAILs for `dgfy-api`/`dgfy-migration-runner`
   (shared-constants fan-out) reproduce on a clean checkout** and are unrelated to this phase,
   which touches no versioned package; the affected apps (`dgfy-ims`, `dgfy-pos`) pass.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.

## Amendments

### 2026-09-17: RF-1/RF-2 review follow-up -- app minor bumps, table conditional indentation

PR #1956 review (pr-reviewer, should-fix RF-1, nit RF-2):

- **RF-1.** `propose-version-level.js --base origin/develop` proposes `minor` for `dgfy-pos` and
  `dgfy-ims` (via `packages/web-core`), but the actual bump was `none` (1.18.0 -> 1.18.0).
  Fixed by bumping both apps to 1.19.0 with lockfiles re-synced (`npm install`, lockfile diffs
  contain only the version fields). `dgfy-storefront` is n/a -- the changed graph does not reach
  it. No promotion-leg deferral needed.
- **RF-2.** `QueueOrderTableView.jsx`'s `{isDeliveryRunMode && (` openers sat at inconsistent
  indentation (16 spaces in `<thead>`, 12 in `<tbody>` -- pre-existing, preserved by the rename).
  Fixed to 12/16 spaces respectively, matching the surrounding `<th>`/`<td>` siblings. No
  behavior change.

No new file, no schema change, no new route, no classification/surface change -- both fixes are
contained to the files this declaration already lists plus the two app manifests. Every
Compliance Precondition and Residual Risk above is unchanged.

Verification for this amendment: focused + adjacent Vitest suites re-run (151/151 passing,
including the table-view suites), `node scripts/propose-version-level.js --base origin/develop`
now shows the minor bumps applied, `git diff --check` clean, `npm run check:compliance` re-run
against this amendment.
