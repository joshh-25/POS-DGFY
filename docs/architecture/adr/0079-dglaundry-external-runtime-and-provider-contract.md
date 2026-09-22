---
status: proposed
authority_level: architecture
owner: dgfy-platform
date: 2026-08-30
last_reviewed: 2026-08-30
review_by: 2027-02-28
applies_to: dgfy_dglaundry_integration
topic: dglaundry_external_runtime_and_provider_contract
---

# DGLaundry external runtime and provider contract

## Context

DGLaundry is an independent laundry operations application. DGFY owns global
identity, company and membership authorization, public tenant storefronts,
customer activity, and DGFY-origin online payments. The applications may be
hosted by the same DGFY infrastructure team, but they must not share runtime
processes, databases, private networks, credentials, bearer/refresh tokens,
or signing private keys.

## Decisions

1. `laundry` is an external DGFY workflow mode with the immutable tenant
   settings `business_mode=laundry`, `runtime_owner=dglaundry`,
   `dgfy_storefront=true`, `ims=false`, and `pos=false`. DGFY may render the
   customer storefront and launch staff operations, but DGLaundry owns the
   operational engine.
2. Identity is the DGFY OIDC issuer plus immutable account subject. Access is
   granted only through accepted membership and explicit company/location
   mapping records. Email, name, slug, ownership assumptions, or a
   request-supplied company ID cannot grant access or select a company.
3. The provider uses Authorization Code, PKCE S256, PAR, asymmetric JWKS,
   Redis-backed state/nonce/code storage, short-lived access tokens, and
   revocation. DGLaundry never receives a DGFY password or refresh token.
4. DGLaundry owns catalog, availability, quote, schedules, service execution,
   fulfillment, and counter payments. DGFY materializes only sanitized public
   projections and remains authoritative for DGFY-origin online payment
   capture, refund, cancellation, and receipt events.
5. The public staff origin for the Surebizcorp deployment is
   `https://laundry.surebizcorp.com`; the customer URL is
   `https://dgfy.ph/tenant-store/<handle>`. DGFY Nginx and the DGLaundry
   gateway share only the external `dgfy-dglaundry-edge` network.
6. Provider events and requests are signed, idempotent, ordered, replay
   protected, traceable, and backed by durable inbox/outbox processing. A
   failed branch readiness or security/payment gate keeps the integration
   dark; enablement is an all-approved-branches operation against a frozen
   allowlist.
7. Token direction and request-signature direction are separate credentials.
   For DGLaundry-to-DGFY calls, DGLaundry uses its registered machine-client
   assertion to obtain the existing short-lived opaque DGFY partner token and
   signs the request with its own P-256 key. For DGFY-to-DGLaundry quote,
   booking-preparation, and order-resolution calls, DGFY signs a five-minute
   RS256 JWT with its OIDC signing key. That JWT has the exact DGLaundry API
   origin as `aud`, the separately registered DGFY service client as both
   `sub` and `client_id`, one exact operation scope (`dglaundry:quotes:create`,
   `dglaundry:bookings:prepare`, or `dglaundry:orders:read`), a unique `jti`,
   and the active mapped `dgfy_company_id` and `dgfy_location_id`. The request
   is independently signed using DGFY's P-256 key; a valid bearer does not
   replace the HTTP Message Signature, nor does a valid signature replace the
   bearer authorization. DGFY-origin events use a separate Ed25519 key and
   trust registry. Hosted static bearer values are not supported.

## Consequences

DGFY must maintain provider-owned mapping, separate browser/machine/service
client registrations, OIDC key, request/event key registries, and payment
evidence before production authorization. Same-host deployment is operational
co-location only. A global kill switch and per-branch kill switch are required
for rollback. Local or mock evidence qualifies implementation for provider
review but never proves hosted or production readiness.
