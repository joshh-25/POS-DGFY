---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-05-12
applies_to: storefront_services_mode
topic: services_mode_storefront_current_state
---

# Storefront Service Mode: Current Features And Standing

## Purpose
This document records the current implementation state of the Storefront `services` mode as implemented in the storefront frontend app. It is a status and capability reference, not a new architecture decision.

## Authoritative Inputs Used
- `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md`
- `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`
- `backend/src/modules/services/README.md`
- `docs/proposals/STOREFRONT_UI_IMPLEMENTATION_BRIEF.md`

## Classification
- Change class for the implemented UI work: `within-existing-boundary`
- Layer: storefront frontend only
- Backend/API changes introduced by this UI work: `service_bookings.quantity`, `service_booking_holds`, service booking/hold idempotency and request hash storage, public service booking batch checkout, public service availability lookup, and public service hold creation
- ADR update required for current UI state: ADR 0016 and ADR 0017 updated 2026-05-12

## Scope Covered Today
The current services-mode storefront is implemented for service-oriented tenants using real storefront and catalog content from SKUpervisor-backed data. The current reference tenant for the visual and content model is `ABeeZee`.

Current focus is service mode. Shared storefront foundations now also support generic catalog and F&B storefront behavior, but this document describes the live state of the `services` mode surface.

## Source Of Truth
The services-mode storefront is content-driven. It relies on existing backend and SKUpervisor-authored data only.

Primary storefront content sources already consumed:
- tenant/storefront identity
- storefront cover image
- storefront profile image
- storefront tagline
- storefront about text
- storefront gallery
- storefront review summary
- storefront review highlights
- storefront phone/email/social links
- storefront hours
- storefront categories
- storefront `why choose us`
- store locations / branches
- catalog services and service detail metadata

The storefront should not invent business meaning when source data is absent. Missing data is handled through section collapse, reduced layout, or neutral empty-state copy.

## Frontend Files
Current services-mode implementation is primarily concentrated in:
- `frontend/apps/store/src/StorefrontApp.jsx`
- `frontend/apps/store/src/main.jsx`
- `frontend/apps/store/src/normalizeStorefrontPageModel.js`
- `frontend/apps/store/src/servicesStorefrontViewModel.js`
- `frontend/apps/store/src/modePresentationRegistry.js`

`main.jsx` is now the Storefront app bootstrap only. Storefront rendering, route interpretation, customer-access gating, service booking composition, F&B reservation hooks, follow controls, and catalog empty/search states live in `StorefrontApp.jsx`.

## Current User-Facing Features

### 1. Services Hero Storefront
The services storefront landing page currently includes:
- top navigation bar
- full-width cover-photo hero
- overlapping profile image
- business name, status, tagline, and meta row
- service-mode CTA composition
- floating business summary card below the hero

Current hero/info behavior:
- layout is responsive
- branch selector appears only when multiple locations exist
- missing cover/profile/tagline/contact data degrades cleanly
- hero content is sourced from storefront content fields, not hardcoded per tenant

### 2. Business Summary Card
The info card below the hero is currently structured as:
- `Overview`
- `Contact & Location`
- `Why Choose Us`

Current behavior:
- `About` supports `See more / See less`
- gallery thumbnails render only when gallery data exists
- map/contact rows collapse when location/contact data is missing
- `Why Choose Us` renders only when content exists

### 3. Services Catalog Section
The services catalog is rendered as its own section, visually separate from the info card and reviews section.

Current catalog behavior:
- service-first page header
- search bar
- sort dropdown
- filter modal
- category tabs with counts
- four service cards per row on wide desktop
- responsive collapse for smaller screens
- pagination below the service grid

Current tab logic:
- services are grouped by storefront service-family logic derived from SKUpervisor-backed service metadata
- current presentation supports the service categories already in use for the reference tenant, especially `laundry` and `aircon_cleaning`

Current card content:
- service family label
- service name
- short description
- price
- duration chip when available
- service area chip when available
- `View Details`
- `Order Now`

### 4. Filters
Current filters are implemented as a modal, not an inline panel.

Current filter behavior:
- filters are aligned to existing storefront service metadata
- filters can be cleared without reopening the modal
- modal dismissal is explicit and not triggered by backdrop click

Current filter dimensions are frontend-only and based on already available fields such as:
- service availability
- service area type
- duration

### 5. Customer Reviews Section
Customer reviews now render in a distinct section below services, not inside the services section.

Current review behavior:
- uses only real review fields already carried by the storefront payload
- no mock review fallback is used
- review summary and review highlight cards are rendered when present
- otherwise a neutral empty state is shown

Current review data sources:
- `storefront_review_summary`
- `storefront_review_highlights`

### 6. Footer
The services storefront now has a distinct footer section.

Current footer behavior:
- dark multi-column layout
- content-driven links
- service families listed from current service groups
- socials rendered only when links exist
- contact details rendered only when values exist
- attribution footer row

