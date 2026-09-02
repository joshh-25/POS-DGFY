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
5. The public staff origin is `https://laundry.dgfy.ph`; the customer URL is
   `https://dgfy.ph/tenant-store/<handle>`. DGFY Nginx and the DGLaundry
   gateway share only the external `dgfy-dglaundry-edge` network.
6. Provider events and requests are signed, idempotent, ordered, replay
   protected, traceable, and backed by durable inbox/outbox processing. A
   failed branch readiness or security/payment gate keeps the integration
   dark; enablement is an all-approved-branches operation against a frozen
   allowlist.

## Consequences

DGFY must maintain provider-owned mapping, OIDC key, event, and payment
evidence before production authorization. Same-host deployment is operational
co-location only. A global kill switch and per-branch kill switch are required
for rollback. Local or mock evidence qualifies implementation for provider
review but never proves hosted or production readiness.
