# Services Storefront Push Handoff — Laundry and AC

**Audience:** Services backend, platform, frontend, QA, and release maintainers
**Last updated:** 2026-09-03
**Branch:** codex/services-storefront-next
**Push status:** Not pushed
**Scope:** Services storefront only; Laundry and AC service types. Salon is excluded.

This is the current handoff for the Services storefront work on this branch. It documents what the frontend push fulfills, what remains backend work, the recommended template and data model direction, and the validation and release boundaries.

The documentation is intentionally explicit about the difference between:

- frontend behavior that is already implemented and committed;
- backend capabilities that already exist in the repository;
- backend work that is recommended but is not part of this push.

The current follow-up also corrects a Services palette propagation defect found after the previous push: the Services hero follow control could inherit a legacy mode accent even though the rest of the Services presentation used the approved blue palette. The follow control is now explicitly bound to the Services primary/success tokens, and the correction is covered by the existing Services palette and presentation tests.

## 1. Executive decision

The current push is a frontend Services storefront implementation. It does not add or change API routes, database migrations, booking persistence, availability authority, payment processing, or production scheduling.

The best backend direction is one shared, allowlisted Services storefront composition with data-driven service rows:

1. A Services template family selects the approved layout and presentation defaults.
2. Published storefront presentation data supplies optional business copy and approved visual tokens.
3. Service catalog data supplies service names, descriptions, images, prices, variations, add-ons, intake fields, and service area.
4. Operational data supplies hours, timezone, lead time, duration, capacity, blackout dates, availability, and holds.
5. Booking and tracking data supplies server-authoritative snapshots and status events.

Do not create a separate hardcoded frontend template for every laundry shop, air-conditioning company, or future service business. Do not put arbitrary HTML, JavaScript, routes, or business rules in a database template.

The template should compose the storefront. It must not become a second source of truth for fulfillment rules, pricing, availability, or booking behavior.

## 2. Governing decisions and references

The implementation follows the repository documentation lookup order and these decisions:

- [Repository start here](../START_HERE.md)
- [Architecture boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md)
- [Architecture governance](../architecture/ARCHITECTURE_GOVERNANCE.md)
- [ADR 0016 — Services mode independent booking and ticketing](../architecture/adr/0016-services-mode-independent-booking-and-ticketing.md)
- [ADR 0056 — Store configuration templates and profiles](../architecture/adr/0056-store-configuration-templates-and-profiles.md)
- [ADR 0057 — Services fulfillment profiles](../architecture/adr/0057-services-fulfillment-profiles.md)
- [Services fulfillment profiles](../features/SERVICES_FULFILLMENT_PROFILES.md)
- [Services mode](../features/SERVICES_MODE.md)
- [Services checkout and tracking frontend guide](SERVICES_STOREFRONT_CHECKOUT_TRACKING_FRONTEND_GUIDE.md)
- [Implementation phase ledger](../features/IMPLEMENTATION_PHASE_LEDGER.md)

Important constraints from those documents:

- API flow remains routes, controllers, use cases, repositories, and models. Controllers transport data; use cases own business decisions; repositories own persistence.
- A template or profile may compose existing capabilities, but it must not introduce a new enum, database column, or business rule by itself.
- The accepted fulfillment vocabulary is engineering-owned and is not a raw tenant-facing database value.
- Fulfillment behavior is resolved per service item, not by a single store-wide template.
- A raw fulfillment profile key must not be sent in a public booking request or stored as a Store Profile field without an approved architecture change.
- Templates propose a presentation or composition; policy and operational services decide whether a booking can proceed.

No new repository phase number is introduced by this handoff. Any backend sequence below is a recommended implementation sequence, not a phase entry in the authoritative phase ledger.

## 3. Current push inventory

### 3.1 Services commits already on the branch

The complete Services storefront series currently present on the branch is:

| Commit | Type | Delivered area |
| --- | --- | --- |
| 60c90166 | feat(services-storefront) | Storefront presentation alignment, replayed onto latest `origin/develop` |
| 0d10b0f6 | feat(services-storefront) | Cart, booking, and tracking completion, replayed onto latest `origin/develop` |
| 72758315 | fix(services-storefront) | Repair replayed source/test contracts after the upstream storefront-directory rename |
| current | docs(services-storefront) | This frontend/backend handoff |