### 7. Booking Subpage
The services order journey has been moved off the main storefront page into a dedicated booking subpage.

Current routing model:
- storefront catalog page
- storefront booking subpage

Current user flow:
- customer browses services on storefront
- `Order Now` routes to the booking subpage
- booking page hides the services hero/profile/info shell
- booking page shows only booking navigation and booking content

### 8. Booking UX
The current booking page is step-based and service-first.

Current booking steps:
1. Schedule your service
2. Service requirements
3. Customer information

Current booking UX includes:
- sticky booking header
- back-to-services action
- service summary card
- preferred date selection
- preferred time-slot chips
- quantity/units
- payment timing
- dynamic intake fields from service schema
- customer details fields
- sticky booking summary on desktop
- multiple service booking drafts in the cart
- quantity `1+` per booking draft
- live capacity-aware slot lookup for the selected service, date, location, and quantity
- short-lived reservation holds for saved booking drafts and checkout submission
- all-or-nothing submission for service booking batches
- draft-specific review, backend draft-index error copy, and per-booking confirmation/payment links

## Backend And Contract Alignment

### Existing Booking Contract In Use
The current storefront keeps the existing service booking contract and does not replace it.

Current booking submission continues to rely on:
- `service_item_id`
- `quantity`
- `start_at`
- `location_id`
- `resource_id` when the service line has a capacity-backed resource
- `payment_timing`
- `idempotency_key`
- `hold_token` when a short-lived booking hold was created for the draft
- `intake_responses`
- customer details fields
- notes

For customers booking more than one service at once, the storefront submits `/api/v1/store/services/bookings/batch`. Each draft keeps its own service item, schedule, quantity, intake responses, payment timing, and notes. The backend creates every booking in the batch or rejects the whole batch with the failed draft index; customers are not required to wait for an active booking to complete before submitting another valid booking. Public service booking mutations send an idempotency key so a retry of the same request replays the existing booking response instead of creating duplicates.

Service `quantity > 1` requires a capacity anchor. The current anchor is an active service resource assigned to the service and compatible with the requested location, schedule, blackout dates, and weekly availability. When the storefront does not send `resource_id`, the backend can auto-select a matching assigned resource with enough remaining capacity. Provider-only and location-only service bookings remain effective capacity `1`.

Batch booking responses include every booking reference and every payment handoff. Storefront confirmation must render all references and all `payments[]` checkout links; the singular `payment` field is treated as summary/backward compatibility only.

### Public Booking Hold Contract In Use
The storefront creates short-lived holds through `POST /api/v1/store/services/holds` when a customer saves a service booking draft and again only when a draft hold is missing or close to expiry at checkout.

Current hold behavior:
- holds are persisted in `service_booking_holds`
- hold payloads include service item, schedule, location/resource/provider scope when present, quantity, `idempotency_key`, and optional `replace_hold_token`
- active unexpired holds count against availability and booking capacity
- editing a draft can replace the previous active hold without the draft blocking itself on capacity-one resources
- final single or batch booking passes `hold_token`; the backend revalidates the schedule/capacity under transaction and marks the hold `consumed`
- expired or invalid holds fail closed, and the storefront asks the customer to reserve the time again

### Existing Service Metadata Already Used
The current services storefront already uses:
- `service_detail.duration_minutes`
- `service_detail.payment_policy`
- `service_detail.service_area_type`
- `service_detail.service_category`
- `service_detail.intake_form_schema`
- `service_resources.weekly_availability`
- `service_resources.blackout_dates` when available for validation compatibility

### Public Availability Contract In Use
The storefront now calls `GET /api/v1/store/services/availability` before offering service time slots on the booking subpage.

The availability response is no-store and capacity-aware. It evaluates:
- selected service item
- selected storefront location
- selected resource/provider when present
- selected date
- requested quantity
- service lead time and duration
- resource weekly availability
- resource blackout dates
- active overlapping booking quantities
- active unexpired service booking hold quantities

When no slot can be offered, the backend returns structured diagnostics such as dominant blocker, blocked-count summary, setup warnings, and customer-safe guidance. The storefront uses that guidance to distinguish capacity/resource setup problems from generic no-slot states.

Final booking acceptance still depends on the booking mutation, which revalidates under the authoritative backend booking use case. Availability reads include active holds, and saved drafts can create holds, but the final booking mutation remains the source of truth because holds can expire or be replaced.

## Content-Driven Behavior
The current services storefront is designed to remain usable with incomplete content.

Implemented degradation patterns include:
- no cover image -> fallback hero background
- no profile image -> hero still renders cleanly
- no tagline -> compress text stack
- no about text -> neutral business-summary fallback
- no gallery -> gallery area hidden
- no map data -> contact layout collapses to text-only
- no reviews -> neutral empty state in review section
- no multiple branches -> branch selector hidden
- no social/contact links -> footer and contact actions render only valid links

