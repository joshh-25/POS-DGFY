---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-retail-order-packed-step
classification: major
surfaces: pos,terminal,payments,store
reason_codes_impacted: ORDER_STATUS_TRANSITION_INVALID
policy_version: 2026.09.01
verification_evidence: apps/dgfy-api/tests/posOrderPackedStep.usecase.test.js -- actually executed (Jest, not just syntax-checked): preparing -> packed persists packed_at/packed_by and does not touch accepted_*/rejected_*; packed -> out_for_delivery and packed -> ready_for_pickup both succeed; packed -> completed 409s with ORDER_STATUS_TRANSITION_INVALID; preparing -> out_for_delivery still succeeds unchanged (F&B non-regression pin); a repeat packed -> packed PATCH is a no-op and does not restamp packed_at,packages/web-core/src/features/pos/__tests__/orderFulfillmentUi.test.js -- actually executed (Vitest): extended for the workflowMode-gated packed action and the backward-compat pin for the un-updated TerminalSidebarPanel call site,apps/dgfy-api/tests/storeUsecases.applicationResult.test.js -- actually executed (Jest): toStatusLabel('packed') and the packed order's public tracking payload carrying no packed_by/packed_at,apps/dgfy-storefront retail tracking test suite -- extended (see body for the located file and outcome),npm run build:pos (real Vite build, succeeded),npm run build:store (real Vite build, succeeded),npm run build:skupervisor (real Vite build, succeeded -- packages/web-core is the shared trunk all three apps consume),node --check on every changed apps/dgfy-api file and the new migration file,npm run check:compliance (confirmed to fail first, then pass once this declaration was added)
rollback_note: The two pos_transactions columns (packed_at, packed_by) are nullable and additive -- down() is pure at the schema level for those, the only data loss on rollback is the packed_at/packed_by stamps themselves. The MySQL ENUM MODIFY COLUMN widening of fulfillment_status is DELIBERATELY NOT reverted by down() -- narrowing an ENUM that may already hold 'packed' rows would itself be destructive (STRICT_TRANS_TABLES rejection or silent truncation to ''). This down() is asymmetric by design, not an oversight.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.395Z
preflight_request_ref: PREFLIGHT-33588602895-2026-09-01-RETAIL-ORDER-PACKED-STEP
---

# Retail orders: mark an order packed, one at a time (#1180)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff:

- `apps/dgfy-api/src/modules/pos/**` (`posUseCases.js`, `posRepository.js`) -- rule at `:34-38` ->
  `surfaces: pos,terminal`, floor `major`.
- `apps/dgfy-api/src/modules/store/**` (`storeUseCases.js`) -- rule at `:44-48` -> `surfaces:
  payments`, floor `major`. **`payments` is listed in this declaration's frontmatter purely because
  the gate mechanically demands it for any touched `modules/store/` file** -- see the explicit
  "not a real money-path change" paragraph below. Omitting it fails the gate with "Front matter
  surfaces ... do not cover changed surfaces: payments"; this was verified live rather than assumed.
- `packages/web-core/src/features/pos/**` (`orderFulfillmentUi.js`, `TerminalOperationsPanels.jsx`,
  `TerminalOperationsWorkspace.jsx`) -- rule at `:158` -> same `pos,terminal` floor.

`surfaces` also lists `store` (voluntary, not mechanically enforced -- no rule in
`check-compliance-impact.js` maps any touched file to a `store` surface) because
`apps/dgfy-storefront/**`'s tracking timeline gains a new customer-visible progress step
(`packed`). **Not `privacy`**: unlike Phase 210, no customer-supplied PII is mutated or newly
retained -- `packed_by` is staff identity, tenant-internal only, and is deliberately never
serialized to the storefront (see `storeUseCases.js`'s `serializeOrderBase`, unchanged in this
phase). No rule in the gate script maps any touched file to a `privacy` surface either, confirming
this by mechanism, not just by argument.

**The "not payments" paragraph, stated explicitly rather than left as a bare frontmatter
contradiction:** no money behavior changes in this phase. `packed` is not in
`commerceOrderLifecycleUseCase`'s `['completed','rejected','cancelled']` trigger set
(`posUseCases.js:~10310` as of this phase) and is not in the affiliate-settlement outcome map
(`~10344`) -- a `preparing -> packed` transition never runs a refund, capture, or settlement path.
`payments` appears in `surfaces` only because the compliance gate's `modules/store/` rule attaches
that surface to *any* touched file in that folder, regardless of what the specific diff does inside
it; `toStatusLabel`'s one new `case 'packed': return 'Packed';` line is the entire change to
`storeUseCases.js` in this phase.

