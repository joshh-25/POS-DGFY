# Hospitality Module

Owns Hospitality Mode PMS/stay-management APIs for rooms, room types, reservations, guests, folios, housekeeping, maintenance, amenities, facilities, packages, and customer-safe Storefront booking discovery.

Boundary rules:
- Routes stay in `src/routes/hospitality.js` and are guarded by `requireWorkflowCapability('hospitalityReservations')` for authenticated PMS operations.
- Controllers in `controllers/` only adapt transport to use cases.
- Use cases in `usecases/` own reservation lifecycle, availability, folio posting, housekeeping, and maintenance rules.
- Repositories in `repositories/` own Sequelize access for Hospitality tenant-local tables.
- POS remains the owner of checkout, fiscal/non-fiscal receipt selection, and stock deduction; Hospitality folios receive additive charge/payment lines.
- Stock-bearing minibar, retail, supplies, and physical add-ons continue through shared Item/FIFO/location stock contracts. Room nights, amenities, and facility bookings are capacity reservations and stock-exempt.
