---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-08-09
applies_to: services, storefront, catalog
topic: services_fulfillment_profiles
---

# Services Fulfillment Profiles

This doc adapts an externally-authored planning reference ("Services
Checkout Flow by Service Type") for this codebase: the fulfillment-profile
vocabulary itself, honestly checked against what the Services backend and
storefront actually support today, and the roadmap for closing the gaps.
The vocabulary is governed by
`docs/architecture/adr/0057-services-fulfillment-profiles.md` — read that
first for what is and is not authorized. In one line: **the vocabulary may
drive client-side checkout composition today; it may not reach any
database column, API contract, or Store Profile section until a
superseding or amending decision.**

Related docs: `docs/features/SERVICES_MODE.md` (the Services domain
model), `docs/features/STOREFRONT_SERVICE_MODE_CURRENT_STATE.md` (the
storefront's current Services checkout behavior and known gaps),
`docs/features/SERVICES_CHECKOUT_REDESIGN_2026-08-08.md` (the 4-step
wizard shell this vocabulary would compose within),
`docs/features/STORE_TEMPLATES_AND_PROFILES.md` (the four-dimension
framing this doc's profiles are one dimension of).

## The four dimensions of "how we do business"

Templating today governs one of four dimensions a store's operations can
vary along:

| Dimension | Governs | Template-driven today? |
|---|---|---|
| **POS** | How items/services are added, priced, and billed at the counter | Yes — `profile.pos_workflow` (issue #178 Phase 21) |
| **Delivery** | How items reach the customer (own delivery, platform delivery, pickup) | No — `TenantLocation.supports_*` flags exist but reach the client unused; `DeliveryJob` is one-way and F&B-shaped |
| **Online Store** | How a customer avails an item (straight purchase, booking with a deposit, time selection) | No — checkout journey varies by `workflow_mode` only, via hardcoded frontend registries |
| **Online Checkout** | How the customer pays (cash, GCash, credit, downpayment/minimum) | No — cash + QR Ph only at storefront; no downpayment/balance concept anywhere |

This doc's fulfillment-profile vocabulary is the seed of the **Online
Store** dimension specifically, scoped to Services (where the concept is
sharpest: an appointment, a home visit, and a pickup-and-return are
genuinely different checkout shapes). Delivery and Online Checkout remain
open — see "Roadmap" below.

## The eight fulfillment profiles

Defined in `packages/shared-constants/src/fulfillmentProfiles.js`
(`FULFILLMENT_PROFILES`). Each entry names the checkout fields it
positions (`required`/`optional`/`hidden`, from a closed vocabulary), the
booking flow's final call-to-action, and the customer-facing tracking
timeline.

| # | Profile | Final action | `service_area_type` | Status |
|---|---|---|---|---|
| 1 | Appointment at the business | Confirm appointment | `in_store` | **Shipped** |
| 2 | Service at the customer's address | Confirm booking | `customer_location` | **Shipped** |
| 3 | Online service | Confirm appointment | `online` | **Shipped** |
| 4 | Customer chooses the location | Confirm booking | `hybrid` | **Shipped** |
| 5 | Pickup and return to the customer | Send booking request | — | Planned |
| 6 | Pickup and collection at the store | Send booking request | — | Planned |
| 7 | Drop-off and collection at the store | Send booking request | — | Planned (staff-recorded, not a checkout choice) |
| 8 | Quote-first service | Request a price | — | Planned |

Profiles 1-4 map exactly onto `ServiceItemDetail.service_area_type`'s four
real values — the existing, shipped seed of this concept. Profiles 5-7 all
name `pickupReturnLogistics` (the existing `status: 'planned'` Capability
Module) as their blocker. Profile 8 has no blocking module today; nothing
in the catalog names the quote-request gap yet.

### Journeys (profiles 1-4, shipped)

```text
1. Appointment at the business
   Choose a service -> customer details -> add-ons/instructions ->
   branch, date, time, payment -> review -> confirm appointment ->
   track appointment status

2. Service at the customer's address
   Choose a service -> customer details -> add-ons/instructions ->
   service address + map pin -> visit date, time, payment ->
   review -> confirm booking -> track the visit

3. Online service
   Choose a service -> customer details -> add-ons/instructions ->
   date, time, payment -> review -> confirm appointment ->
   join/view appointment details

4. Customer chooses the location
   Choose a service -> "Visit the branch" or "At my address" ->
   only the fields for that choice -> date, time, payment ->
   review -> confirm booking
```

### Journeys (profiles 5-8, planned — previews only, not backed)

```text
5. Pickup and return
   Choose a service -> customer details -> add-ons/instructions ->
   pickup address + schedule -> confirm return address -> payment ->
   review -> send booking request

6. Pickup and collection at the store
   Same as (5), but confirm a collection branch instead of a return address

7. Drop-off and collection (staff-recorded in POS, not a checkout choice)

8. Quote-first
   Choose a service -> customer details -> service details, photos, notes ->
   preferred time (optional) -> review -> request a price
   (never shows a made-up total)
```

## What exists today vs. the gap

Honest accounting, so this doc never implies backend support that isn't
there:

| Concern | What exists today | Gap |
|---|---|---|
| Where the service happens | `ServiceItemDetail.service_area_type` (`in_store`/`customer_location`/`online`/`hybrid`) | Per service item, not surfaced as a checkout-composition input yet — only a catalog filter chip and a label today |
| Customer address | None as a first-class `ServiceBooking` field | The storefront prepends the address into the free-text `notes` column as a workaround (`docs/features/STOREFRONT_SERVICE_MODE_CURRENT_STATE.md`) |
| Pickup/return addresses, collection branch, meeting link | None | No columns exist on `ServiceBooking` for any of these |
| Handoff choice (pickup-and-deliver vs. pickup-and-collect) | A hardcoded two-option chooser in the checkout wizard (`ServiceBookingFulfillmentChoices.jsx`) | The customer's choice never reaches the booking payload — cosmetic today |
| Round-trip delivery | `DeliveryJob` | One-way, uniquely keyed 1:1 to a `PosTransaction` — cannot represent a round trip, cannot attach to a `ServiceBooking` at all |
| Booking status timeline | `requested → confirmed → checked_in → in_service → completed` (+ `cancelled`/`no_show`), no per-transition timestamps | Cannot express a pickup/return or drop-off/collect timeline (profiles 5-7's richer event lists) without new states |
| Payment timing | `ServiceItemDetail.payment_policy`, `ServiceBooking.payment_timing` (`prepaid`/`postpaid`/`deposit`) | `deposit` is a label with a no-op behind it — no deposit amount, no balance-due field, no partial-payment status anywhere in Services or storefront checkout |
| Quote/pricing-request lifecycle | Nothing | No in-between state for "business is preparing a quote," no field to hold a quoted price |

**Naming collision to watch:** `payment_timing` means two different things
in this codebase. On `ServiceBooking` it is `prepaid`/`postpaid`/`deposit`
(when the customer pays, relative to the appointment). On `PosTransaction`
it is `upfront`/`on_pickup`/`on_delivery` (when the customer pays, relative
to order fulfillment). Any future work spanning both must disambiguate
explicitly rather than assume one vocabulary.

## Roadmap (not authorized by this doc or ADR 0057 — future work, gated behind its own design)

- **Booking address/meeting-link columns.** Give `ServiceBooking` a real
  customer address, pickup/return address pair, and meeting-link field,
  replacing the `notes`-field workaround.
- **Round-trip delivery legs**, under the existing `pickupReturnLogistics`
  Capability Module — the mechanism profiles 5-7 are blocked on.
- **Real deposits/partial payment** — a deposit amount or percentage, a
  balance-due concept, and a `payment_status` that can express "partially
  paid," none of which exist in Services or storefront checkout today.
- **Template-carried fulfillment defaults**, via
  `StoreConfigurationTemplateModule.config` (a JSON column that already
  exists in the schema but is currently discarded by the template
  repository) — a future, deliberate ADR-gated step per ADR 0057 clause 3,
  not assumed by this vocabulary.
- **Per-tenant storefront `order_methods`** — `buildStoreProfile()`'s
  `storefront` section is currently a tenant-invariant constant; it never
  got the same effective-capability-set treatment `pos_workflow` did in
  issue #178 Phase 21.
- **Services checkout adopting the existing `payment_capabilities`
  filter** — F&B checkout already filters payment methods per tenant
  (cash/QR Ph); Services checkout ignores this and shows a "coming soon"
  modal for anything but cash.

Two follow-up GitHub issue drafts (not filed — pending explicit approval,
same posture as the two drafts referenced in
`docs/development/STORE_TEMPLATES_HANDOFF.md` §6):

1. **Quote-request lifecycle** — a new final action and a pricing
   negotiation state; nothing in the current schema backs it.
2. **`payment_timing` vocabulary reconciliation** — the naming collision
   between `ServiceBooking.payment_timing` and `PosTransaction.payment_timing`
   documented above, before any work spans both.