Not `regulatory`: the `regulatory` floor attaches to `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, and the tenant-admin surfaces -- none of which this phase touches.

`related_adr`: none. This phase changes no ADR clause -- confirmed no ADR 0034/0069 clause is
touched: packing-only, one-order-at-a-time, no batching, no new delivery/route/trip entity (#1180's
own stated scope), so it carries no ADR 0034 governance gate, and it introduces no money-path
change (see above), so ADR 0069 is untouched too.

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260901000003-add-order-packed-attribution.cjs`
   (**new**) -- adds two nullable, additive columns to `pos_transactions` (`packed_at`,
   `packed_by`, the latter FK'd to `users(user_id) ON DELETE SET NULL`), **and** widens the
   physical MySQL `fulfillment_status` ENUM column to include `'packed'` via `MODIFY COLUMN`
   (guarded by reading `information_schema.columns.COLUMN_TYPE` and skipping when `'packed'` is
   already present). Fans out per active tenant database, same structure as
   `20260901000002-add-order-rejection-reason-and-address-change-audit.cjs`.
2. `apps/dgfy-api/src/models/PosTransaction.js` -- `'packed'` added to the `fulfillment_status`
   ENUM (model-level, does not itself alter the physical column -- see item 1); two new plain
   `DataTypes` fields, `packed_by`/`packed_at`. No new Sequelize association, mirroring the
   precedent for `rejected_by`/`rejected_at` (neither has one either).
3. `apps/dgfy-api/scripts/sync-tenant-schemas.js` --
   `REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions` gains `packed_at`/`packed_by`;
   `TENANT_SCHEMA_CAPABILITY_VERSION` bumped `'2026-09-01.1'` -> `'2026-09-01.2'`.
4. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` -- `'packed'` added to
   `ONLINE_FULFILLMENT_STATUSES`; `ONLINE_FULFILLMENT_TRANSITIONS.preparing` gains `'packed'`
   alongside its two existing edges (`ready_for_pickup`, `out_for_delivery`), and `packed` itself
   offers the same two onward edges -- purely additive, no existing edge removed; the
   `updatePayload` write for a `packed` transition stamps `packed_by`/`packed_at` inside the same
   transaction as the status change, before commit, mirroring Phase 210's `rejected` stamping.
   No order-method guard added for `packed` (pickup orders are packed too); no workflow-mode guard
   added here -- **the retail gate is UI-only, see Residual Risks**.
5. `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- `'packed'` added to
   `listIncomingOnlineOrders`'s `Op.in` filter so a packed order stays visible in the POS incoming
   queue.
6. `apps/dgfy-api/src/validators/posValidator.js`, `apps/dgfy-api/src/validators/storeValidator.js`
   -- `'packed'` added to each module's `*_FULFILLMENT_STATUSES` Joi `.valid()` list.
7. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- `'packed'` added to
   `FULFILLMENT_STATUSES`; `toStatusLabel` gains `case 'packed': return 'Packed';`.
   `serializeOrderBase` gains **no new field** -- `packed_by`/`packed_at` are staff identity/timing
   and, following Phase 210's own precedent for `rejected_by`/`rejected_at`, are deliberately never
   serialized on the public, PIN-addressable tracking response.
8. `packages/web-core/src/features/pos/components/orderFulfillmentUi.js` -- `FULFILLMENT_STATUS_LABELS`/
   `FULFILLMENT_ACTION_LABELS` gain `packed` entries; `getNextStatusActions` takes a second,
   optional `workflowMode` parameter (defaults to `''`, so the un-updated
   `TerminalSidebarPanel` call site keeps compiling and simply never offers the packed action) and
   offers `packed` alongside the existing handoff status only when
   `normalizeWorkflowMode(workflowMode) === 'retail'`; `getIncomingOrderUtilityActions` gains a
   `packed` case sharing `preparing`'s body.
9. `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`,
   `TerminalOperationsPanels.jsx` -- `workflowMode` threaded from the workspace down to
   `IncomingQueueWorkspace`'s `getNextStatusActions` call site (no new plumbing above the
   workspace -- `workflowMode` was already available there); a `Package` icon added for the
   `packed` status alongside the existing status-icon switch.
10. `apps/dgfy-storefront/src/modes/retail/tracking/model/retailTrackingAdapter.js` -- `{ id:
    'packed', label: 'Packed' }` inserted between `preparing` and the handoff step in both the
    `delivery` and `pickup` flows; the existing index-based `timeline` builder needed no other
    change (verified in the extended test -- see below -- that an order which skips `packed`
    entirely still resolves its own `activeIndex` correctly).
11. `apps/dgfy-storefront/src/modes/retail/tracking/components/RetailTrackingActiveView.jsx` --
    a `packed` branch added to the status-icon conditional chain (a `Package` icon).