## Current Strengths
The current services-mode storefront is already strong in these areas:
- service-first page structure
- branch-aware header behavior
- responsive storefront hero and business summary
- content-driven section visibility
- separate catalog, reviews, and footer sections
- dedicated booking subpage
- dynamic service intake fields
- existing contract alignment with Services Mode backend
- public availability lookup before service slot selection
- short-lived booking holds that are consumed by final booking
- customer-safe no-slot guidance for capacity and setup blockers

## Current Known Limitations

### 1. Service Family Presentation Is Still Narrow
The current `servicesStorefrontViewModel` contains tuned presentation metadata for:
- `laundry`
- `aircon_cleaning`

This is acceptable for the current reference tenant, but broader service businesses may need either:
- more category presentation mappings, or
- a more generic category presentation model

### 2. Some Microcopy Is Still Generic
Some empty-state and support copy is generic storefront copy rather than business-authored content.

### 3. Address Map Pin Is Not Yet Supported By The Booking Contract
The current services booking storefront can render address-like intake fields cleanly, but it does not have backend support for a structured customer map pin / coordinate field in service bookings.

Current state:
- storefront booking supports only intake field types already accepted by the services contract
- `Full Service Address` can be collected as text/textarea input from `intake_form_schema`
- the storefront should not introduce a map-pin picker yet because there is no confirmed public services booking payload for lat/lng or a dedicated location-pin field

Future backend integration needed if map pin is desired:
- supported booking field type or explicit payload fields for customer service coordinates
- persistence for customer-selected latitude/longitude
- validation rules for optional or required service-location pins

### 4. Storefront Cover Image Can Be Missing Even When Updated In SKUpervisor
ABeeZee storefront verification showed that the customer-facing storefront hero correctly reads cover-image data from the public discovery payload, but the tenant currently has no persisted cover-image value in the storefront settings used by that payload.

Verified current state for tenant `ABeeZee`:
- public discovery payload returns `storefront_cover_image_url: null`
- tenant `system_settings` contains:
  - `storefront_cover_image_url = ""`
  - `storefront_cover_image_path = ""`
- profile image settings are populated and render correctly

Impact:
- the storefront hero falls back to the dark gradient background
- the frontend is behaving as designed because no cover image is available in the public discovery record

Backend handoff:
- verify where the SKUpervisor dashboard writes the storefront cover image
- ensure the dashboard persists one or both of these tenant settings:
  - `storefront_cover_image_url`
  - `storefront_cover_image_path`
- ensure the discovery-index rebuild path materializes the persisted cover image into the public storefront discovery payload

May 11, 2026 ingress finding:
- IMS Settings cover/profile uploads can fail before backend validation when production Nginx keeps the default 1 MiB request-body limit.
- Backend storefront asset validation allows 5 MiB image files and persists `storefront_cover_image_url` / `storefront_cover_image_path` or `storefront_profile_image_url` / `storefront_profile_image_path`.
- Production deploy now installs an Nginx guard with `client_max_body_size 8m;` so normal multipart image uploads reach the backend while backend validation remains authoritative.

## Current Standing
Services mode storefront is currently in a solid `UI-refresh + contract-aligned` state for the reference tenant and existing backend.

Operationally, this means:
- the storefront is usable and significantly improved for services mode
- the UI now reads as a service booking experience rather than a product-first storefront
- service slot selection is now backed by a public capacity-aware backend contract and a short-lived hold path
- the main remaining limitations are service-family generalization, map-pin booking fields, and business-authored copy breadth

## Recommended Next Steps
The current highest-value next steps are:
1. Generalize service-family presentation beyond laundry and aircon cleaning.
2. Normalize booking presentation data further so `StorefrontApp.jsx` depends less on raw service detail fields.
3. Add a governed structured map-pin/address contract if customer-location services need coordinates.
4. Extend the same content-driven pattern to additional business modes after services-mode stabilization.

## Validation Notes
Validated on 2026-05-12 after adding booking multiplicity, public service availability, and short-lived booking holds:
- `npm --prefix backend test -- servicesMode.usecases.test.js` passed 26 Services Mode use-case tests.
- `npm --prefix frontend exec vitest run apps/store/src/__tests__/serviceBookingMultiplicity.contract.test.js` passed 5 storefront multiplicity/availability/hold contract tests.
- `npm run lint:docs` passed.
- `npm run check:architecture` passed.
- `npm --prefix frontend run build:store` passed without chunk warnings after lazy-loading MapLibre and splitting store vendors. The initial store app chunk is 238.18 kB minified / 57.88 kB gzip; MapLibre remains a deferred map vendor chunk.
- `git diff --check` passed.
- A local browser smoke check at `/tenant-store` rendered the Storefront shell with no console errors.
