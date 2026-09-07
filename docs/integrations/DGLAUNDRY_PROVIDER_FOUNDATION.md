---
status: proposed
authority_level: operational_handoff
owner: dgfy-platform
last_reviewed: 2026-08-30
review_by: 2027-02-28
applies_to: dglaundry_provider_foundation
topic: dglaundry_provider_foundation
---

# DGLaundry provider foundation

> **Surebizcorp target (2026-09-07):** This earlier foundation record contains
> the former `laundry.dgfy.ph` staff origin. For the Surebizcorp deployment, use
> [`DGLAUNDRY_SUREBIZCORP_PROVIDER_HANDOFF.md`](DGLAUNDRY_SUREBIZCORP_PROVIDER_HANDOFF.md)
> and register only `https://laundry.surebizcorp.com` with its exact callback.
> Do not copy the former hostname into provider or deployment configuration.

This change adds the DGFY-owned provider foundation for the independent
DGLaundry runtime. It is the first sequential PR and must be merged before
storefront projections or payment/hosting work is rebased.

## Public endpoints

- OIDC discovery: `GET https://api.dgfy.ph/oidc/.well-known/openid-configuration`
- OIDC JWKS: `GET https://api.dgfy.ph/oidc/jwks`
- DGLaundry staff launch: `POST /api/v1/partners/dglaundry/account/launch`
- Session context: `GET /api/v1/partners/dglaundry/session-context`
- Registration intent: `POST /api/v1/partners/dglaundry/registration-intents`
- Location intent: `POST /api/v1/partners/dglaundry/location-intents`
- Staff invitation intent: `POST /api/v1/partners/dglaundry/staff-invitation-intents`
- Explicit mapping approval: `POST /api/v1/partners/dglaundry/mappings`

Partner intent/mapping writes require the DGLaundry partner secret through a
secret-manager file reference. Account launch and session context require the
authenticated DGFY account. The provider never accepts an email, name, slug,
or caller-selected tenant as an identity substitute.

## Runtime ownership

Laundry registration persists `business_mode=laundry`,
`runtime_owner=dglaundry`, `dgfy_storefront=true`, `ims=false`, `pos=false`,
and the fixed operations origin `https://laundry.dgfy.ph`. DGFY continues to
own the customer URL `https://dgfy.ph/tenant-store/<handle>`.

## Qualification boundary

The provider foundation has unit coverage for explicit account selection,
membership denial, launch URL, session context, and intent idempotency. OIDC
private/public keys, Redis-backed PAR/state/nonce, provider sandbox accounts,
hosted TLS/DNS, and production authorization remain environment gates. Local
tests do not qualify a hosted or production deployment.
