---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-08-10
review_by: 2027-02-10
applies_to: services, storefront, backend
topic: services_storefront_template_driven_checkout_tracking_architecture
---

# Services Storefront Template-Driven Checkout And Tracking Architecture Guide

## Purpose

This guide explains how to build one Services storefront experience with one
cart, one checkout entry point, and one tracking entry point while allowing
each service type to present different fields, steps, review content, final
actions, and tracking timelines.

It covers:
- template/profile configuration boundaries;
- service-profile selection;
- service-specific catalog, cart, and checkout presentation;
- customer-facing booking tracking;
- SRP/MVVM ownership and integration boundaries;
- frontend and backend ownership boundaries;
- production support versus browser-only simulation;
- tests and review evidence required before release.

This is a frontend implementation guide and a backend support checklist. It is
not an approval for a new database column, API contract, service business type,
or interactive route. Cross-boundary changes must follow the accepted ADRs
listed below.

## Governing documents

Use these documents together. This guide must not override an accepted ADR.

- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
  - Services is an independent workflow mode with dedicated bookings,
    resources, lifecycle statuses, tickets, payment timing, holds, and batch
    booking.
- `docs/architecture/adr/0057-services-fulfillment-profiles.md`
  - Fulfillment profiles are per service item, may compose frontend checkout,
    and must not be stored as a raw database, API, or Store Profile value
    without an ADR amendment or superseding decision.
- `docs/features/SERVICES_FULFILLMENT_PROFILES.md`
  - Current profile vocabulary, shipped/planned status, known gaps, and
    backend roadmap.
- `docs/features/SERVICES_MODE.md`
  - Services item taxonomy, payment and price behavior, stock-exempt service
    rows, and stock-bearing physical add-ons or supplies.
- `docs/features/SERVICES_CHECKOUT_REDESIGN_2026-08-08.md`
  - Current four-step Services checkout shell and its frontend-only limits.
- `docs/development/STOREFRONT_FRONTEND_CODING_STANDARD_AND_FILE_OWNERSHIP.md`
  - Frontend ownership, mapper/flow/API/component separation, tracking
    structure, route ownership, and test gates.

The supplied `services-checkout-flow-variants.md` is treated as a planning
reference. Its own approval boundary must be respected.

## Core rule

Keep one Services storefront shell and change the questions, data presentation,
final action, and tracking timeline according to the service item's
fulfillment profile.

Do not create a second top-level workflow mode for every service type. The
top-level mode remains:

```text
workflow_mode = services
```

The profile is resolved from the existing per-item
`ServiceItemDetail.service_area_type` value when a shipped profile exists.
The profile key is frontend composition metadata; it is not sent to the
backend as a new payload field.

The Store Template/Profile and the fulfillment profile have different grains:

```text
Store Template/Profile
  -> store-level capability, shared sections, shell tokens, journey variant

Service item
  -> service_area_type
  -> frontend fulfillment profile
  -> profile-specific checkout and tracking presentation
```

The template selects the storefront experience that can host Services. The
service item selects the exact fulfillment questions and timeline. Do not put a
raw fulfillment profile key into `STORE_TEMPLATE_PRESETS`, `ops_store_profile`,
the booking API, or a database column. This is required by ADR 0057.

## Template-driven architecture contract

### Configuration precedence

Every Services route should resolve configuration in this order:

1. **Backend effective access and capability state** — the authoritative gate
   for whether catalog, cart, booking, payment, and tracking actions are
   allowed.
2. **Store Template/Profile presentation** — the store-level shell, shared
   section visibility, tokens, `catalogCardVariant`, and `journeyVariant`.
3. **Service-item fulfillment profile** — the per-item checkout fields,
   schedule rules, final action, and tracking presenter.
4. **Runtime booking state** — the current cart lines, customer details,
   selected schedule, holds, API response, and tracking status.

No lower layer may override a higher-level restriction. A profile can compose
the UI for a permitted booking, but it cannot grant booking capability or
bypass an access restriction.

### Runtime pipeline

```mermaid
flowchart LR
  A["Effective store profile and access capabilities"] --> B["getStorefrontModeAdapter"]
  B --> C["normalizeStorefrontPageModel"]
  C --> D["Services storefront view model"]
  D --> E["Resolve profile from service_area_type"]
  E --> F["Shared cart and checkout shell"]
  F --> G["Profile-specific checkout presenter"]
  G --> H["Existing booking API payload"]
  H --> I["Shared tracking shell"]
  I --> J["Profile-specific tracking presenter"]
```

