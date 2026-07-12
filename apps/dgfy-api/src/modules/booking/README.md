# booking module

Scaffolded in Phase 8 Wave 4 (`.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-07-PLAN.md`): create and cancel a Booking against a bookable service Product, blocking at branch-level concurrent capacity via an atomic guarded UPDATE that cannot oversell under concurrency (BOK-02), releasing the slot atomically on cancel (D-08), with dual-authorization cancel (D-09) and a reserved `availment_id` link for fulfillment (BOK-03).

## Relationship to `businesses`, `products`, and `inventory`

Follows the same Clean Architecture layering as `../businesses/`, `../products/`, and `../inventory/`: `routes -> controllers -> usecases -> repositories -> models`, composed in `index.js`'s `buildBookingModule()`. Writes are gated via `requireMembership`/`isActiveStaffOrOwner` against the `businesses` module's `BusinessRepository` (membership lives in the landlord `dgfy_core` database); booking data itself lives in the tenant `dgfy_business_*` database, resolved via the injected `TenantConnector`. The `products` module's `ProductRepository` is injected read-only, to resolve a Product's `is_bookable`/`slot_duration_minutes`/`concurrent_capacity` before a booking is created.

## Atomic capacity guard (BOK-02, research Pattern D)

`bookingRepository.createBooking()` decrements a `booking_capacity` counter row via a SINGLE guarded UPDATE (`slots_remaining = slots_remaining - 1 WHERE ... AND slots_remaining >= 1`), asserting exactly one affected row BEFORE the booking row is ever inserted — never a findOne-then-update round trip. Both the capacity guard and the booking insert share one `sequelize.transaction()`. When the guarded UPDATE affects 0 rows, capacity is full: `BookingCapacityFullError` is thrown, the transaction rolls back, and no booking row is written. The counter row is lazily provisioned (seeded to the Product's `concurrent_capacity`) on first use for a given `(product_id, branch_id, slot_start)`, protected by that triple's unique index.

`cancelBooking()` releases the slot with the mirror `slots_remaining + 1` inside the SAME transaction as the booking's status write (D-08) — never a separate, unguarded transaction.

## Cancel authorization (D-09)

Either side may cancel a booking, with no reason required: staff/owner (any active business membership) OR the booking's own consumer account (`customer_account_id === requestingAccountId`). An unrelated account is forbidden (403). A client-supplied `customer_account_id` is never trusted to override a non-staff caller's own authenticated identity on create.

## Endpoints

- `POST /bookings` — create a booking (`business_id`, `product_id`, `branch_id`, `slot_start`, optional `customer_account_id` for a staff/owner booking on behalf of a consumer)
- `POST /bookings/:id/cancel` — cancel a booking (dual-authorized, D-09)
- `GET /bookings` — list bookings, optionally filtered by `branch_id`/`product_id` (membership required)

## Reserved fulfillment link (BOK-03)

`bookings.availment_id` is a reserved, nullable column with NO foreign key this phase — the Availment table is Phase 9. `buildBookingModule()` accepts (but never invokes) the `inventory` module's reserved `recordSaleEffect`/`recordBookingEffect` effect contracts (D-06) so a later phase can wire real fulfillment without restructuring this module.

## Prohibitions honored

- No `backend/` writes.
- No slot-change action other than cancel-and-create-a-new-booking (D-08).
- Capacity is never a read-then-write check — the guarded UPDATE asserts `affectedRows === 1` inside a transaction.
- `availment_id` is reserved and nullable, never set this phase.
- Booking does not write `inventory_movements` directly — any stock effect is requested through `modules/inventory`'s reserved effect contract.
