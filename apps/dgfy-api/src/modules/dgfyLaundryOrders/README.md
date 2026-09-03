# DGLaundry storefront and order projections

This module is the DGFY-owned side of the storefront-orders seam. DGLaundry
remains authoritative for branch catalog, availability, quotes, service
execution, and fulfillment. DGFY stores a sanitized, versioned projection and
owns the customer account/cart/order experience.

The inbound `POST /api/v1/integrations/dglaundry/events` route verifies the
provider signature, records the event in an append-only inbox, rejects mapping
violations, ignores stale aggregate versions, quarantines version gaps, and
materializes only customer-safe fields. Duplicate event IDs are idempotent.

Authenticated DGFY routes expose the projection and forward quote/order
operations to the provider:

- `GET /api/v1/dgfy/laundry/catalog?company_id=&location_id=`
- `GET /api/v1/dgfy/laundry/availability?company_id=&location_id=`
- `GET /api/v1/dgfy/laundry/orders/:externalOrderReference?company_id=&location_id=`
- `POST /api/v1/dgfy/laundry/quotes`
- `POST /api/v1/dgfy/laundry/orders`
- `PATCH /api/v1/dgfy/laundry/orders/:externalOrderReference`
- `POST /api/v1/dgfy/laundry/orders/:externalOrderReference/cancel`

All mutations require an idempotency key. The provider client supports the
local HMAC fixture profile and fails closed in production unless the
asymmetric HTTP Message Signature profile is configured. No DGLaundry
password, refresh token, private key, database credential, or runtime source
is imported.