The current frontend implementation uses
`app/runtime/storefrontTemplateRegistry.js`,
`app/runtime/modePresentationRegistry.js`, and
`app/runtime/normalizeStorefrontPageModel.js` for the shell and page model.
Services code must consume the resulting adapter/page model instead of reading
template presets directly.

### Current template limitation

The current `storefrontLayout` capability is a presentation declaration, but
the Store Profile does not yet materialize that layout, and the public
storefront's capability patch does not currently carry the disabled overlay.
The static template registry is therefore a runtime fallback, not proof that
every admin-curated template field already controls the public checkout.

Until that contract is deliberately extended, frontend work must:

- use the effective backend capability/access result as the gate;
- use `modeAdapter.storefrontTemplate` for shared shell presentation;
- resolve the detailed service profile from the service item;
- avoid claiming that a template can select unsupported booking behavior;
- keep template/profile expansion separate from backend schema/API work.

If a future requirement needs an administrator to choose a new checkout or
tracking business behavior through a template, that is cross-boundary work and
requires an ADR amendment or superseding ADR before adding a persisted field or
new API contract.

## SRP and MVVM contract

The Services implementation must follow the storefront's existing MVVM shape:

### Model

Model modules are pure and testable. They own:

- service-item normalization;
- fulfillment-profile resolution;
- cart-line normalization;
- schedule and field rules;
- validation results;
- booking payload mapping;
- tracking response mapping;
- customer-facing status definitions.

Model modules must not render JSX, fetch data, or mutate React state.

### ViewModel

ViewModel hooks own the use-case state and commands for one surface:

- `useServicesStorefrontViewModel` for service catalog presentation;
- `useServicesCheckoutViewModel` for cart, steps, validation, submit, and
  confirmation state;
- `useServicesTrackingViewModel` for lookup, polling, status, and timeline
  state.

Each ViewModel returns a stable view contract such as:

```js
{
  viewModel: normalizedData,
  actions: {
    nextStep,
    previousStep,
    updateField,
    saveDraft,
    submitBooking
  },
  state: {
    loading,
    error,
    canSubmit
  }
}
```

ViewModels may call feature API helpers and model functions, but they must not
contain large JSX trees or make the shared app shell understand service types.

### View

Views render the ViewModel contract:

- `ServicesCheckoutShell` renders the shared step frame;
- profile field presenters render only the fields for the resolved profile;
- `ServicesTrackingShell` renders shared loading/error/lookup layout;
- profile timeline presenters render profile-specific details and labels.

Views must not call booking APIs, construct request bodies, or display raw
backend status codes.

### Integration/composition

Route containers compose the Model, ViewModel, and View layers. They are the
only Services-owned boundary that should connect to the shared storefront
shell.

`StorefrontApp.jsx` should receive or mount one generic Services runtime bundle.
It must not gain profile-specific state, imports, API calls, payload builders,
or tracking branches.

## Terms

| Term | Meaning | Owner |
|---|---|---|
| Services mode | The storefront/IMS/POS workflow mode for service businesses | Shared mode registry |
| Service item | A sellable item with `items.category = service` and service metadata | Services catalog/backend |
| `service_area_type` | Existing per-service value: `in_store`, `customer_location`, `online`, or `hybrid` | Existing Services contract |
| Fulfillment profile | Locale-neutral frontend composition vocabulary derived from the service item | Shared constant, frontend consumer |
| Booking draft | Customer-specific service line state before final booking submission | Services frontend |
| Booking lifecycle | Backend status progression such as requested, confirmed, checked in, in service, and completed | Services backend |
| Tracking timeline | Customer-facing labels mapped from the lifecycle; never raw backend status text | Services frontend presenter |
| Capacity tracking | Availability based on schedules, resources, holds, and quantity; this is not customer booking tracking | Services availability backend |

Keep capacity/availability and customer booking tracking separate. A service
is sellable because a schedule/resource has capacity, while a customer tracks a
booking because the booking has a lifecycle status.

## Profile matrix

The current vocabulary contains eight profiles. Only profiles marked
`shipped` may be offered as production-backed checkout flows.