The latest audited Services commits are 60c90166, 0d10b0f6, and 72758315. The first two are the feature batches; 72758315 is the small replay-repair batch required by the updated upstream base. The documentation commits are intentionally separate.

The unpushed palette-correction follow-up updates the rendered Services surfaces that could drift from the template palette, including the shared catalog toolbar, Services hero, catalog/promo sections, booking/cart surfaces, and Services presentation regression coverage. It is limited to Services mode behavior used by Laundry and AC. F&B and Salon presentation paths are not part of this correction.

The clean replay is five commits ahead of the fetched `origin/develop` base and zero commits behind it: two feature batches, one replay-repair batch, and two documentation batches. Earlier shared history is already part of that base; no unrelated dirty-worktree commits were replayed.

This document update is intentionally a separate documentation commit. The push remains gated on the final validation below; the final remote commit SHA will be recorded in the release handoff after the explicit push completes.

### 3.2 Files and boundaries

The committed Services storefront work is in the web application and its related tests, primarily under:

- apps/dgfy-storefront/src
- apps/dgfy-storefront/src/modes/services
- apps/dgfy-storefront/src/shared
- apps/dgfy-storefront/src/StorefrontApp.jsx, limited to the committed Services integration
- related web tests under apps/dgfy-storefront

The current push does not include backend source or migration changes. The repository currently has unrelated and/or uncommitted backend changes in apps/dgfy-api and apps/dgfy-migration-runner. Those files must stay excluded unless separately reviewed and committed as backend work.

The mixed StorefrontApp.jsx file has a remaining dirty F&B-only hunk in the worktree. That hunk is not part of the Services push and must not be staged accidentally.

## 4. Fulfilled by the current frontend push

The following items are fulfilled as frontend behavior and local test coverage. “Fulfilled” here does not mean that the backend has production persistence or authority for the behavior.

| Area | Current result | Scope note |
| --- | --- | --- |
| Storefront presentation | A reusable Services shell uses normalized storefront data and a Services visual language. | Applies to Laundry and AC; Salon is not included. |
| Service copy | Generic Services fallback copy is used when business-specific copy is absent. | No single-business copy is required in the component. |
| Services palette | Service storefront colors are kept separate from the F&B palette for Services UI elements, icons, accents, focus states, and shadows. | Future theme overrides must remain token-based and allowlisted. |
| Hero and metadata | Tagline, rating display, follower count, category, and location are rendered from available storefront data. | An unrated storefront displays 0.0 rather than “new storefront.” |
| Number formatting | Service prices and totals use formal currency formatting with comma grouping at the correct places. | Backend remains authoritative for money values. |
| Service catalog | Service cards, images, prices, availability state, variants, and option selectors are rendered from catalog data. | Missing images and unavailable services have explicit UI states. |
| Price and category controls | Price uses a funnel icon; Service Categories uses the category icon and one-line label layout. | Controls are reusable across Services catalog data. |
| Service variants | Variation selection is kept on the service card and is not treated as an add-on. | Variation values are catalog data. |
| Add-ons | Add-ons are shown as selectable rows when active option groups are returned for the service. When none are returned, the UI shows the empty state. | The backend must provide active associations and enforce them again. |
| Cart identity | Repeating the same service with the same selected options increments quantity instead of adding a duplicate line. Different option combinations remain separate lines. | The backend must apply the same identity rule at booking time. |
| Cart quantity | The middle quantity value can be edited, accepts digits only, and uses numeric input behavior on mobile. Plus, minus, blur, and keyboard submission are handled by the cart flow. | Server-side quantity limits are still required. |
| Cart layout | Cart item spacing, prices, totals, empty space, and responsive controls were aligned. The mobile cart uses the requested bottom-up presentation and keeps the background state stable when opened and closed. | Motion is frontend-only. |
| Cart navigation | Add more items returns the customer to the Services catalog. | It does not create a second storefront. |
| Booking steps | Services booking keeps the customer, add-ons, fulfillment, and payment/review progression. | AC and Laundry use the shared shell with service-specific composition. |
| Laundry handoff | The Laundry UI retains the handoff choices and location-selection design already established for the Services storefront. | Physical pickup/return/collection remains dependent on backend logistics support. |
| AC service visit | AC uses service timing and customer-location behavior rather than a Laundry handoff presentation. | The canonical service area must come from service data. |
| Schedule UI | Calendar month/year navigation, date selection, available time buttons, selected-date highlighting, Change date behavior, and selected date/time summaries are implemented. | Local availability is a development fallback, not production authority. |
| Schedule layout | Calendar and time selection use matching containers, balanced spacing, four-column time buttons where space allows, and the selected summary sits beside the calendar in the final desktop composition. | Responsive layout reflows on smaller screens. |
| Schedule state | The calendar is locked after a complete selection until Change date is used; the selected time is highlighted; the summary updates after selection. | The backend must revalidate the final selection. |
| Future dates | The frontend does not use a fixed five-year or single-month navigation limit. | The server should return valid availability and policy limits; the client must not invent slots. |
| Location | Saved locations, current location, map pin adjustment, selected address, and service-address summaries use the shared location flow. | The backend must snapshot the address used for the booking. |
| Review | Review modal fields, yellow stars, mobile focus handling, and keyboard visibility were optimized. | Review submission remains subject to backend review support. |
| Tracking | Tracking normalizes multiple service items/lines and displays more than one service when the response contains multiple items. | The tracking API must return all booking lines/items. |
| Local simulation | Development-only Services simulation supports UI iteration without creating a real booking or payment. | It must never be enabled as production booking authority. |

