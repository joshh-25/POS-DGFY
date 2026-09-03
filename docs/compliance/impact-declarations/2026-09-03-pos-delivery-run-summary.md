---
status: reference
owner: engineering
last_reviewed: 2026-09-03
declaration_id: 2026-09-03-pos-delivery-run-summary
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.03
verification_evidence: apps/dgfy-api/tests/deliveryRunSerializer.test.js -- actually executed (Jest), new, 6 passing (order-field mirroring; summary absent on the list-endpoint shape (members not hydrated); all-zero summary for a run with no members; expected/settled/outstanding math across a paid/partially_paid/unpaid trio; delivered_order_count reads DeliveryJob.status independent of the order's own fulfillment_status; a freshly created run reports an all-zero summary, not an absent one),apps/dgfy-api/tests/deliveryRun.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/deliveryRunDispatch.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/deliveryRunRoutes.transport.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/deliveryRunWriteThrough.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/posValidator.deliveryRun.test.js -- actually executed (Jest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- actually executed (Vitest, run from apps/dgfy-ims), new case added (renders the run-level summary block: total expected, total settled, outstanding, delivered/total counts), 18 passing in this file,packages/web-core/src/features/pos/__tests__/deliveryRunQueueFilter.behavior.test.jsx -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/deliveryRunSplitViewDnd.behavior.test.jsx -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/deliveryRunDispatch.behavior.test.jsx -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/deliveryRunBulkAssign.behavior.test.jsx -- actually executed (Vitest), unchanged, regression-clean,node --check on every changed apps/dgfy-api .js file,npm run build:pos -- OK (real Vite build, Tier 0 compiler check),npm run build:skupervisor -- OK (real Vite build, Tier 0 compiler check for the second app that also consumes packages/web-core's pos feature),npm run check:architecture -- OK, zero new allowlist entries,npm run check:adr -- OK,npm run check:compliance -- confirmed to fail first (listing every touched compliance-sensitive file below), then pass once this declaration was added
rollback_note: No schema change and no migration in this phase -- every change is additive read shaping (a widened Sequelize `attributes:` allowlist on an existing include, two extra serializer fields per member, one new computed `summary` object on the response, and a client-side render block reading that object). Rollback is a plain revert of these four files (deliveryRunRepository.js, deliveryRunSerializer.js, DeliveryRunsWorkspacePanel.jsx, and removing the new DeliveryRunSummary.jsx) -- no data was written, no existing field's meaning changed, and no existing response field was removed or renamed, so a revert is safe at any time with no follow-up cleanup.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-03T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1487-POS-DELIVERY-RUN-SUMMARY
---

# Delivery Run summary: total expected, total settled, delivered-order count (Phase 264, #1487)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff -- run before this declaration existed, it failed and listed:

- `apps/dgfy-api/src/modules/pos/repositories/deliveryRunRepository.js`,
  `apps/dgfy-api/src/modules/pos/serializers/deliveryRunSerializer.js` -- match the
  `modules/pos/` rule -> `surfaces: pos,terminal`, floor `major`.
- `packages/web-core/src/features/pos/components/DeliveryRunsWorkspacePanel.jsx`,
  `packages/web-core/src/features/pos/components/DeliveryRunSummary.jsx` -- match the frontend
  POS-surface rule.