| Profile | Existing source | Checkout fields | Final action | Production status |
|---|---|---|---|---|
| `appointment_at_business` | `service_area_type = in_store` | Branch, date, time, payment | Confirm appointment | Shipped; use current booking contract |
| `service_at_customer_address` | `service_area_type = customer_location` | Address, map pin, date, time, payment | Confirm booking | Shipped with address/map-pin limitations |
| `online_service` | `service_area_type = online` | Date, time, optional meeting details, payment | Confirm appointment | Shipped with no confirmed meeting-link contract |
| `customer_choice_of_location` | `service_area_type = hybrid` | Branch or address choice, then date/time/payment | Confirm booking | Shipped; show only fields for the selected choice |
| `item_pickup_return` | No current `service_area_type` mapping | Pickup address, pickup schedule, return address, payment | Send booking request | Planned; requires pickup/return logistics |
| `item_pickup_collection` | No current `service_area_type` mapping | Pickup address, pickup schedule, collection branch, payment | Send booking request | Planned; requires pickup/return logistics |
| `item_dropoff_collection` | No current `service_area_type` mapping | Branch, drop-off/collection details | Send booking request | Planned; normally staff-recorded in POS |
| `quote_request` | No current `service_area_type` mapping | Contact, service details, photos/notes, optional preferred time | Request a price | Planned; requires quote lifecycle |

The frontend must not silently map a planned profile to the existing generic
booking flow. It must show an honest unavailable/planned state or keep the
experience in an explicitly labelled browser-only simulation.

## Target frontend architecture

The implementation should preserve the existing Services branch and add
profile-specific leaf modules behind a single mode-owned runtime:

```text
StorefrontApp
  -> one generic Services runtime bundle
  -> Services route/container boundary
      -> Services storefront ViewModel
      -> one storefront/catalog surface
      -> one cart surface
      -> one checkout route/container
          -> shared checkout shell
          -> profile-specific field presenter
          -> profile-specific validation and final action
      -> one confirmation surface
      -> one tracking route/container
          -> shared tracking shell
          -> profile-specific timeline presenter
```

The existing Services components remain the fallback until a profile-specific
experience is complete. A new profile must not remove the current Services
catalog, cart drawer, booking wizard, confirmation, or other service flows.

The stable integration seam should be a small bundle, for example:

```js
const servicesRuntime = {
  storefront: servicesStorefrontViewModel,
  checkout: servicesCheckoutRuntime,
  tracking: servicesTrackingRuntime,
  template: modeAdapter.storefrontTemplate,
  access: accessCapabilities
};
```

The shared app may pass this bundle to a route/container, but it must not
inspect `appointment_at_business`, `online_service`, or another profile key.

### Required ownership split

Follow the existing frontend standard:

1. **Mapper**
   - Normalizes API/catalog data into frontend-safe service data.
   - Resolves the shipped fulfillment profile from `service_area_type`.
   - Does not fetch, render JSX, or manipulate the DOM.

2. **Flow helper**
   - Owns step visibility, field requirements, validation, submit readiness,
     and profile-specific final-action rules.
   - Does not contain large visual markup.

3. **API helper**
   - Owns availability, hold, booking, batch booking, booking lookup, and
     claim requests.
   - Does not render UI or construct transport requests inside components.

4. **Components**
   - Render catalog cards, cart lines, checkout steps, confirmation, and
     tracking views.
   - Receive normalized data and callbacks instead of owning backend payload
     construction.

5. **Tracking presenter**
   - Maps Services statuses into customer-facing labels and timeline states.
   - Does not display raw backend status names directly.

## Suggested source layout

Use the existing `apps/dgfy-storefront/src/modes/services` ownership. Do
not place Services behavior inside F&B or generic product checkout files.

```text
apps/dgfy-storefront/src/modes/services/
  storefront/
    components/
    model/
    mappers/
  booking/
    components/
    hooks/
      useServicesCheckoutViewModel.js
      useServicesCheckoutRouteProps.js
    model/
      resolveServiceFulfillmentProfile.js
      buildServicesCheckoutViewModel.js
      buildServicesBookingPayload.js
    mappers/
    api/
    profiles/
      appointmentAtBusiness/
      serviceAtCustomerAddress/
      onlineService/
      customerChoiceOfLocation/
  tracking/
    components/
    hooks/
      useServicesTrackingViewModel.js
      useServicesTrackingRouteProps.js
    model/
      servicesTrackingRegistry.js
      servicesTrackingStatus.js
    mappers/
    api/
    pages/
      ServicesTrackingRouteContainer.jsx
```

