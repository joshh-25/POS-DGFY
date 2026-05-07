---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-05-07
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
- Backend/API changes introduced by this UI work: `none`
- ADR update required for current UI state: `not needed`

## Scope Covered Today
The current services-mode storefront is implemented for service-oriented tenants using real storefront and catalog content from SKUpervisor-backed data. The current reference tenant for the visual and content model is `ABeeZee`.

Current focus is service mode only. Other business modes may share some normalized storefront foundations, but this document describes the live state of `services` mode.

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
- `frontend/apps/store/src/normalizeStorefrontPageModel.js`
- `frontend/apps/store/src/servicesStorefrontViewModel.js`
- `frontend/apps/store/src/modePresentationRegistry.js`

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

## Backend And Contract Alignment

### Existing Booking Contract In Use
The current storefront keeps the existing service booking contract and does not replace it.

Current booking submission continues to rely on:
- `service_item_id`
- `start_at`
- `location_id`
- `payment_timing`
- `intake_responses`
- customer details fields
- notes

### Existing Service Metadata Already Used
The current services storefront already uses:
- `service_detail.duration_minutes`
- `service_detail.payment_policy`
- `service_detail.service_area_type`
- `service_detail.service_category`
- `service_detail.intake_form_schema`
- `service_resources.weekly_availability`
- `service_resources.blackout_dates` when available for validation compatibility

### Important Current Constraint
The frontend does not currently have a dedicated public storefront API for:
- real-time blocked slots
- fully booked slots
- provider-specific live availability
- same-day cutoff enforcement surfaced as explicit slot state

Because of that:
- date and time UI is preference-based
- weekly availability can guide the picker when present
- final booking acceptance still depends on backend validation

This matches the current `services` contract and avoids overstating availability guarantees.

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

## Current Known Limitations

### 1. Service Family Presentation Is Still Narrow
The current `servicesStorefrontViewModel` contains tuned presentation metadata for:
- `laundry`
- `aircon_cleaning`

This is acceptable for the current reference tenant, but broader service businesses may need either:
- more category presentation mappings, or
- a more generic category presentation model

### 2. Scheduling UX Is Not Yet Slot-Authority Driven
The booking page offers a better calendar/time-slot experience than the old flow, but it is not yet powered by a dedicated real-time slot availability contract.

### 3. Single-Service Booking Contract
The backend contract still centers on one service booking request per submission. The storefront must not pretend it supports a more advanced multi-service scheduling cart unless the backend contract is expanded.

### 4. Some Microcopy Is Still Generic
Some empty-state and support copy is generic storefront copy rather than business-authored content.

## Current Standing
Services mode storefront is currently in a solid `UI-refresh + contract-aligned` state for the reference tenant and existing backend.

Operationally, this means:
- the storefront is usable and significantly improved for services mode
- the UI now reads as a service booking experience rather than a product-first storefront
- the frontend remains inside current backend and SKUpervisor contracts
- the main remaining limitations are contract breadth and service-family generalization, not basic usability

## Recommended Next Steps
The current highest-value next steps are:
1. Generalize service-family presentation beyond laundry and aircon cleaning.
2. Normalize booking presentation data further so `StorefrontApp.jsx` depends less on raw service detail fields.
3. Add a stronger availability contract only if backend work is explicitly approved and reclassified.
4. Extend the same content-driven pattern to additional business modes after services-mode stabilization.

## Validation Notes
For UI and docs work in this phase, the relevant checks are:
- `npm --prefix frontend run build:store`
- targeted storefront frontend tests
- `npm run lint:docs` when this document changes