## 5. Frontend data flow

The intended data flow is:

    public Services catalog/bootstrap response
        -> storefront loader
        -> normalized storefront page model
        -> Services presentation/view model
        -> catalog, cart, booking, schedule, and tracking adapters

The current frontend also has development-only fallbacks:

- servicesLocalFlow.js supplies local preview definitions and schedule behavior;
- serviceBookingSchedule.js derives local slots from storefront/service hours when real availability is not available;
- servicesLocalSimulation is used only in development;
- serviceTrackingAdapter.js can normalize local or real tracking shapes.

These fallbacks explain why the UI can appear complete while server-backed booking behavior is still incomplete. The backend handoff must replace the authority, not merely make the local mock return a different shape.

The most important canonical service input is service_detail.service_area_type. The frontend may accept legacy shapes while data is normalized, but new backend responses should provide the canonical field consistently.

## 6. Backend capabilities already present

The repository already contains a Services API surface. The backend handoff should extend and harden it rather than create a parallel booking system.

### 6.1 Public/storefront routes already present

The existing public Services route family includes:

- GET /api/v1/store/services/catalog
- GET /api/v1/store/services/availability
- GET /api/v1/store/services/bookings
- POST /api/v1/store/services/bookings
- POST /api/v1/store/services/bookings/batch
- POST /api/v1/store/services/holds
- GET /api/v1/store/services/bookings/:public_reference
- POST /api/v1/store/services/bookings/:public_reference/claim
- POST /api/v1/store/services/waitlist
- GET /api/v1/store/track/:tracking_pin

The exact route prefixes should be confirmed against the mounted router before contract changes. The list above reflects the current repository route ownership, not a request to add duplicate routes.

### 6.2 Admin and POS service capabilities already present

The Services route family also has admin/POS support for catalog CRUD, resources, assignments, bookings, status changes, settlement, waitlist, clients, reminders, quotes, option-group CRUD, option deactivation, and service-item option-group assignment.

This means the main gap is not “the backend has no Services model.” The gap is consistent public composition, authoritative availability, option validation, multi-line booking snapshots, location snapshots, and a safe published template/presentation contract.

### 6.3 Current catalog fields relevant to the storefront

The existing service serializer already exposes, or is designed to expose, fields such as:

- service detail identifier;
- service category;
- duration and before/after buffers;
- lead time;
- cancellation window;
- bookable and storefront/POS visibility;
- add-ons enabled;
- payment policy;
- service_area_type;
- intake form schema;
- client notes template;
- service option groups and active options;
- variants and images.

Option groups distinguish variation and add-on behavior, selection type, minimum and maximum selections, required state, price adjustments, and duration adjustments.

The backend must treat these values as server-side data and validate them again at booking time. The browser is not a trusted source for prices, option eligibility, duration, availability, or totals.

## 7. Backend handoff guide

### 7.1 Immediate backend goals

The backend implementation should close these gaps in this order:

1. Make the public Services read model publish only active, visible, bookable data and a stable response contract.
2. Return one composed Services bootstrap/read model for presentation defaults, published content, catalog data, and booking configuration.
3. Make availability server-authoritative, timezone-aware, capacity-aware, and compatible with holds.
4. Validate option-group associations, variation/add-on rules, price adjustments, duration adjustments, and quantity server-side.
5. Persist booking line and option snapshots so later catalog edits do not rewrite an existing booking.
6. Persist the service area and selected address snapshot for customer-location bookings.
7. Return every booking item and line to tracking, including item-level status and service details.
8. Add idempotency, conflict protection, observability, and safe retries for booking and hold operations.

### 7.2 Recommended API shape

Keep the current catalog, availability, booking, batch, hold, and tracking routes backward compatible while adding the missing fields or a dedicated composition endpoint.

The preferred long-term read path is a dedicated public Services bootstrap endpoint, for example:

    GET /api/v1/store/services/bootstrap

This endpoint is a proposal, not an implemented route in the current push. It should compose:

- workflow mode: services;
- an allowlisted presentation template key and version;
- published presentation content;
- service catalog items;
- service detail, variation, and add-on data;
- timezone and booking configuration;
- supported operational capabilities.

Existing GET /services/catalog and GET /services/availability routes should remain usable during migration. The new bootstrap response can be introduced additively and adopted behind a frontend feature flag.

The public booking routes should continue to accept canonical service and option identifiers, quantities, intake responses, location data where required, schedule data, and an idempotency key. They should not accept a raw tenant-defined fulfillment profile as an instruction to the server.

### 7.3 Proposed bootstrap response

The following is a proposed contract for discussion:

    {
      "storefront": {
        "workflow_mode": "services",
        "template_key": "services_default",
        "template_version": 1
      },
      "presentation": {
        "eyebrow": null,
        "heading": null,
        "subheading": null,
        "hero": null,
        "why_choose_us": [],
        "palette": "services"
      },
      "booking": {
        "timezone": "Asia/Manila",
        "supports_availability": true,
        "supports_holds": true,
        "supports_customer_location": true
      },
      "service_items": []
    }

This is a proposed read model only. It must not be copied into the current API without contract review, schema review, and compatibility tests.

Notes:

- template_key is an allowlisted presentation/composition key, not a fulfillment rule;
- palette is a mode token, not permission to inject arbitrary CSS;
- presentation fields may be null and should fall back to generic Services copy;
- service_items remain the source of service-specific data;
- service_area_type belongs to each service item/detail;
- booking capability flags describe available server capabilities, not client permission to bypass validation.

### 7.4 Proposed availability response

Availability should return server-generated slots rather than requiring the client to derive production slots:

    {
      "timezone": "Asia/Manila",
      "service_item_id": "…",
      "date": "2026-09-23",
      "slots": [
        {
          "start_at": "2026-09-23T09:00:00+08:00",
          "end_at": "2026-09-23T10:00:00+08:00",
          "available": true,
          "remaining_capacity": 1,
          "hold_required": true
        }
      ],
      "policy": {
        "lead_time_minutes": 120,
        "max_bookable_at": "2026-12-31T23:59:59+08:00"
      }
    }

The client may navigate future months and years, but it must render only dates and slots the server marks available. A future date being navigable does not make it bookable.

### 7.5 Booking and hold requirements

For POST /services/holds, POST /services/bookings, and POST /services/bookings/batch:

- validate that every service item is active, visible, bookable, and belongs to the requested storefront;
- validate every variation and add-on against the current active association;
- validate group selection type, required state, minimum, and maximum selections;
- recalculate price, duration, tax/fee inputs, and totals on the server;
- validate quantity limits and reject zero, negative, fractional, or excessive values;
- validate requested slots again immediately before creating a hold or booking;
- use a hold token or equivalent conflict control when required;
- expire holds deterministically and report an actionable conflict;
- support an idempotency key so retries do not create duplicate bookings;
- save catalog, option, price, duration, and location snapshots on the booking line;
- preserve the selected service_area_type at booking time;
- return a stable public reference and all created booking items/lines.

For a multi-service cart, different service items may have different service areas and durations. The server must define whether the batch requires one shared slot, separate slots, or a coordinated availability decision. The frontend must not silently assume that all lines can use the first service’s schedule.

### 7.6 Tracking requirements