The current repository already has Services storefront and booking ownership.
The `tracking/` area is the intended next boundary for a dedicated Services
tracking presenter and route. Do not copy the F&B tracking view and rename its
labels; Services has different lifecycle semantics.

The existing `useServiceBookingViewModel.js` is Services-specific behavior
under `shared/hooks`. New work should place the authoritative implementation
under Services ownership and leave only a compatibility wrapper if an existing
caller still needs one during extraction.

## Service offering and profile resolution

At catalog load or service selection:

1. Normalize the service item.
2. Read `service_detail.service_area_type`.
3. Resolve the matching shipped profile from
   `@sieitzz/shared-constants/fulfillmentProfiles`.
4. Store the resolved profile in frontend view state for composition only.
5. Select the profile-specific catalog card, cart layout, checkout flow, and
   tracking presenter.

The profile resolution must be deterministic. Unknown or missing values must
use the existing Services fallback and must not guess from translated labels
unless the current compatibility behavior is explicitly retained and tested.

Example frontend-only view model:

```js
{
  serviceItemId,
  name,
  description,
  price,
  durationMinutes,
  serviceAreaType: 'in_store',
  fulfillmentProfileKey: 'appointment_at_business',
  paymentPolicy,
  intakeFields,
  availabilityCapabilities,
  profileStatus: 'shipped'
}
```

`fulfillmentProfileKey` must not be copied into the booking request body.

## Cart data contract

Every service cart line must retain its own booking context. Do not store one
global service schedule or location when the cart can contain multiple service
drafts.

Minimum frontend draft shape:

```js
{
  lineId,
  serviceItemId,
  quantity,
  fulfillmentProfileKey, // frontend-only composition metadata
  startAt,
  locationId,
  resourceId,
  paymentTiming,
  intakeResponses,
  addOns,
  specialInstructions,
  customerDetails,
  addressDraft,
  holdToken
}
```

Rules:

- Keep schedules, resources, intake answers, payment timing, and holds per
  draft.
- Preserve typed customer values when demo defaults or saved details are
  applied; fill only missing values.
- Do not mix product and service cart lines unless the existing checkout
  contract explicitly supports that combination.
- If multiple service profiles are present, keep each profile's data attached
  to its own line. The first profile must never control every line.
- Submit compatible drafts through the existing batch booking contract. If a
  new profile cannot be safely represented by the current contract, block it
  honestly rather than dropping fields.

## One storefront, cart, checkout, and tracking contract

All Services types use the same customer journey entry points:

1. **One storefront** — the template-driven Services shell, catalog, shared
   navigation, shared footer, and responsive layout.
2. **One cart** — one Services cart state containing independent line-level
   profile and booking data.
3. **One checkout** — one shared checkout shell whose steps and fields are
   composed by the resolved profile.
4. **One confirmation** — one confirmation contract showing the booking
   reference, selected service data, schedule, payment state, and next action.
5. **One tracking entry point** — one tracking route/drawer that delegates the
   timeline and details to the resolved profile presenter.

The UI may look different per profile, but the outer ownership and navigation
contract must remain stable. This lets a salon, laundry, home-cleaning, or
online-consultation service use different questions and timelines without
creating a second storefront application.

Profile-specific differences belong in leaf modules:

```text
same storefront shell
  + same cart contract
  + same checkout route
  + same tracking route
  + different profile field presenter
  + different profile validation rules
  + different profile summary presenter
  + different profile timeline presenter
```

## Checkout flow by profile

The four-step shell remains shared:

```text
1. Customer
2. Add-ons and instructions
3. Fulfillment, schedule, and payment
4. Review and final action
```

### Appointment at the business

Show:

- branch;
- date and time;
- service-specific intake fields;
- payment options allowed by the service policy and tenant capability;
- appointment review.

Do not show a delivery address, pickup address, return address, or map pin.
The final action is `Confirm appointment`.

### Service at the customer's address

Show:

- service address;
- map pin only if the backend payload and persistence contract support it;
- visit date and time;
- payment options;
- appointment review.

The address is the service-visit location, not a delivery address. Until a
first-class backend address contract exists, document the notes workaround and
do not claim coordinates are persisted.

The final action is `Confirm booking`.

### Online service

Show:

- date and time;
- meeting instructions only when supported by the service payload;
- payment options;
- appointment review.

Do not show a branch, delivery address, or map pin. Do not invent a meeting
link. The final action is `Confirm appointment`.

### Customer chooses the location

First show:

- `Visit the branch`;
- `At my address`.

