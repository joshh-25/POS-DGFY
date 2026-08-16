---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-15
last_reviewed: 2026-08-15
review_by: 2027-02-15
applies_to: services, storefront, pos_frontend, backend
topic: services_handoff_legs
---

# ADR 0064: Services Handoff Legs and Round-Trip Persistence

## Status

Accepted (2026-08-15).

## Context

Issue #482 (laundry pickup-and-return) needs `ServiceBooking` address columns, four new lifecycle
status values, a payload field carrying the customer's handoff choice, and a new entity for the
two-leg round trip (inbound pickup, outbound delivery-or-collection). All four are individually
forbidden by ADR 0057 clause 3 (`[binding]`):

> The vocabulary may drive client-side checkout composition; it may not reach any database column,
> API contract, or Store Profile section until a superseding or amending decision says otherwise.
> No booking payload field may carry a raw fulfillment-profile key to the backend; no
> `ServiceBooking` column … may be added to represent it.

The spec this ADR authorizes against is confirmed, not inferred:
`docs/proposals/2026-08-15-liempyo-laundry-discover-flow-and-gap-analysis.md` captured the
discover.dgfy.ph Liempyo Laundry demo click-by-click. Its central structural finding: the flow
models **two independent legs** — an inbound pickup leg that is always present, and an outbound leg
that varies (deliver to address, or collect at branch). The `tracking_events` arrays already in
`packages/shared-constants/src/fulfillmentProfiles.js:173,198` (`item_pickup_return`,
`item_pickup_collection`) already match the demo's six-stage timelines name for name — the
vocabulary was authored correctly; only persistence is missing.

Two facts about the existing model rule out reusing what exists:

- `DeliveryJob` (`apps/dgfy-api/src/models/DeliveryJob.js:6,28`) is `unique: true` on
  `pos_transaction_id` at both the column and the index, enforced again at the database level by
  the creating migration's unique FK. Its transition map
  (`apps/dgfy-api/src/modules/pos/usecases/posUseCases.js:91-106`) is strictly linear
  (`pending_dispatch → assigned → picked_up → delivered`) with no branches, and it has no
  association to `ServiceBooking` at all. A round trip needs two legs and a link to a booking;
  `DeliveryJob` structurally cannot hold either.
- `ServiceBooking.status` transitions persist no timestamps (`serviceUseCases.js`'s
  `buildUpdateServiceBookingStatusUseCase` writes only `status` and `cancellation_reason`), so the
  `laborTracking` planned module's gap and this issue's gap are the same missing mechanism.

A narrower question this ADR does **not** resolve: ADR 0057 clause 4 (`[binding]`) keys profile
granularity off `ServiceItemDetail.service_area_type`
(`ENUM('in_store','customer_location','online','hybrid')`), and none of those four values means "the
business collects and returns the item." Both target profiles currently declare
`service_area_types: []`, so `resolveFulfillmentProfilesForServiceAreaType`
(`fulfillmentProfiles.js:280-288`) can never return them — unreachable by construction, not merely
unimplemented. This ADR authorizes closing that gap; it does not prescribe the enum's new shape,
which is Phase 88 design work, not a governance decision.

## Decision

1. **Scoped supersession of ADR 0057 clause 3, and only clause 3.** `[binding]` Clause 3's
   database/API/Store-Profile prohibition is lifted for the handoff-leg concept, and only for
   `item_pickup_return` and `item_pickup_collection`. ADR 0057 clauses 1, 2, and 4 remain in force
   verbatim and unamended. Every other profile — `item_dropoff_collection`, `quote_request`, and
   the four shipped profiles — remains fully governed by clause 3 as written; this ADR authorizes
   nothing for them.
2. **The handoff leg is a first-class entity, keyed to the booking, not the transaction.**
   `[binding]` It hangs off `ServiceBooking.booking_id`, mirroring how `ServiceBookingLine` already
   keys off the booking (`models/index.js:755-756`) rather than the settled transaction. This is
   the genuinely new concept: neither `ServiceBooking` nor `PosTransaction` nor `DeliveryJob` models
   custody of an item in transit today.