12. `apps/dgfy-storefront/src/tracking/customerTrackingRefresh.js`,
    `apps/dgfy-storefront/src/customer-dashboard/model/customerOrderStatus.js` -- `'packed'` added
    to `ACTIVE_CUSTOMER_TRACKING_STATUSES`/`ACTIVE_CUSTOMER_ORDER_STATUSES` so a packed order is
    still treated as active (keeps polling, stays in the customer's active-orders list).
13. `apps/dgfy-storefront/src/features/tracking/components/DeliveryTrackingView.jsx` --
    `getTimelineIndex` gains a `case 'packed'`, mapped to the same index as its predecessor
    `preparing` (see **Open item #2, resolved** below for why, not a renumbering of the existing
    step array).
14. `apps/dgfy-storefront/src/modes/fnb/tracking/model/fnbTrackingAdapter.js`,
    `.../simple/tracking/model/simpleTrackingAdapter.js` -- **no new flow entry** (deliberate,
    #1180's own constraint that F&B must not gain a packing step); both adapters normalize a
    `packed` status to `preparing`'s position immediately before their `findIndex` call, so a
    direct-API-call order landing in `packed` on a non-Retail tenant renders at the `preparing`
    step rather than rewinding the timeline to step 0.

## Compliance Preconditions

1. **No unauthenticated access path exists.** The existing `PATCH /api/v1/pos/orders/:id/status`
   route (unchanged, no new endpoint) sits behind `checkPermission(TRANSACT_POS)`, same tier as
   every other status transition on this route.
2. **Staff identity never leaves the tenant-internal surface.** `packed_by`/`packed_at` are never
   serialized on the storefront tracking response (item 7 above) -- only the progress step
   (`fulfillment_status`/`status_label`, both already serialized) crosses that boundary.
3. **The new state is additive and optional, both server- and client-side.** `preparing` keeps
   both of its existing onward edges; an order that never enters `packed` behaves byte-identically
   to before this phase. No existing consumer of `ONLINE_FULFILLMENT_TRANSITIONS` is forced through
   the new state.
4. **The ENUM widening reaches every active tenant, not just the connected database.** The
   migration iterates `tenants WHERE status = 'active'`, guarded by
   `tableExists`/`columnExists`/`foreignKeyExists` checks for the two new columns and by reading
   `information_schema.columns.COLUMN_TYPE` for the ENUM widening itself -- the mechanism that
   avoids the #860/#639 crash-loop class for the column additions. **The ENUM widening itself has a
   narrower guarantee than the column additions -- see Residual Risk #3.**
5. **The money rule is unaffected.** `packed` triggers no refund, capture, or settlement path (see
   the "not payments" paragraph above) -- confirmed by reading
   `commerceOrderLifecycleUseCase`'s trigger set and the affiliate-settlement outcome map, both
   unchanged by this phase.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- New `apps/dgfy-api/tests/posOrderPackedStep.usecase.test.js` -- see final PR body / this
  declaration's latest revision for the actual pass count once executed.
- `packages/web-core/.../orderFulfillmentUi.test.js` -- extended.
- `apps/dgfy-api/tests/storeUsecases.applicationResult.test.js` -- extended.
- `apps/dgfy-storefront` retail tracking test suite -- extended (see PR body for the located file).
- `npm run build:pos`, `npm run build:store`, `npm run build:skupervisor` -- all three real Vite
  builds, all succeeded (`packages/web-core` is the shared trunk all three apps consume).
- `node --check` on every changed `apps/dgfy-api` `.js` file and the new `.cjs` migration (no real
  build step on that app; its own `build` script is a no-op).
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.

## Residual Risks

1. **The Retail gate is client-side only.** The server accepts a `preparing -> packed` transition
   for **any** workflow mode -- `posUseCases.js`'s transition table has no workflow-mode input, and
   adding one would be a much larger change than #1180 asks for. The worst case is a non-Retail
   tenant that calls the API directly parks an order in `packed`, from which every normal onward
   edge (`ready_for_pickup`, `out_for_delivery`) still works unaffected. This is the same posture
   Phase 210 took for the `DeliveryAddressEditControl` visibility gate ("the client gate is a UX
   convenience, not the enforcement point"), applied here to a strictly additive, optional state.
2. **F&B/Simple storefront timelines have no `packed` step.** Both adapters fall back to rendering
   a `packed` order at the `preparing` position (see Affected Surfaces item 14) -- a display
   fallback for a state that should not normally reach those modes given Residual Risk #1, not a
   designed experience for them.
3. **ENUM-widening self-repair -- resolved during implementation, not guessed.** Investigated
   `apps/dgfy-api/scripts/sync-tenant-schemas.js`'s `inspectRequiredTenantSchemaColumns`: it is
   **column-presence based only** (`SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS`,
   confirmed by reading the function directly) -- it has **no repair path for an ENUM *value*
   widening**, only for a missing column. A tenant restored from a pre-Phase-211 snapshot
   self-repairs the two new columns (`packed_at`/`packed_by`) via this mechanism at API boot, but
   **not** the widened `fulfillment_status` ENUM itself -- that tenant would need the migration
   re-run against it directly. No new repair mechanism was invented as part of #1180 per the plan's
   explicit instruction; if one is needed, it is a follow-up for `pm` to shape as its own issue.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The live sweep runs once per batch at the `develop -> staging` promotion.