Then show only the fields for the selected choice. Do not display branch and
home-address fields together unless the product explicitly supports comparing
saved locations. The final action is `Confirm booking`.

### Planned pickup, drop-off, and quote profiles

These profiles require a separate backend design before production checkout:

- pickup/return addresses and time windows;
- collection branch;
- round-trip logistics legs and events;
- quote request and quote approval lifecycle;
- payment behavior when no final total exists.

Until those contracts exist, the frontend may show a labelled simulation or a
planned preview only. It must not call the normal booking endpoint with fields
that the backend cannot persist.

## Current Services API boundary

For the four currently mapped profiles, the frontend may use the existing
Services storefront contracts:

| Need | Endpoint or contract | Frontend rule |
|---|---|---|
| Slot availability | `GET /api/v1/store/services/availability` | Treat as advisory; final booking revalidates capacity |
| Short-lived hold | `POST /api/v1/store/services/holds` | Keep `hold_token` per draft and handle expiry safely |
| One booking | `POST /api/v1/store/services/bookings` | Send only fields accepted by the current validator |
| Multiple drafts | `POST /api/v1/store/services/bookings/batch` | Preserve all draft references and payment handoffs |
| Signed-in booking history | `GET /api/v1/store/services/bookings` | Require the authenticated customer session |
| Public booking lookup | `GET /api/v1/store/services/bookings/:public_reference` | Return customer-safe data only |
| Claim booking | `POST /api/v1/store/services/bookings/:public_reference/claim` | Follow the existing claim-token contract |

The current request fields include service item, quantity, start time,
location/resource when applicable, payment timing, idempotency key, hold token,
intake responses, customer details, and notes.

## Tracking flow

The target tracking architecture is:

```text
Booking confirmation/reference
  -> shared TrackingShell
  -> Services tracking API adapter
  -> Services status mapper
  -> profile-specific customer timeline
```

The shared shell owns:

- loading;
- refresh/polling;
- error and retry states;
- route and drawer mounting;
- guest and signed-in entry handling.

The Services presenter owns:

- booking summary;
- appointment or visit information;
- service-specific status timeline;
- profile-specific labels;
- completion and cancellation states;
- claim or account-link actions where supported.

### Shipped lifecycle labels

The current backend lifecycle is:

```text
requested -> confirmed -> checked_in -> in_service -> completed
```

It also supports `cancelled` and `no_show` outcomes. Customer copy may be:

```text
Request received
Booking confirmed
Ready for your appointment
Checked in
Service in progress
Completed
Cancelled
No-show
```

The exact copy may be localized, but the meaning and ordering must remain the
same in English and Filipino.

### Do not invent tracking events

Do not show `staff on the way`, `for pickup`, `pickup completed`, `out for
return`, `ready for collection`, or `quoted` until the backend persists and
returns those events through an approved contract. A profile may define those
events as planned vocabulary, but a frontend timeline must not imply that they
occurred.

## Backend support matrix

Before claiming a service type is production-ready, confirm the backend
supports the data the frontend displays.

| Requirement | Current state | Backend work needed |
|---|---|---|
| Per-item profile selection | `service_area_type` supports four shipped values | No new profile database field under ADR 0057 |
| Branch appointment | Existing location/resource/availability contract | Confirm validation and customer-safe lookup fields |
| Customer service address | Current notes workaround | First-class address snapshot and validation |
| Map pin | No confirmed Services booking coordinate payload | Add explicit latitude/longitude or governed location contract |
| Hybrid location choice | Frontend composition can choose branch or address | Persist the selected location semantics safely |
| Online meeting details | No confirmed meeting-link contract | Add meeting-detail/link fields, access rules, and expiry behavior |
| Add-ons | Must come from real service/catalog data | Define option catalog and price/time snapshot contract if absent |
| Pickup and return | `DeliveryJob` is one-way and POS-transaction based | Add service booking logistics legs, addresses, windows, and transitions |
| Drop-off and collection | No flexible handoff event contract | Add staff/POS event recording and customer visibility rules |
| Quote-first | No quote state or quoted amount | Add request, review, quote, acceptance, expiry, and payment semantics |
| Deposits | `deposit` is currently only a timing label | Add amount/percentage, balance due, partial payment status, and settlement |
| Payment capabilities | Services does not fully reuse tenant payment filtering | Apply the approved tenant payment capability contract |
| Customer tracking | Public booking lookup exists | Add/verify a Services tracking presenter and customer-safe timeline data |
| Timeline history | Status exists but transition timestamps are limited | Add event/timestamp history if the UI requires an auditable timeline |

