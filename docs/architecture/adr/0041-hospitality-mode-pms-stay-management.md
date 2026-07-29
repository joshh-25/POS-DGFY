---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-05-19
last_reviewed: 2026-05-19
review_by: 2026-11-19
applies_to: architecture_decision
topic: hospitality_mode_pms_stay_management
---

# ADR 0041: Hospitality Mode PMS And Stay Management

## Context

Hospitality Mode must support lodging operators such as hotels, inns, resorts, serviced apartments, hostels, and boutique properties. The existing `hospitality` workflow value was a placeholder using conservative catalog/inventory/POS/storefront behavior. That is not enough for hospitality because the daily workflow is PMS/stay-management first: reservations, rooms, guests, stays, front desk, housekeeping, maintenance, amenities, rates, folios, and direct booking.

This decision follows `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0014, ADR 0020, and `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`. The change is cross-boundary because it touches workflow-mode semantics, tenant-local schema, RBAC, authenticated APIs, Storefront booking, POS/folio handoff, CSV templates, and tenant provisioning.

## Decision

- Promote `hospitality` from placeholder to a corrected workflow mode.
- Add Hospitality capabilities: `hospitalityReservations`, `hospitalityRooms`, `hospitalityHousekeeping`, `hospitalityMaintenance`, `hospitalityFolios`, `hospitalityRates`, `hospitalityAmenities`, `catalog`, `inventory`, `pos`, and `storefront`.
- Add authenticated APIs under `/api/v1/hospitality/*` for dashboard, rooms, room types, reservations, guests, folios, housekeeping, maintenance, amenities, facilities, packages, and rates.
- Add public and optional Store JWT customer-safe booking APIs under `/api/v1/store/hospitality/*` for availability, amenities, packages, booking creation, booking lookup, authenticated stay history, and booking claim.
- Represent room nights, paid amenities, and facility bookings as stock-exempt capacity reservations. Stock-bearing minibar, retail, supplies, linens, and physical add-ons continue through shared item/FIFO/location stock contracts.
- Add tenant-local PMS tables for room types, rooms, rates, guests, reservations, reservation rooms, stays, folios, folio lines, housekeeping, maintenance, amenities, facilities, packages, facility bookings, and guest messages.
- Add Hospitality role presets and `hospitality:*` permissions to the mode-aware RBAC catalog. Authorization continues to use granular permissions plus workflow capability guards.
- Hide manufacturing job-order/dispatch workflows, Services booking workflows, and F&B dining workflows in Hospitality unless a later ADR explicitly shares or composes a subdomain.

## Item And Amenity Contract

Hospitality corrected item presets are:

- `room_night`: stock-exempt accommodation capacity, default unit `room_night`, customer sale price required when customer-facing.
- `paid_amenity`: stock-exempt paid add-on such as breakfast, late checkout, parking pass, airport transfer, or pet fee.
- `facility_booking`: stock-exempt capacity booking for meeting rooms, spa rooms, parking slots, cabanas, or other bookable facilities.
- `minibar_retail_product`: stock-bearing finished-good product for minibar or lobby retail.
- `physical_add_on`: stock-bearing sellable physical extra.
- `housekeeping_supply`: stock-bearing internal supply.
- `linen_reusable_asset`: stock-bearing/count-tracked reusable linen or asset until a richer asset lifecycle is introduced.

Amenities are first-class records, not text blobs. Hospitality must support property amenities, room amenities, paid add-ons, facility amenities, accessibility features, policies, local attractions, parking/transport, pet options, breakfast/meal packages, pool, gym, spa, laundry, business center, luggage storage, and concierge services.

## Consequences

- Hospitality Storefront becomes a booking engine instead of a generic product storefront.
- POS may post room, amenity, minibar, retail, deposit, refund, and settlement lines to folios, but checkout/fiscal receipt selection and stock deduction remain POS-owned.
- Customer-facing booking payloads expose availability, selling prices, amenities, and policy text only. They must not expose `cost_per_unit`, internal housekeeping notes, maintenance notes, or private guest identifiers.
- Storefront booking confirmation requires a persisted, unexpired booking hold that matches the room type and stay window. Active holds subtract from public availability until consumed, expired, or released.
- Booking confirmation persists idempotency keys and request hashes. Matching retries return the existing reservation; mismatched retries fail rather than creating duplicate reservations.
- Optional Store JWT links new Storefront bookings to `store_customer_id`. Authenticated customers can list their redacted stay history and can claim an existing public reference only when the booking email matches the signed-in customer email.
- Hospitality stores optional `external_source`, `external_reference`, and `channel_metadata` on reservations so OTA/channel-manager reconciliation can be added later without changing the core PMS reservation contract. Live OTA/channel sync is not part of this ADR.
- Room assignment can be deferred at booking time, but check-in/in-house transitions must ensure every reservation room has a physical assigned room. Deterministic auto-assignment may use bookable room status priority when the caller requests it or when check-in would otherwise create an unassigned stay.
- Staff room moves are dedicated audited reservation-room mutations. A move must validate reservation ownership, matching room type, and no overlapping assigned-room conflict before changing `room_id`.
- Stay date changes must revalidate room conflicts and room-type capacity before reservation and reservation-room dates are extended or shortened.
- Reservation status changes must perform PMS side effects: check-in creates in-house stays and occupied room state; check-out marks stays complete, dirties rooms, and creates turnover housekeeping tasks; cancellations/no-shows close active reservation-room rows.
- Folio `payment` and `deposit` lines reduce guest balance; `refund` lines reverse payments and increase balance. POS remains owner of checkout, fiscal/non-fiscal receipt selection, and stock deduction.
- Checkout is blocked while open folios still have a balance unless staff explicitly sends an override. The override is an action flag and must not be persisted as a reservation attribute.
- Storefront quote and confirmation may expose deposit due/payment status, but payment collection remains property/POS-owned until a later payment-adapter ADR introduces online card authorization. The UI must not imply card capture when no adapter is configured.
- Out-of-order maintenance blocks rooms from capacity-backed availability until the maintenance request is resolved/deferred and the room state is restored.
- Hospitality mutations that affect reservations, folios, room/status lifecycle, or maintenance blocking write domain-level Hospitality audit events and mirror the same actor/request context into the existing tenant `audit_logs` table for operator-wide audit visibility.
- Tenant provisioning must clone every Hospitality model into fresh tenant databases and failed auto-approval must remain retryable.
- No architecture allowlist exception is introduced.

## Validation

- Run `npm run check:architecture`.
- Run `npm run lint:docs`.
- Run mode taxonomy/RBAC/route capability tests.
- Run tenant model factory tests proving Hospitality models and associations clone into tenant DBs.
- Run backend use-case tests for availability, reservation conflict checks, room status changes, folio posting, housekeeping transitions, maintenance transitions, amenities, packages, and customer-safe booking lookup.
- Run backend use-case tests for room moves, stay extension conflicts, checkout balance blocking/override, and audit before/after snapshots.
- Run Storefront tests for date/guest search, room availability, amenities/packages, policy display, booking confirmation, and public privacy.