Not `regulatory`: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, or a tenant-admin surface. `related_adr: none` -- no ADR governs delivery-run
reporting; `0034-manual-delivery-job-foundation.md` (the ADR governing the delivery-run/personnel/
job domain generally) has zero mentions of settlement/expected-amount reporting and is not amended
by this phase -- this is a read-shaping/reporting change, not a change to who may assign/dispatch/
complete a delivery or to any payment-recording path.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/repositories/deliveryRunRepository.js` -- `getRunDetail`'s
   `PosTransaction` attribute allowlist (the nested `transaction` include under each member's
   `DeliveryJob`) widens from `[pos_transaction_id, invoice_number, customer_name,
   delivery_address, fulfillment_status, order_source, order_method, location_id]` to add
   `total_amount, amount_paid, balance_due, payment_status`. Same hydration trap already documented
   on this include (Phase 228's own comment, still present): omit one of these here and it comes
   back silently `undefined` on every member rather than a query error -- this widening is the only
   way the summary below can be computed at all, since `getRunDetail` already hydrates every member
   transaction in one query and nothing downstream re-queries per order.
2. `apps/dgfy-api/src/modules/pos/serializers/deliveryRunSerializer.js` --
   - `serializeDeliveryRunMember`'s `order` object mirrors the four widened fields (read-only
     passthrough, no transformation).
   - New `buildDeliveryRunSummary(members)`: reduces over the run's already-serialized members
     (the in-JS reduce pattern used by `posRepository.js`'s `buildReportShiftMoney`, with the same
     `round4` rounding convention -- not a SQL aggregate, since `getRunDetail` already hydrates
     every member in one query and a second aggregate query would be redundant). No backend
     "settled" helper existed anywhere else in this codebase before this phase -- every other call
     site (`posDeviceUseCases.js:66`, `posUseCases.js:9163`) inlines `balance_due <= 0` for a
     single order; this is the run-level equivalent, defined from scratch. Produces:
     - `total_expected_amount` -- sum of each member's `order.total_amount` (issue #1487's own
       wording: "sum of order totals in the run").
     - `total_settled_amount` -- sum of each member's `order.amount_paid` (issue #1487's own
       wording: "sum of amounts actually collected/paid across the run's orders"). A
       `partially_paid` downpayment-split order contributes only the partial `amount_paid` already
       on record -- its remaining `balance_due` is **not** counted as settled until a later payment
       actually raises `amount_paid`. An `unpaid` COD order contributes `0` until the courier's
       collection is recorded as a payment against the order through the existing
       payment-recording path (`BalanceSettlementDialog.jsx` / the balance-settlement use case) --
       there is no separate COD money field or code path to special-case here; COD settlement
       updates `amount_paid`/`payment_status` the same way any other tender does.
     - `total_outstanding_amount` -- `total_expected_amount - total_settled_amount`, equivalently
       the sum of each member's `balance_due`. Not one of #1487's own three named numbers, but
       trivially derivable from the two above and the natural "how much is still owed on this run"
       answer a mid-run glance needs; kept in scope as a same-cost addition to the one reduce pass
       rather than filed as a follow-up.
     - `delivered_order_count` / `total_order_count` -- counts `DeliveryJob.status === 'delivered'`
       (the job's own status; `posUseCases.js`'s `DELIVERY_JOB_STATUS_TRANSITIONS` state machine)
       against every member in the run. Deliberately reads the job's status, not the order's
       separate `fulfillment_status` -- the two are independent state machines and a job can be
       `delivered` before or after the order's own `fulfillment_status` is separately advanced.
   - `serializeDeliveryRun` computes `summary` from `resolvedMembers` and only includes it in the
     response `if (resolvedMembers !== null)` -- i.e. only when member orders were actually
     hydrated for this call. The list endpoint (`serializeDeliveryRun(run, { memberCount })`) never
     hydrates per-member `deliveryJobs`/`transaction` data, so `resolvedMembers` stays `null` there
     and `summary` is omitted entirely rather than rendering a false all-zero block. A freshly
     created run (`serializeDeliveryRun(run, { members: [] })`, the `POST /delivery-runs` response)
     passes an explicit empty array, which is not `null`, so it *does* get a summary -- correctly
     all-zero, not absent, since a real (empty) member set was resolved.
3. `packages/web-core/src/features/pos/components/DeliveryRunSummary.jsx` (**new**) -- renders the
   four totals plus the delivered/total count as a small stat block, reading `selectedRun.summary`.
   Renders nothing (`return null`) when `summary` is absent, matching the serializer's own
   null-vs-absent distinction above -- never shows a misleading zero for data that was never
   fetched.
4. `packages/web-core/src/features/pos/components/DeliveryRunsWorkspacePanel.jsx` -- imports and
   renders `<DeliveryRunSummary summary={selectedRun.summary} />` in the run detail pane,
   immediately above the existing `<DeliveryRunDispatchSummary />` block. `selectedRun` is
   `runDetailState.run`, populated by `fetchDeliveryRun` (the `GET /delivery-runs/:id` response,
   which always hydrates members) and refreshed via the panel's existing `refreshAll()` after every
   mutation (personnel save, member add/remove/move, dispatch) -- no new fetch/refresh wiring was
   needed, the summary simply rides along on every response that already carries `members`.

## What this phase deliberately does NOT do

1. **No new route, no new permission check.** `GET /pos/delivery-runs/:id` already existed from
   Phase 225 and already sits behind the same `checkPermission` gate; this phase only widens what
   that existing, already-authorized read returns.
2. **No write path.** `total_expected_amount`/`total_settled_amount`/`total_outstanding_amount`/
   `delivered_order_count` are all derived, response-only values -- nothing in this phase writes to
   `pos_transactions` or `delivery_jobs`. Money is still only ever recorded through the existing
   payment-recording paths (balance settlement, order payment collection); this phase only reads
   and summarizes what those paths already wrote.
3. **No "settled order count" was added**, only settled *amount*. #1487's own wording asks for a
   sum of amounts, not a count of fully-settled orders; a `balance_due <= 0` order-count stat was
   considered and left out as out-of-scope for this phase's literal ask -- straightforward to add
   later from the same reduce pass if a follow-up asks for it.
4. **`apps/dgfy-api/src/modules/store/**` and `models/index.js` associations were not touched** --
   explicitly out of scope for this phase (owned by the parallel Phase P-5, #1492).

## Compliance Preconditions

1. **No unauthenticated or newly-authorized access path is introduced.** Confirmed above -- zero
   new routes, zero permission-check changes.
2. **The summary is never computed from unhydrated data.** `serializeDeliveryRun` gates `summary`
   behind `resolvedMembers !== null` specifically so the list endpoint (which never loads per-order
   money fields) cannot silently report an all-zero summary that looks like a real "nothing
   collected yet" answer. Pinned by the serializer test's own "absent on the list-endpoint shape"
   case.
3. **A partially-paid or COD order can never be miscounted as fully settled.** `total_settled_amount`
   sums `amount_paid`, never `total_amount` and never treats a non-`unpaid`/non-`partially_paid`
   `payment_status` as a shortcut for "fully collected" -- it always sums the actual money column.
   Pinned by the serializer test's paid/partially_paid/unpaid trio case.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- New `apps/dgfy-api/tests/deliveryRunSerializer.test.js` -- actually executed (Jest), all 6 cases
  passing.
- Full delivery-run backend suite (`deliveryRun*` glob, 6 files) -- actually executed (Jest), 86
  passing, zero regressions.
- New case in `packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx`
  -- actually executed (Vitest, run from `apps/dgfy-ims` per `docs/architecture/frontend-split-sync.md`
  -- `packages/web-core` tests do not run from `apps/dgfy-pos` despite that app owning the build),
  18 passing in this file.
- Full delivery-run frontend suite (`deliveryRun*` glob, 8 files) -- actually executed (Vitest), 109
  passing, zero regressions.
- `node --check` on every changed `.js` file in `apps/dgfy-api` (its own `build` script is a
  no-op, so this is the real Tier 0 check for that app per `.agents/skills/implement/SKILL.md`).
- `npm run build:pos` -- OK, a real Vite build, the Tier 0 compiler check for the frontend half
  owning `DeliveryRunsWorkspacePanel.jsx`.
- `npm run build:skupervisor` -- OK, a real Vite build. `apps/dgfy-ims` also consumes
  `packages/web-core`'s `features/pos` tree (confirmed via `apps/dgfy-ims/src/main.jsx`), so this
  is the second affected app's own Tier 0 check per this phase's shared-trunk change.
- `npm run check:architecture` -- OK, zero new allowlist entries needed.
- `npm run check:adr` -- OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Known gap, stated rather than hidden**: no test in this codebase exercises the widened
  `attributes:` allowlist against a real MySQL query (no local MySQL/Redis reachable in this
  environment). The serializer tests exercise the summary math directly against plain objects
  shaped like what `getRunDetail` hydrates; the Sequelize `attributes:` array itself is unverified
  against a live tenant database. Same honesty framing as Phase 225's and Phase 260's own
  declarations for this same repository file.

## Residual Risks

1. **The widened `attributes:` array is unverified against a real MySQL query planner** -- see
   "Known gap" above. Low risk (this is a straightforward additive column list on an existing,
   already-working include, not a new join or predicate), but flagged for the PR reviewer / a
   follow-up QA pass once a database is available, matching this repository's own precedent.
2. **No "settled order count" stat** -- see "What this phase deliberately does NOT do" above. Not a
   defect against #1487's own wording, but worth naming as a natural follow-up if a future request
   asks for it.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-1487-POS-DELIVERY-RUN-SUMMARY`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
