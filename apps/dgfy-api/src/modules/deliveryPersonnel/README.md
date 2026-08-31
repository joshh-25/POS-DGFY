# Delivery Personnel Module

Tenant-local registry of manual-delivery riders/couriers who may not have a DGFY or POS
login account.

Flow:

`POS routes -> delivery personnel handlers -> delivery personnel use cases -> delivery personnel repository -> tenant models`

## Rules

- Delivery personnel records belong to one tenant and never grant authentication or POS permissions.
- Registry management is gated on `pos:employees:manage` (administrator/settings authority), never
  on `pos:transact` — per ADR 0034's 2026-08-08 amendment.
- A delivery personnel record may be assigned to one active tenant location or remain
  company-wide (`location_id: null`).
- Deactivation (`is_active: false`) is the only removal path — there is no hard delete.
  `delivery_jobs.delivery_personnel_id` is `ON DELETE RESTRICT`; historic assignments must stay
  readable.
- Active display names are checked case-insensitively per location scope on create, returning
  `409 CONFLICT` on a duplicate — a soft guard, not a unique constraint, since two riders may
  genuinely share a name.
- Create and update operations are transactional and write audit records
  (`AuditLog.entity_type = 'delivery_personnel'`).
- The existing cashier-facing `GET /pos/delivery-personnel` route (active-only, location-scoped,
  `pos:view`) lives in `modules/pos` and is unrelated to this module's admin registry routes
  (`GET /pos/delivery-personnel/registry`, `pos:employees:manage`) — two different auth tiers and
  filters over the same `DeliveryPersonnel` model.

See `docs/architecture/adr/0034-manual-delivery-job-foundation.md` and
`docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md`.
