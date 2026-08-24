---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-09
last_reviewed: 2026-08-09
review_by: 2027-02-09
applies_to: services, storefront, catalog
topic: services_fulfillment_profiles
---

# ADR 0057: Services Fulfillment Profiles

## Status

Accepted (2026-08-09).

## Context

An externally-authored planning reference ("Services Checkout Flow by
Service Type") proposed a locale-neutral **fulfillment profile** vocabulary
— `appointment_at_business`, `service_at_customer_address`,
`online_service`, `customer_choice_of_location`, `item_pickup_return`,
`item_pickup_collection`, `item_dropoff_collection`, `quote_request` — to
control which checkout fields a customer answers, which final action a
booking flow presents (Confirm appointment / Send booking request / Request
a price), and which customer-facing tracking timeline applies. That
document is explicit that it is a planning reference, not an approval for
backend schema, API, or interactive-route work (its own §9).

A codebase audit against that proposal found:

- `ServiceItemDetail.service_area_type` (`in_store`, `customer_location`,
  `online`, `hybrid`) is the existing seed of this concept — per service
  item, not per store, and today almost cosmetic: it drives a catalog
  filter chip, a label, and a fragile label-substring heuristic in the
  Services storefront checkout (`serviceBookingFields.js`) that guesses
  which fields to require.
- `ServiceBooking` has no customer address, pickup/return address, or
  meeting-link columns; the storefront currently prepends the address into
  the free-text `notes` column as a workaround (a known, documented gap).
- The Services checkout wizard's handoff chooser hardcodes two
  laundry-shaped options; the customer's choice never reaches the booking
  payload.
- `pickupReturnLogistics` already exists in the Capability Module catalog
  (`packages/shared-constants/src/capabilityModules.js`) as a
  `status: 'planned'` module — the laundry round trip is a named roadmap
  slot, not a new invention this ADR introduces.
- ADR 0056 clause 3 (`[binding]`) holds that a Store Template or Store
  Profile never introduces a new enum value, database column, or business
  logic — any new selling behavior ships as ordinary engineering with its
  own design and, if cross-boundary, its own ADR. A fulfillment-profile
  vocabulary is exactly the kind of new selling-behavior concept that
  clause anticipates, so it is recorded here rather than folded into ADR
  0056 (which governs the Template/Profile layer, not services-domain
  vocabulary) or ADR 0016 (which governs Services' independent booking and
  ticketing model as a whole, a broader authority than this narrow
  vocabulary needs).

This ADR records the vocabulary as an engineering-owned shared constant and
draws the boundary on what may consume it today, without authorizing any
schema, API, or database change — consistent with the source document's own
stated approval boundary.

## Decision

1. **The fulfillment-profile vocabulary is a shared, engineering-owned
   constant — not a database concept.** `[binding]` It is declared once,
   in `packages/shared-constants/src/fulfillmentProfiles.js`, re-exported
   into the backend via the existing one-line shim convention
   (`backend/src/modules/shared/constants/fulfillmentProfiles.js`), and
   consumed directly by the frontend via the package's `exports` map — the
   same pattern every other cross-layer constant in this codebase already
   uses (`workflowModes.js`, `capabilityModules.js`,
   `registrationIndustries.js`). No new table, column, or enum is added to
   any model to represent it.
2. **A profile is either `shipped` or `planned`, and the two must never be
   confused.** `[binding]` `shipped` means checkout can complete for that
   profile today, exactly as currently implemented (with any real
   degradation — such as the address-in-notes workaround — recorded in the
   entry's own `notes`, not hidden). `planned` means no backend mechanism
   exists yet; a `planned` profile may be shown as an honest roadmap
   preview but must never be silently treated as available. Each
   `planned` entry names the Capability Module (if any) that would need to
   ship first, so "what would make this real" stays traceable rather than
   aspirational.
3. **The vocabulary may drive client-side checkout composition; it may not
   reach any database column, API contract, or Store Profile section until
   a superseding or amending decision says otherwise.** `[binding]` The
   storefront's Services checkout may derive which fields to show/require
   and which final-action label to render from a profile, entirely
   client-side and entirely from existing data
   (`ServiceItemDetail.service_area_type`, mapped to the one shipped
   profile that corresponds to it). No booking payload field may carry a
   raw fulfillment-profile key to the backend; no `ServiceBooking` column,
   no `buildStoreProfile()` section, and no `STORE_TEMPLATE_PRESETS` field
   may be added to represent it. This keeps the vocabulary strictly
   additive and reversible — deleting the constant deletes the concept,
   with nothing in the database or API surface referencing it.
4. **Granularity is per service item, not per store template.** `[binding]`
   A single business (a salon offering both in-store and at-home services,
   for example) may legitimately have line items across multiple
   fulfillment profiles at once. The vocabulary therefore keys off
   `ServiceItemDetail.service_area_type`, an existing per-item field —
   never off `workflow_mode`, a Store Template, or any other per-tenant
   setting. This is consistent with ADR 0056 clause 4's grain: profile-level
   concepts belong to what is actually being sold, not to the store as a
   whole.

## Consequences

- **Positive.** The vocabulary gives the existing
  `service_area_type` field, the checkout wizard's hardcoded handoff
  chooser, and the `pickupReturnLogistics` roadmap slot a single, named,
  contract-testable home — replacing ad hoc label-substring matching with
  a declarative mapping the storefront can derive from. It closes no gap
  by itself; it defines the vocabulary the gaps can be closed against.
- **Negative / deferred.** None of the real gaps this ADR's Context section
  names — booking address/meeting-link columns, round-trip delivery legs,
  real deposits, template-carried fulfillment defaults — are authorized or
  closed by this decision. Each remains ordinary future engineering work,
  gated behind its own design and (per clause 3) an amendment or
  superseding ADR before it may touch a database column, API contract, or
  Store Profile section.
- **Reversible.** Per clause 1, the entire vocabulary is one shared
  constant with no downstream schema dependency — removing it removes the
  concept cleanly.

## Related

- ADR 0016 (services mode, independent booking and ticketing) — the
  broader authority this ADR's narrower vocabulary sits alongside, not
  inside.
- ADR 0034 (manual delivery job foundation) — `DeliveryJob`'s one-way,
  1:1-with-a-transaction shape is the reason `item_pickup_return` and its
  siblings are `planned`, not `shipped`.
- ADR 0056 (store configuration templates and profiles) — clause 3 is the
  governing constraint this ADR's clause 3 mirrors for the services
  domain specifically.
- ADR 0058 (registration industry catalog) — amends clause 1's listing of
  `registrationIndustries.js` as a shared-constant exemplar: that constant
  is now a seed baseline for a database table, not the runtime source.
  `workflowModes.js`, `capabilityModules.js`, and this ADR's own
  `fulfillmentProfiles.js` are unaffected by that amendment.
- ADR 0064 (services handoff legs and round-trip persistence) — scoped
  supersession of clause 3, for `item_pickup_return` and
  `item_pickup_collection` only. Clauses 1, 2, and 4, and every other
  profile in this vocabulary (including `item_dropoff_collection` and
  `quote_request`), remain governed by clause 3 exactly as written here.
- `docs/features/SERVICES_FULFILLMENT_PROFILES.md` — the merchant/developer
  reference this ADR's vocabulary is documented against, including the
  full exists-today-vs-gap matrix.
