---
status: reference
owner: engineering
last_reviewed: 2026-09-01
related_adr: docs/architecture/adr/0069-payment-lifecycle-refund-forfeiture-and-downpayment-rules.md
declaration_id: 2026-09-01-order-rejection-reason-and-address-edit
classification: major
surfaces: pos,terminal,store,privacy,payments
reason_codes_impacted: ORDER_ADDRESS_EDIT_NOT_DELIVERY,ORDER_ADDRESS_EDIT_TERMINAL_STATE
policy_version: 2026.09.01
verification_evidence: apps/dgfy-api/tests/posOrderRejectionAndAddressEdit.usecase.test.js -- actually executed (Jest, not just syntax-checked): 8/8 pass (confirmed -> rejected persists rejection_reason/rejected_by/rejected_at and does not overwrite accepted_by/accepted_at; a confirmed -> rejected without a reason is rejected 422 at the validator; the address-edit happy path writes the order row and one pos_order_address_changes row; a second edit's previous_* equals the first edit's new_*; a non-delivery order 422s with ORDER_ADDRESS_EDIT_NOT_DELIVERY; an out_for_delivery order 409s with ORDER_ADDRESS_EDIT_TERMINAL_STATE -- Pat's confirmed pre-dispatch-only deviation from the plan's out_for_delivery-allowed default; a completed order 409s; a latitude-without-longitude payload 422s),apps/dgfy-api/tests/commerceOrderLifecycle.usecase.test.js -- actually executed: extended with a Phase 210 regression pin asserting the store-reject money rule (never forfeit, refund exactly the captured downpayment) holds identically for both the placed and the newly-widened confirmed origin -- full suite 27/27 pass,apps/dgfy-api/tests/storeUsecases.applicationResult.test.js -- actually executed: two new cases (rejection_reason + composed message surfaced for a rejected order; rejection_reason is null for every non-rejected status, defensively even when the column carries a stray value) -- full suite 76/76 pass,packages/web-core/src/features/pos/__tests__/orderFulfillmentUi.test.js -- actually executed (Vitest): updated confirmed-case expectation plus a new explicit assertion that rejected is offered from confirmed,packages/web-core/src/features/pos/__tests__/deliveryAddressEdit.behavior.test.jsx -- actually executed (Vitest): visibility gating (renders for placed/confirmed/preparing, does NOT render for out_for_delivery -- the pre-dispatch-only deviation -- or any terminal state, or a non-delivery order), the "customer is not notified" copy, save disabled until a reason is entered, and change-history rendering,npm run build:pos (real Vite build, succeeded),npm run build:store (real Vite build, succeeded),npm run build:skupervisor (real Vite build, succeeded -- packages/web-core is the shared trunk all three apps consume),node --check on every changed apps/dgfy-api file and the new migration file,npm run check:compliance (confirmed to fail first, then pass once this declaration was added)
rollback_note: The three pos_transactions columns (rejection_reason, rejected_by, rejected_at) are nullable and additive -- down() is pure at the schema level for those. Dropping pos_order_address_changes, however, is genuinely destructive: it PERMANENTLY DESTROYS the address-change audit trail (there is no other copy of previous_address/previous_latitude/previous_longitude). Unlike a purely additive rollback, this down() should only be run knowing that history is gone for good.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1179-ORDER-REJECTION-REASON-AND-ADDRESS-EDIT
---

# Reject-with-reason and post-placement delivery address/pin edit (#1179)

## Compliance Impact Classification

Major. The floor comes from three rules in `scripts/check-compliance-impact.js`, all confirmed live
against this diff: `apps/dgfy-api/src/modules/pos/**` (`pos,terminal`-surfaced, `major`),
`apps/dgfy-api/src/routes/pos.js` (`pos,terminal`, `major`), and
`packages/web-core/src/features/pos/**` (same). `apps/dgfy-api/src/modules/store/` independently
requires `payments` (`major`) -- this diff touches `storeUseCases.js`. `surfaces` also adds `store`
(the storefront tracking response gains a `rejection_reason` field) and `privacy` (see below). The
gate was confirmed to **fail** first (`npm run check:compliance`, listing every touched file
below), then **pass** once this declaration was added.

Not `regulatory`: the `regulatory` floor in that script attaches to `modules/compliance/`,
`routes/compliance.js`, `compliancePolicy.js`, and the tenant-admin surfaces -- none of which this
phase touches.

