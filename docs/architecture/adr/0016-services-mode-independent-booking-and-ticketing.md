---
status: accepted
date: 2026-05-02
last_reviewed: 2026-05-12
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
- Include tenant provisioning coverage whenever Services Mode adds tenant-local models or foreign keys. The tenant model factory must clone service tables into fresh tenant databases, disposable schema sync must pass, and failed approval/auto-approval provisioning must remain retryable instead of leaving an invalid landlord status.

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
- Storefront booking controls must honor each service's payment policy. Service booking quantity is explicit: `service_bookings.quantity` is the number of service units, seats, or sessions reserved in the same schedule window, and it must be validated against resource capacity before acceptance.
- Storefront customers may keep multiple service booking drafts and submit them in one all-or-nothing booking checkout. Separate drafts remain the contract for different schedules, resources, or intake answers; a customer must not be blocked from booking another valid service merely because a previous booking is still active.
- Storefront service booking drafts may create short-lived holds in `service_booking_holds`. Active, unexpired holds count against availability/capacity, can be replaced by a newer hold for the same draft, and must be consumed by the final booking mutation through `hold_token`.
- Future modes should follow the same implementation pattern: define mode-specific source-of-truth capability registry, route guards, mode-native data contracts, mode-native IMS/POS/Storefront surfaces, tests, and documentation before claiming readiness.
- Future modes that add tenant-local tables must also define their tenant provisioning graph before implementation starts. A mode is not ready if a fresh tenant approval cannot create its schema cleanly.

## Production Readiness Addendum (2026-05-02)
- Services Mode includes an auditable reminder outbox. Due appointment reminders are queued against bookings and processed through the existing SMTP email service when configured. If SMTP is not configured, reminders are marked skipped rather than treated as sent.
- SMS reminders are represented as a future channel but are not sent until a provider adapter exists.
- Services Mode Storefront captures service intake responses from `intake_form_schema` and blocks booking when required intake fields are incomplete.
- POS service catalog visibility is evaluated against `service_item_details.visible_in_pos`; service rows are stock-exempt, display as service sales, and can be checked out without inventory stock deduction.
- IMS Services can define a starter intake question on service creation, queue/process reminders, view reminder outcomes, select providers from the existing users API, and review client retention/no-show signals.
- Reminder, intake, waitlist, client history, provider/resource assignment, lifecycle, and dashboard behavior must remain covered by focused use-case and contract tests before readiness ratings are raised.

## FIFO And Location Stock Addendum (2026-05-06)

Services Mode does not remove FIFO or location stock from the tenant. It only exempts truly service-only sale lines from stock deduction. If a Services Mode tenant sells or consumes a physical item, add-on, product, kit, consumable, or supply, that line is stock-bearing and must use the same location-scoped FIFO contract as every other mode.

Implications:

- Service booking, ticketing, reminder, intake, provider, resource, waitlist, and client-history records are non-stock workflow records.
- `items.category = service` rows remain stock-exempt unless a future package/component model explicitly attaches stock-bearing components.
- Physical catalog rows shown in Services Mode POS or Storefront must show location availability and deduct from FIFO batches at the operating/fulfillment location.
- Frontend item detail views should continue showing location stock and batch differences for stock-bearing Services Mode inventory so operators can see which location and batch will be affected.

## Item Taxonomy And UOM Addendum (2026-05-06)

Services Mode item creation uses the corrected mode-aware taxonomy from ADR 0014:

- `Service` maps to `items.category = service`, uses presentation/time units such as `service`, `session`, `booking`, or `hour`, and is stock-exempt.
- `Physical Add-on / Product` maps to `category = product`, `product_type = finished_goods`, uses count/packaging units, and remains stock-bearing.
- `Supplies` maps to `category = supplies`, uses count/packaging units, and remains stock-bearing.
- Services Mode must not show manufacturing raw-material/job-order language in the create-item path. Legacy rows can remain intact, but new non-draft rows and draft finalization must pass the Services taxonomy.

## Price And Cost Addendum (2026-05-07)

Services Mode separates service pricing from physical inventory costing:

- Pure service rows (`category=service` or `mode_item_preset=service`) show `default_sale_price` as the primary IMS financial field because that is the POS/Storefront customer price.
- Pure service rows do not show stock, FIFO, average-cost, location-cost, on-hand value, or stock-movement controls.
- `cost_per_unit` on a pure service row is optional internal service-cost tracking. IMS hides it by default and shows it only when the operator opts into internal service cost or the row already has a stored service cost.
- Physical add-ons/products and supplies in Services Mode are stock-bearing inventory rows. They show cost in IMS, and they require `default_sale_price > 0` only when enabled for POS or Storefront.
- POS and Storefront service sales must use explicit `default_sale_price`; they must not treat `cost_per_unit` as a fallback customer price.

## Storefront Multiplicity Addendum (2026-05-11)

Storefront booking and checkout multiplicity is mode-wide:

- Any transaction-capable mode must allow customers to submit quantity `1+` and repeated orders/bookings when POS-equivalent readiness passes for that mode.
- POS-equivalent readiness means active item, explicit positive sale price, customer-access permission, storefront visibility, stock/location/FIFO gates for stock-bearing rows, and service bookability/capacity gates for service rows. Storefront visibility remains independent from POS visibility.
- Services Mode stores `quantity` on each booking. Capacity checks sum overlapping active booking quantities, including drafts submitted in the same batch. Resource-backed services may accept `quantity > 1` up to `service_resources.capacity`; provider-only and location-only bookings remain effective capacity `1` until a later ADR introduces provider/location capacity. When a storefront request omits `resource_id`, the backend may auto-select an active, assigned resource that matches the requested location, schedule rules, and capacity.
- Public Storefront service availability is exposed through a read-only, no-store endpoint before booking submission. It returns slots only when the selected service, date, location/resource/provider scope, quantity, lead time, resource weekly availability, blackout dates, active booking quantities, and active unexpired hold quantities leave enough capacity. It may return customer-safe diagnostics for blocked slots and resource setup gaps. This endpoint improves customer guidance but does not replace the booking mutation's locked validation.
- Public service booking holds require an idempotency key, store request hashes, expire quickly, and may be replaced with `replace_hold_token` so edited drafts do not block themselves. Public single and batch booking mutations require an idempotency key so customer retries do not create duplicate bookings.
- Public service booking batch checkout is all-or-nothing: if one draft fails validation, no booking in the batch is created and the response identifies the failed draft index.
- Batch booking responses return per-booking payment handoffs. The legacy singular `payment` field is only a summary; customers must be shown every `payments[]` checkout URL when multiple prepaid or deposit bookings are created.
- Future modes may restrict quantity or repeated checkout only through an accepted ADR that explains the mode-native reason and the replacement customer flow.