Any row that adds a database column, API field, enum, or Store Profile behavior
requires an ADR amendment or superseding decision before implementation.

## Adding a new profile safely

For a new frontend developer, use this sequence:

1. Read the governing documents and identify whether the profile is `shipped`
   or `planned`.
2. Confirm the source service item data and existing API payload can represent
   every field the proposed UI will display.
3. Add or update the shared profile constant only when the vocabulary itself
   is approved; do not create translated profile keys.
4. Add a normalized profile mapper under Services ownership.
5. Add the profile-specific cart model and checkout flow.
6. Add the profile-specific tracking presenter and status map.
7. Register the profile through the Services resolver.
8. Keep the existing Services flow as the fallback for unknown, mixed, or
   unsupported data.
9. Add tests before changing shared shells.
10. Run desktop/mobile and English/Filipino rendered checks.
11. If backend support is missing, stop at a simulation or blocked state and
    create a backend support handoff instead of guessing a payload.

The change must remain inside `modes/services` unless the behavior is truly
identical across modes. Shared shell changes require regression coverage for
Services, F&B, retail/simple, desktop, and mobile.

## Mixed-profile carts

A business may sell multiple service profiles at the same time. The cart must
not lose the profile of any line.

Preferred behavior:

- each line keeps its own profile and booking draft;
- each line keeps its own schedule, resource, intake responses, and hold;
- the review groups lines by booking draft or profile without merging
  incompatible schedules;
- the existing batch booking endpoint receives compatible drafts together;
- unsupported profile lines are blocked clearly before submission.

If the first implementation cannot support mixed profiles safely, restrict the
cart to one profile at a time and explain why. Do not silently render one
profile's fields for another line.

## Testing and review gates

### Unit and contract tests

- Every supported `service_area_type` resolves to exactly one shipped profile.
- Unknown profile values use the safe fallback.
- Planned profiles cannot submit through the normal booking flow.
- Each profile shows only its allowed checkout fields.
- Required fields validate at the current step only.
- Profile keys are not present in API payloads.
- Cart lines preserve independent schedules, intake answers, payment timing,
  and holds.
- Status mapping never renders raw backend values as customer copy.
- Cancelled, no-show, expired-hold, capacity-conflict, and retry states are
  covered.

### Integration tests

For each shipped profile, test:

```text
catalog -> add service -> cart -> checkout -> hold -> submit -> confirmation
       -> public tracking -> signed-in account history when authenticated
```

Also test:

- guest and signed-in customer paths;
- auth redirect and exact checkout resume;
- batch booking with more than one draft;
- mixed-profile cart safety;
- service-hours and capacity rejection;
- hold replacement and expiry;
- payment failure without duplicate booking;
- desktop and mobile layouts;
- English and Filipino structure and meaning.

### Manual rendered review

Before release, verify the affected storefront route in desktop and mobile
viewports. Confirm:

- page identity and nonblank content;
- no framework error overlay;
- no console errors for the route;
- the primary service selection interaction works;
- the profile-specific checkout fields appear correctly;
- the review reflects the selected service data;
- confirmation contains the correct public reference;
- tracking can be opened from confirmation, storefront entry, and dashboard
  where those entry points are supported.

## Definition of done

A service-type frontend flow is ready only when:

- its profile is explicitly classified as shipped or planned;
- its cart data shape is documented;
- every checkout field has a backend source or an explicit limitation;
- its final action matches the real business outcome;
- its tracking timeline uses persisted backend states;
- its profile-specific modules are isolated under Services ownership;
- the existing Services storefront remains available;
- the API payload contains no unapproved profile field;
- tests cover positive, negative, retry, and adjacent-flow behavior;
- desktop/mobile and English/Filipino evidence is recorded;
- backend schema/API work has its required ADR and migration/rollback plan.

## Rollback and compatibility

Profile-specific frontend work must be removable by deleting the profile
registration and its leaf modules. The existing Services fallback must remain
usable so an unknown or temporarily unsupported service item does not produce a
blank storefront or an invalid booking.

Frontend-only work may ship independently when it uses existing contracts. Do
not merge frontend UI that displays data the backend cannot persist or return.
For backend changes, coordinate the API, migration, tenant-provisioning,
rollback, and customer-tracking evidence before enabling the profile.
