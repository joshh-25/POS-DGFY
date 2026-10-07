# DGLaundry storefront and order projections

This module is the DGFY-owned side of the storefront-orders seam. DGLaundry
remains authoritative for branch catalog, availability, quotes, service
execution, and fulfillment. DGFY stores a sanitized, versioned projection and
owns the customer account/cart/order experience.

Every DGFY-origin mutation is first stored in the landlord-only
`dgfy_dglaundry_outbox`. Foreground calls attempt the durable operation
immediately; timeout/network, 408, 429, and 5xx failures return `503` with a
pending operation reference while a worker retries it. Defaults are 8 attempts,
a 10-second request timeout, 2-second worker polling, 10 claims per batch, and
bounded exponential backoff with jitter (maximum delay 5 minutes). Retry
attempts reuse the immutable payload and event/idempotency identity while
creating fresh authorization/signature material. Health reads remain direct.
Operators recover exhausted work through the scoped dead-letter route; delivery
is at least once and relies on provider-side idempotency.
The worker rechecks active mappings before each send, honors booking payment
kill switches and disabled branches, and stores paid-session completion in a
separate eight-attempt retry state so delivery is never repeated just to finish
the local payment-session update.

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

Inbound asymmetric event nonces use shared Redis `SET NX EX` claims after
signature and timestamp checks. Redis unavailability fails closed with
`503 DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE`; event lifetime is at most 300
seconds and a claim remains through the last accepted second. The worker starts
with the API server and stops claiming before graceful shutdown; in-flight work
finishes or recovers through lease expiry.

Operator recovery is mounted at
`GET /api/v1/partners/dglaundry/dead-letters` and
`POST /api/v1/partners/dglaundry/dead-letters/:id/redrive`. Both require the
authenticated caller's accepted owner/admin membership and an active mapped
company/location. Lists contain failure metadata only. Redrive requires a
reason, records actor/time/state/reason in the landlord audit log, and never
accepts replacement payloads.

### Opt-in MySQL/Redis durability acceptance

Run `node scripts/verify-dglaundry-outbox-durability.mjs` against disposable MySQL 8 and Redis 7
services. Set `DGLAUNDRY_TEST_MYSQL_ADMIN_USER`, `DGLAUNDRY_TEST_MYSQL_ADMIN_PASSWORD`,
`DGLAUNDRY_TEST_MYSQL_HOST`, `DGLAUNDRY_TEST_MYSQL_PORT`, and `DGLAUNDRY_TEST_REDIS_URL` first.
The harness creates and drops a randomly named database with the `dglaundry_2310_test_` prefix;
the supplied MySQL account therefore needs create/drop database privileges. It verifies migration
repeatability, concurrent ordering/claims, lease recovery, stale-ack protection, completion-only
redrive, persistence from a separate process, and Redis nonce replay rejection across parallel
processes and a later process restart. It does not exercise live provider calls or payment APIs.