GET /services/bookings/:public_reference and the public tracking route should return:

- booking reference and created date;
- total and currency;
- every booking line/item, not only the first item;
- quantity and selected variation/add-on summaries;
- line totals and booking total;
- service-area/handoff summary;
- selected address snapshot where applicable;
- selected date/time or appointment window;
- item-level status where the backend supports it;
- status history or event timestamps where permitted;
- payment state and any safe customer-facing next action.

The current serviceTrackingAdapter.js already normalizes root.items, booking.items, or booking.lines. That adapter is prepared for multiple items, but it cannot display data the API does not return.

## 8. Best recommendation for backend templates

### 8.1 Use a composition model, not a business-specific template

The recommended model has five layers:

| Layer | Owns | Must not own |
| --- | --- | --- |
| Services template family | Approved layout composition, component availability, safe default copy, Services token family | Prices, schedules, arbitrary code, booking rules |
| Published presentation config | Eyebrow, heading, subheading, hero content, why-choose-us items, approved visual token overrides | Fulfillment decisions, availability, raw HTML/JavaScript |
| Service catalog | Service identity, category, images, price, variations, add-ons, intake, service_area_type | Store-wide layout |
| Operational policy | Hours, timezone, lead time, duration, buffers, capacity, blackout dates | Marketing copy |
| Booking/tracking record | Server snapshots, references, holds, status events, payment state | Live re-reading of mutable catalog data |

This gives the storefront one reusable flow while allowing a laundry business and an AC business to use different service rows, timing, location, and content.

### 8.2 Where eyebrow and heading belong

For the current push, generic Services fallback copy is acceptable:

- eyebrow: Services;
- heading: Choose the service you need.

When merchant-specific copy is ready, it should come from published presentation data, not from a service-specific React branch. A safe precedence order is:

    Services defaults
        -> published Services template defaults
        -> published tenant presentation overrides
        -> service catalog data
        -> live availability and booking state

Before adding a new database table, check whether the existing storefront settings already support these presentation fields. If they do, expose them through a typed Services read model.

If they do not, add a separate published presentation configuration read model only after contract and architecture review. Do not silently add marketing fields to the Store Profile if that would conflict with ADR 0056 or ADR 0057.

### 8.3 Suggested storage direction

The following is a design suggestion, not a migration request:

    storefront_presentation_config
      tenant_id
      mode
      template_key
      template_version
      content_json
      schema_version
      status
      revision
      published_at
      created_at
      updated_at

Recommended rules:

- one published record per tenant and mode;
- draft and published states are separate;
- content_json is validated against a versioned schema;
- only allowlisted keys are accepted;
- no HTML, JavaScript, arbitrary CSS, route names, SQL, or executable expressions;
- publish operations are audited;
- published configuration is cached with an explicit invalidation path;
- missing or invalid content falls back to the Services default;
- tenant content cannot reference another tenant’s asset or service item;
- template definitions remain engineering-owned and versioned in code/configuration;
- template/profile materialization follows the rules in ADR 0056 rather than being continuously dereferenced as hidden business logic.

If customization is not yet being implemented, the least risky first step is to keep the template key and Services defaults in the frontend registry, while backend work focuses on catalog, availability, booking, and tracking contracts. Add merchant presentation persistence later through the approved settings/configuration path.

### 8.4 Laundry and AC application

For Laundry:

- use the shared Services template;
- render Laundry service items, variations, add-ons, and copy from catalog/presentation data;
- use the service area and operational policy to determine whether the flow is customer-location, appointment, or a future item pickup/return capability;
- do not claim that a pickup/return flow is production-ready until backend logistics, address handling, and status transitions are implemented.

For AC:

- use the same Services template;
- render AC service items and the customer-location service area from service data;
- use service-visit availability and customer address selection;
- show the selected date/time and address as server-validated booking details;
- do not add a separate AC-only storefront implementation when the difference is data and service capability.

Salon is excluded from this push and should not be used as a test fixture or implementation branch for this handoff.

## 9. Backend contract acceptance criteria

### Catalog and presentation

- Only active, visible, permitted Services data is returned.
- The response is versioned and backward compatible.
- Generic Services copy works when presentation fields are absent.
- Template keys and palette tokens are allowlisted.
- The response never contains executable content.
- Tenant and asset boundaries are enforced.

