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

All mutations require an idempotency key and an active company/location
mapping. The provider client supports the local HMAC fixture profile and fails
closed in production unless the asymmetric HTTP Message Signature profile is
configured. For DGFY-to-DGLaundry quote, booking preparation, and order
resolution, DGFY mints a five-minute RS256 OIDC JWT with the exact operation
scope, service-client identity, and mapped company/location claims. That
bearer is separately covered by the P-256 `dgfy-external-runtime-v1` HTTP
Message Signature. DGFY-origin events use the separate Ed25519
`dglaundry-dgfy-v1` profile. DGLaundry-to-DGFY keeps its existing opaque
machine-token flow; the two directions do not share a token. No DGLaundry
password, refresh token, private key, database credential, or runtime source
is imported.
