---
status: accepted
date: 2026-05-02
last_reviewed: 2026-05-02
classification: authoritative
---

# ADR 0016: Services Mode Independent Booking And Ticketing

## Context
Services Mode must operate as an independent tenant workflow mode across IMS, POS, and Storefront. The existing workflow mode registry routes most non-MSME modes through manufacturing defaults, which causes Services Mode to inherit manufacturing labels, navigation, stock rules, and operational assumptions. The current user-facing Manufacturing mode is specifically Food Manufacturing and must be named that way while retaining `manufacturing` as a legacy alias.

This change follows `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0007, ADR 0008, and ADR 0014. It is a cross-boundary change because it touches tenant workflow mode semantics, routes, data model, backend use cases, POS, Storefront, IMS navigation, and customer account linking.

## Decision
- Introduce Services Mode as a first-class workflow mode with its own capabilities, route visibility, storefront pin metadata, and default surfaces.
- Rename user-facing Manufacturing to Food Manufacturing. Keep `manufacturing` as a legacy alias that resolves to `food_manufacturing` for labels, defaults, templates, and routing decisions.
- Represent services as item-backed sellable catalog entries using `items.category = service`, with service-specific metadata stored in dedicated services tables. POS and Storefront continue to reference `item_id` on sale lines.
- Store bookings in dedicated service booking tables with lifecycle statuses: `requested`, `confirmed`, `checked_in`, `in_service`, `completed`, `cancelled`, and `no_show`.
- Keep booking tickets distinct from payment receipts. Tickets confirm booking/order intent; receipts prove payment. POS fiscal/non-fiscal receipt policy remains governed by existing compliance lifecycle rules from ADR 0007.
- Add backend workflow capability guards for manufacturing-only routes so Services Mode cannot access job-order, dispatch-order, and stock-movement flows directly.
- Implement customer receipt/ticket account behavior as:
  - authenticated customers are auto-linked and shown image download only;
  - guests whose email has no StoreCustomer account receive a short-lived claim token plus image download;
  - guests whose email already belongs to an account receive image download only and are not prompted to register/sign in from the receipt prompt.
- Add Storefront mode pins from the shared registry, including Services as `CalendarCheck` and Food Manufacturing as `Factory`.

## Consequences
- Services Mode can add appointment booking, providers/resources, payment timing, tickets, and service reports without copying manufacturing route names or assumptions.
- Existing tenants storing `manufacturing` remain compatible but see Food Manufacturing labels.
- Service catalog items are sellable through POS/Storefront without stock deduction. Stock-bearing supplies remain normal inventory items.
- Pay Now support is implemented behind a commerce payment adapter surface; PayMongo is the first intended adapter, but fiscal/non-fiscal receipt issuance remains separate from booking confirmation.
- No architecture exception or allowlist dependency is introduced.

## Validation
- Run architecture guardrails and controller-boundary checks for cross-boundary compliance.
- Add unit coverage for workflow mode aliasing/capabilities, service booking conflict checks, service POS checkout stock bypass, Storefront claim prompt rules, and mode pin rendering.

## Hardening Addendum (2026-05-02)
- Public service booking lookup must not expose customer contact data. Authenticated account history and successful claim flows may return customer-owned booking details.
- Services dashboard API fields must match IMS consumers for booking counts, future booking count, expected revenue, and unpaid postpaid aging.
- POS/IMS booking status changes must follow deterministic lifecycle transitions instead of allowing arbitrary jumps.
- Resource-aware booking validation must enforce active resources, configured weekly availability, blackout dates, resource capacity, and configured service assignment compatibility.
- Multi-status booking queue filters are part of the Services API contract for POS queue views.

## Services Console Addendum (2026-05-02)
- Services Mode IMS must be service-business first, not manufacturing-with-renamed-labels. Its primary surfaces are Today, Calendar, Services, Team & Resources, Waitlist, and Clients.
- Services Mode may use inventory for sellable service items and supplies, but the default operator workflow must avoid job-order, dispatch-order, production, and stock-movement language.
- Staff/resource assignment, resource capacity, waitlist, client history, and service payment policy are core Services Mode contracts, not optional UI-only concepts.
- Storefront booking controls must honor each service's payment policy and prevent ambiguous multi-quantity service bookings unless a package/class model is explicitly introduced.
- Future modes should follow the same implementation pattern: define mode-specific source-of-truth capability registry, route guards, mode-native data contracts, mode-native IMS/POS/Storefront surfaces, tests, and documentation before claiming readiness.

## Production Readiness Addendum (2026-05-02)
- Services Mode includes an auditable reminder outbox. Due appointment reminders are queued against bookings and processed through the existing SMTP email service when configured. If SMTP is not configured, reminders are marked skipped rather than treated as sent.
- SMS reminders are represented as a future channel but are not sent until a provider adapter exists.
- Services Mode Storefront captures service intake responses from `intake_form_schema` and blocks booking when required intake fields are incomplete.
- POS service catalog visibility is evaluated against `service_item_details.visible_in_pos`; service rows are stock-exempt, display as service sales, and can be checked out without inventory stock deduction.
- IMS Services can define a starter intake question on service creation, queue/process reminders, view reminder outcomes, select providers from the existing users API, and review client retention/no-show signals.
- Reminder, intake, waitlist, client history, provider/resource assignment, lifecycle, and dashboard behavior must remain covered by focused use-case and contract tests before readiness ratings are raised.