### Variations and add-ons

- Variation and add-on groups are distinguishable.
- Inactive options and unassigned options are not returned as selectable.
- Required, single, multi, minimum, and maximum rules are enforced server-side.
- Price and duration adjustments use integer minor units and validated duration values.
- Existing bookings retain option snapshots after catalog edits.

### Schedule and availability

- Availability is calculated using the service/store timezone.
- Lead time, duration, buffers, hours, capacity, blackout dates, and booking horizon are enforced by the server.
- Future month/year navigation does not imply future availability.
- A date/time is revalidated at hold and booking creation.
- Conflicts and expired holds are deterministic and user-readable.

### Locations

- Customer-location services require an address before booking confirmation.
- The booking stores a normalized address snapshot and coordinates only as allowed.
- The location used for the booking cannot change because a saved address was later edited.
- Pickup/return logistics identify the required collection and return states before being enabled.

### Booking and payment

- Booking creation is idempotent.
- Batch booking defines the scheduling rule for multiple service items.
- Totals are recalculated server-side.
- Payment timing and payment status are separate from storefront presentation.
- Booking status changes are recorded as auditable events.

### Tracking

- Tracking returns every service item/line.
- Item and booking totals reconcile.
- Status, schedule, handoff, address, and payment state are consistent with the booking snapshots.
- A missing or expired public reference returns a clear not-found response without exposing private data.

### Reliability and security

- Public catalog/availability responses have appropriate cache headers and invalidation behavior.
- Rate limits return Retry-After where applicable.
- Retries use idempotency and backoff; the frontend must never bypass a 429.
- Authenticated endpoints distinguish missing session, expired session, and unauthorized access.
- Sensitive customer data is not included in public catalog or unauthenticated tracking responses.

## 10. Known residual issues and how to interpret them

These items are not fulfilled by the current frontend push:

- A 429 Too Many Requests response is a rate-limit or request-volume issue. It must be handled with throttling, Retry-After, caching, and backoff. It must not be bypassed by weakening server protection.
- The content.js CSP unsafe-eval message comes from a browser extension or injected script context, not from the Services application source. It is not fixed by changing booking data.
- The React fetchPriority warning is a frontend prop casing/usage warning in StorefrontResponsiveImage. It is separate from the backend contract and does not mean the catalog API is broken.
- A 401 response from account/companies means the local browser session is not authorized for that endpoint. It requires a valid session or a correct local auth fixture.
- A 404 for a sample booking reference means that reference is not present in the current local backend data. It is not proof that the tracking adapter cannot render multiple items.
- Local schedule and tracking simulation can make a flow appear successful without creating a real booking. Production proof requires server-created booking, hold, payment, and tracking evidence.

## 11. Recommended backend implementation sequence

This is a recommended sequence only; it does not renumber or amend the repository phase ledger.

### Step A — Contract and model audit

- Confirm the mounted route paths and public schemas.
- Confirm the service item, detail, option-group, schedule, booking-line, location, hold, payment, and status-event models.
- Add contract tests before changing response shapes.
- Identify fields that already satisfy the frontend and fields that are missing.

### Step B — Published Services read model

- Reuse existing storefront settings if possible.
- Otherwise propose the separate presentation configuration read model described above.
- Add schema validation, draft/publish behavior, audit data, cache invalidation, and safe defaults.
- Keep template definitions allowlisted and free of business logic.

### Step C — Catalog and option hardening

- Normalize service detail, service_area_type, variants, and service_option_groups.
- Enforce active visibility and association checks.
- Return stable IDs, labels, minor-unit price adjustments, and duration adjustments.

### Step D — Availability and holds

- Return server-generated dates and slots with timezone, capacity, policy, and hold requirements.
- Implement conflict checks and deterministic hold expiry.
- Make the schedule endpoint safe for month/year navigation without client-invented availability.

### Step E — Booking persistence

- Recalculate totals and duration.
- Persist line, option, service-area, selected address, schedule, and catalog snapshots.
- Add idempotency and explicit batch scheduling semantics.

### Step F — Tracking

- Return all lines/items and the relevant snapshots.
- Add item-level status and event timestamps where supported.
- Test one-service, repeated-same-service, different-option, and mixed-service bookings.

### Step G — Frontend authority switch