3. **No fulfillment-profile key reaches the wire or the database.** `[binding]` The booking payload
   carries the handoff legs themselves (direction, method, address or branch, scheduling window);
   which of the two profiles applies is derived from the legs' shape, never stored or transmitted
   as a raw profile key. This is what keeps ADR 0057 clauses 1 and 4 intact under this
   supersession, keeps the vocabulary reversible per clause 1's own rationale, and keeps
   `docs/development/SERVICES_STOREFRONT_CHECKOUT_TRACKING_FRONTEND_GUIDE.md`'s rule that
   `fulfillmentProfileKey` must never enter the booking request body literally true without needing
   its own amendment.
4. **The lifecycle is a widened status enum plus a new transition-event table.** `[default]`
   `service_bookings.status` gains `for_pickup`, `pickup_completed`, `out_for_return`,
   `ready_for_collection` — additive, so the existing appointment graph, the POS queue, and
   `SETTLEABLE_BOOKING_STATUSES` keep working unchanged. A new table records every transition with
   its timestamp and actor, closing the no-timestamps gap for this lifecycle and, as a side effect,
   for the `laborTracking` planned module.
5. **No `laundry_` prefix in any column, enum value, route, or component name.** `[binding]` Per
   the proposal's generalization framing: this closes shoe cleaning and tailoring for free and gets
   repair most of the way, but only if nothing built here is laundry-specific by name.
6. **`pickupReturnLogistics` flips `status: 'planned'` to `'shipped'` only once the module's
   behavior actually exists** — at the end of the phase sequence this ADR authorizes, not at its
   start. `[default]` Until then it stays `planned`, and `validateModuleSelection`
   (`capabilityModules.js:336`) correctly keeps rejecting it as `unbuildable` (422) if any template
   or profile attempts to select it early.
7. **Populating `service_area_types` for the two profiles is in scope, and the `service_area_type`
   grain question above is open.** `[default]` Phase 88 must decide how a service item declares
   itself a handoff-capable service without violating clause 4's per-item grain — whether by adding
   an enum value, a separate boolean, or another mechanism — but that decision is implementation
   design, not authorized or foreclosed here.

## Consequences

- **Positive.** Phases 88–92 (schema, API contract, storefront wiring, services tracking timeline,
  POS) may proceed without re-litigating this gate per phase. The scope is narrow enough that ADR
  0057's other three clauses, and every profile besides the two named, are untouched — a future
  `item_dropoff_collection` or `quote_request` decision starts from a clean clause 3, not from
  whatever this ADR's supersession leaves behind.
- **Negative / deferred.** The `service_area_type` grain question (Context, Decision 7) is
  genuinely unresolved and is the most likely place Phase 88 stalls; it is named here deliberately
  rather than discovered mid-migration. `item_dropoff_collection` and `quote_request` remain fully
  blocked by ADR 0057 clause 3 — this ADR does not touch either, on purpose (proposal §9, #482
  scope boundaries).
- **Reversible.** Because no profile key ever reaches the database (Decision 3), the vocabulary in
  `fulfillmentProfiles.js` keeps ADR 0057 clause 1's reversibility property: deleting the constant
  still deletes the concept. The handoff-leg table and the new enum values are additive and can be
  dropped/reverted independently of the vocabulary.

## Related

- ADR 0057 (Services Fulfillment Profiles) — clause 3 is scoped-superseded by Decision 1 above for
  the two named profiles only; clauses 1, 2, and 4 are unaffected. Cross-reference added to 0057's
  own `## Related` section.
- ADR 0034 (Manual Delivery Job Foundation) — `DeliveryJob`'s one-way, 1:1-with-a-transaction shape
  is why it cannot serve as the handoff-leg entity (Context).
- ADR 0016 (Services Mode, Independent Booking and Ticketing) — the broader authority the handoff
  leg extends; unaffected by this decision.
- `docs/proposals/2026-08-15-liempyo-laundry-discover-flow-and-gap-analysis.md` — the confirmed
  customer-facing spec this ADR authorizes persistence for.
- `docs/features/SERVICES_FULFILLMENT_PROFILES.md` — the merchant/developer reference; unchanged by
  this ADR, still `reference`.
- Issues #482 (this decision's tracking issue), #480 (address/payload prerequisite), #481 (POS
  walk-in and drop-off, explicitly out of scope here), #504 (vertical generalization framing).