**The privacy paragraph, stated explicitly rather than left implicit in a bare `major`:** this
phase mutates and audits a customer-supplied delivery address (RA 10173 / NPC). The new
`pos_order_address_changes` table stores the *previous* address (and its lat/lng) indefinitely on
every staff edit -- this is a new retention surface, not merely a new feature, and is named here on
that basis. The audit table has no purge/retention policy in this phase (see Residual Risks). No
new PII *type* is introduced -- `delivery_address`/`delivery_latitude`/`delivery_longitude` already
existed on `pos_transactions`, captured once at checkout; this phase is the first to retain a
history of edits to that same data, by staff, after the fact.

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260901000002-add-order-rejection-reason-and-address-change-audit.cjs`
   (**new**) -- adds three nullable, additive columns to `pos_transactions`
   (`rejection_reason`, `rejected_by`, `rejected_at`, the latter FK'd to `users(user_id) ON DELETE
   SET NULL`) and a new append-only table, `pos_order_address_changes`, with its own two FKs
   (`pos_transaction_id -> pos_transactions ON DELETE CASCADE`, `changed_by -> users(user_id) ON
   DELETE SET NULL`) and a `(pos_transaction_id, changed_at)` index. Fans out per active tenant
   database, guarded by `information_schema` `tableExists`/`columnExists`/`foreignKeyExists`/
   `indexExists` checks -- same structure as `20260831000001-add-pos-order-payment-proof-columns.cjs`.
2. `apps/dgfy-api/src/models/PosTransaction.js` -- the three new fields.
3. `apps/dgfy-api/src/models/PosOrderAddressChange.js` (**new**) -- the audit-row model.
4. `apps/dgfy-api/src/models/index.js` -- import, association registration
   (`PosTransaction.hasMany(PosOrderAddressChange, ...)`), and both export lists.
5. `apps/dgfy-api/scripts/sync-tenant-schemas.js` -- `REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions`
   (three new entries), `REQUIRED_TENANT_SCHEMA_TABLES.pos_order_address_changes` (new `CREATE
   TABLE` string), and `REQUIRED_TENANT_SCHEMA_INDEXES.pos_order_address_changes` (repair path for
   the index) -- kept in lockstep with the migration so a tenant that misses it, or is restored
   from an older snapshot, self-repairs at API boot, and a brand-new tenant is created correct.
6. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` --
   `ONLINE_FULFILLMENT_TRANSITIONS.confirmed` widened to allow `rejected` (Gap B); the
   `updatePayload` write for a `rejected` transition now persists `rejection_reason`/`rejected_by`/
   `rejected_at` inside the same transaction as the status change, before commit (Gap A); a new
   `DELIVERY_ADDRESS_EDITABLE_STATUSES` constant (`['placed','confirmed','preparing']` -- **pre-
   dispatch only, Pat's confirmed deviation from the plan's `out_for_delivery`-allowed default**);
   a new `buildUpdateOnlineOrderDeliveryAddressUseCase` (Gap C) mirroring the status-update use
   case's transaction/lock/idempotency shape, rejecting a non-`delivery` order 422
   (`ORDER_ADDRESS_EDIT_NOT_DELIVERY`) and any status outside the editable set 409
   (`ORDER_ADDRESS_EDIT_TERMINAL_STATE`) -- `out_for_delivery` is rejected the same way as a
   terminal state. No radius recomputation (`outside_radius_flag` is left unchanged; see #478).
7. `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- `createAddressChange`, and
   `buildTransactionInclude()` gains a capped (5), most-recent-first `addressChanges` include
   (`separate: true`) so the POS order-details payload (incoming-orders query) carries recent
   history.
8. `apps/dgfy-api/src/modules/pos/contracts/posRepository.contract.js` -- `createAddressChange`
   added to the required-methods list.
9. `apps/dgfy-api/src/validators/posValidator.js` -- new
   `updateOnlineOrderDeliveryAddressSchema` (`.and('delivery_latitude', 'delivery_longitude')`,
   required `change_reason`).
10. `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`, `apps/dgfy-api/src/modules/pos/index.js`,
    `apps/dgfy-api/src/routes/pos.js` -- new
    `PATCH /api/v1/pos/orders/:id/delivery-address` route, same `TRANSACT_POS` permission tier as
    the existing status-update route.
11. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- `serializeOrderBase` gains
    `rejection_reason` (deliberately **not** `rejected_by`/`rejected_at` -- staff identity is not
    customer-facing PII to publish on a public, PIN-addressable page);
    `buildTrackStoreOrderUseCase`'s hardcoded rejected message now composes the reason in, gated on
    `rejected` so a reason can never leak on a non-rejected order.
12. `packages/web-core/src/features/pos/components/orderFulfillmentUi.js` --
    `getNextStatusActions`'s `confirmed` case now offers `['preparing', 'rejected']`.
13. `packages/web-core/src/features/pos/components/DeliveryAddressEditControl.jsx` (**new**) --
    staff-only edit dialog, visible only pre-dispatch (mirrors #6's server-side gate), a required
    "Reason for change" field, and an explicit "the customer is not notified and does not confirm
    this change" note.
14. `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx` -- renders the new
    control beneath the existing "Open pin in map" link; the `confirmed`-origin reject button
    appears automatically via #12 (no new component needed for the reject affordance itself).
15. `packages/web-core/src/features/pos/pages/TerminalPage.jsx`,
    `packages/web-core/src/features/pos/services/posService.js` -- new
    `handleUpdateOnlineOrderDeliveryAddress` handler (same shape as
    `handleAssignDeliveryPersonnel`: online guard -> id parse -> idempotency key -> call -> refresh
    -> toast) and the `updateOnlineOrderDeliveryAddress` service call.
16. `apps/dgfy-storefront/src/modes/{retail,fnb,simple}/tracking/model/*TrackingAdapter.js`,
    `retailTrackingPayload.js`, `*TrackingRoutePage.jsx` / `SimpleTrackingRoutePage.jsx`,
    `retailTrackingDrawerPresentation.js` / `RetailTrackingDrawerCard.jsx` -- surface the merchant-
    attributed rejection reason under the status headline (route pages) and in the order-history
    drawer, only ever for `statusCode === 'rejected'`, framed as the store's statement, never
    DGFY's own. `serviceTrackingAdapter.js` is excluded -- service bookings run their own status
    machine, not `ONLINE_FULFILLMENT_STATUSES`.

Governance: ADR 0069 clause 8 `[default]` is the money rule (a store-initiated reject/cancel always
refunds, never forfeits) and this phase does not change it -- it pins it with a regression test for
both the `placed` and the newly-widened `confirmed` origin (identical call shape either way, since
`commerceOrderLifecycleUseCase` takes no "origin status" parameter). No ADR amendment needed.

## Compliance Preconditions

1. **No unauthenticated access path exists.** The new delivery-address route sits behind
   `checkPermission(TRANSACT_POS)`, same tier as the existing status-update route.
2. **Staff identity never leaves the tenant-internal surface.** `rejected_by`/`rejected_at` and the
   full `pos_order_address_changes` history (including `changed_by`) are never serialized on the
   storefront tracking response -- only `rejection_reason` (a merchant-authored free-text string)
   crosses that boundary, and only when the order is actually `rejected`.
3. **Pre-dispatch only, both sides.** Server (`DELIVERY_ADDRESS_EDITABLE_STATUSES`) and client
   (`DeliveryAddressEditControl`'s visibility gate) both exclude `out_for_delivery` and every
   terminal state -- the server stays authoritative either way (the client gate is a UX
   convenience, not the enforcement point).
4. **No radius re-enforcement is silently introduced.** `outside_radius_flag` is left unchanged on
   an address edit -- re-enforcing the delivery radius is #478's job, explicitly out of scope here
   so as not to silently change acceptance behaviour for every existing order path.
5. **The ENUM/column widening reaches every active tenant, not just the connected database.** The
   migration iterates `tenants WHERE status = 'active'`, guarded by
   `tableExists`/`columnExists`/`foreignKeyExists`/`indexExists` per tenant -- the mechanism that
   avoids the #860/#639 crash-loop class. `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md`
   has no open entries with a deploy-order dependency on this migration; this migration introduces
   none of its own (additive nullable columns + one new table, no destructive `up()`).
6. **The money rule is unweakened.** ADR 0069 clause 8's refund-not-forfeit rule for a store-side
   reject is pinned by an explicit regression test for both origins this phase adds (`placed` and
   `confirmed`).

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- New `apps/dgfy-api/tests/posOrderRejectionAndAddressEdit.usecase.test.js` -- 8/8 pass.
- `apps/dgfy-api/tests/commerceOrderLifecycle.usecase.test.js` -- extended, 27/27 pass, pinning the
  money rule for both origins.
- `apps/dgfy-api/tests/storeUsecases.applicationResult.test.js` -- extended, 76/76 pass.
- `packages/web-core/.../orderFulfillmentUi.test.js` -- updated + extended.
- New `packages/web-core/.../deliveryAddressEdit.behavior.test.jsx` -- visibility gating (including
  the pre-dispatch-only deviation), required-reason gate, and the "not notified" copy.
- `npm run build:pos`, `npm run build:store`, `npm run build:skupervisor` -- all three real Vite
  builds, all succeeded (`packages/web-core` is the shared trunk all three apps consume).
- `node --check` on every changed `apps/dgfy-api` `.js`/`.cjs` file, including the migration (no
  real build step on that app; its own `build` script is a no-op).

## Residual Risks

1. **No retention or purge policy ships for `pos_order_address_changes` in this phase.**
   Previous-address history persists for the life of the tenant's volume. RA 10173 proportionality
   argues for a bounded retention window on this kind of audit data; designing it is a
   product/compliance decision, handed to `pm` as a follow-up issue, not silently omitted.
2. **No radius re-enforcement on an address edit** -- explicitly out of scope, #478's job. A staff
   edit can move an order's delivery point outside the originally-computed radius with no system
   flag raised.
3. **`out_for_delivery` address edits are now unreachable through this endpoint** -- Pat's
   confirmed deviation from the plan's default (which would have allowed them). The plan's own
   §9 open item #1 named the counter-argument (a driver already holds a printed slip with the old
   address); this phase resolves that tension by disallowing the edit outright once dispatched,
   rather than allowing it and relying on the audit trail as the only mitigation.
4. **The client-side visibility gate is a UX convenience, not the enforcement point** -- inherited
   from every other staff-action gate in this module; the server (`DELIVERY_ADDRESS_EDITABLE_STATUSES`)
   is authoritative.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The live sweep runs once per batch at the `develop -> staging` promotion.