- Keep local simulation behind the development guard.
- Add a feature flag for the real bootstrap and availability responses.
- Replace local schedule authority only after server contract tests pass.
- Verify Laundry and AC independently; do not include Salon in acceptance fixtures.

### Step H — Rollout and observation

- Deploy additive schema and read-model changes first.
- Enable the real Services read path for internal testing.
- Observe 429s, 401s, holds, booking conflicts, price reconciliation, and tracking completeness.
- Roll back by disabling the feature flag or returning the prior compatible read model.

## 12. Validation evidence for this push

The clean replay was validated from `C:\xampp\htdocs\DGFY-push-check`, based on the fetched `origin/develop`:

- focused regression checks: 2 test files and 20 tests passed;
- full storefront suite: 176 test files and 986 tests passed;
- configured web lint runner: 0 errors and 128 existing warnings;
- production storefront build: passed, with 2,445 modules transformed; Vite emitted its existing large-chunk advisory;
- documentation and ADR checks: passed; 29 governed docs and 86 ADRs validated;
- final diff whitespace check: passed;
- conflict-marker and commit-safety marker scans: no matches in committed Services changes.

The warnings that remain are not evidence that the frontend push added backend behavior. The backend team must run API, migration, contract, concurrency, and end-to-end booking tests for the work described as recommended above.

## 13. Release inventory and exclusions

### Included in the current Services frontend push

- Services storefront presentation and responsive layout;
- Services-specific palette application;
- Laundry and AC catalog presentation;
- service variants and add-on selection UI;
- cart merging, quantity editing, totals, and formatting;
- customer, add-ons, fulfillment, payment/review, and tracking UI flow;
- calendar/date/time selection UI;
- location-selection UI;
- multi-service tracking rendering;
- related frontend tests and documentation.

### Excluded from the current push

- apps/dgfy-api source changes;
- apps/dgfy-migration-runner migrations;
- database schema changes;
- production availability or capacity authority;
- real hold conflict resolution;
- payment gateway changes;
- pickup/return logistics implementation;
- arbitrary tenant template execution;
- Salon storefront/service-type work;
- F&B, retail, discovery, registration, POS, and unrelated admin changes;
- generated artifacts, local database backups, and untracked scratch documents;
- the remaining dirty F&B-only hunk in StorefrontApp.jsx.

The four changed files under `src/modes/fnb/checkout` are shared checkout
compatibility seams required by the Services booking flow (address persistence,
service appointment validation, and the reusable promo renderer). They do not
add or change an F&B storefront feature; F&B behavior outside those shared
seams remains excluded.

### Push safety

This updated clean replay is based on the fetched `origin/develop` and contains
only the two reviewed Services implementation commits, one replay-repair fix,
and the separate documentation commits. The original dirty worktree was not
staged, reset, switched, or overwritten. The branch is ready to push after the
final remote/scope checks.

## 14. Backend handoff checklist

The backend owner should confirm each item before replacing the local frontend fallback:

- [ ] Public Services catalog response is active/visible/bookable and versioned.
- [ ] Services bootstrap/presentation contract is approved or existing settings are reused.
- [ ] No raw fulfillment profile key is required in the public booking payload.
- [ ] service_area_type is present per service item.
- [ ] Variations and add-ons are active, associated, and server-validated.
- [ ] Prices, duration, quantity, and totals are recalculated server-side.
- [ ] Availability returns timezone-aware slots, policy, and capacity.
- [ ] Holds are conflict-safe, expiring, and idempotent.
- [ ] Batch booking semantics for multiple services are explicit.
- [ ] Customer service-address snapshots are persisted where required.
- [ ] Tracking returns every booking line/item.
- [ ] 429, 401, conflict, expired-hold, and not-found behavior is documented.
- [ ] API, migration, contract, concurrency, and end-to-end tests pass.
- [ ] Laundry and AC acceptance fixtures pass.
- [ ] Salon remains outside the release scope.

## 15. Final handoff

The current frontend push is ready for backend contract integration, not for a claim of complete server-backed Services booking behavior.

The safest next backend deliverable is a reviewed Services bootstrap/read model plus authoritative availability and booking validation using the existing Services routes. The storefront should consume approved presentation data and service data through that contract, while template definitions remain allowlisted and business rules remain in the backend domain services.

No deployment, branch push, migration, API change, or external system update was performed while preparing this handoff.
