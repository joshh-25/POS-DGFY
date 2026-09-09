---
status: draft_pr
authority_level: implementation_handoff
owner: dgfy-platform
last_reviewed: 2026-09-07
applies_to: dglaundry_surebizcorp_provider_setup
topic: dglaundry_surebizcorp_provider_setup
---

# DGLaundry Surebizcorp provider handoff

This is the provider-side checklist for connecting the independent DGLaundry
runtime to DGFY for the Surebizcorp deployment. It is a tracked handoff, not a
production approval. It supersedes the old `laundry.dgfy.ph` origin for this
target only. No private credentials, tokens, passwords, or private keys belong
in this document or in source control.

Related tracking: [#519](https://github.com/Sieitzz/dgfy-platform/issues/519),
[#521](https://github.com/Sieitzz/dgfy-platform/issues/521),
[#801](https://github.com/Sieitzz/dgfy-platform/issues/801), and
[#803](https://github.com/Sieitzz/dgfy-platform/issues/803).

## Target topology

| Surface | Authority and URL |
| --- | --- |
| DGLaundry staff application | `https://laundry.surebizcorp.com` |
| DGLaundry OIDC callback | `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback` |
| DGFY provider API | `https://api.dgfy.ph` |
| DGFY customer storefront | `https://dgfy.ph/tenant-store/<handle>` |

The staff origin and callback are exact values. Do not substitute
`laundry.dgfy.ph`, `skupervisor.surebizcorp.com`, an IP address, an HTTP URL, or
a trailing-slash variant.

## Ownership boundary

DGFY remains authoritative for global identity, passwords and OTP, legal
acceptance, company and membership approval, the public tenant storefront,
online checkout and payment/refund records, customer history, notifications,
and customer tracking.

DGLaundry remains authoritative for branches, catalog and quote calculation,
schedules and shifts, machines, service jobs, fulfillment execution, proof of
completion, counter payments, and operational reporting. The services share
signed contracts only. They must not share runtime source, databases, Redis,
private networks, credentials, bearer or refresh tokens, or signing private
keys.

## Provider configuration requested

The DGFY provider owner should complete each item and attach redacted evidence
to the linked issue or PR.

### 1. Register the DGLaundry client

- [ ] Register the client for the Surebizcorp DGLaundry staff application.
- [ ] Allow Authorization Code with PKCE using `S256`; require state, nonce,
      issuer, audience, redirect URI, and authorization-code checks.
- [ ] Register exactly:
      `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback`.
- [ ] Confirm the approved launch/logout origins and the post-logout redirect
      before sending them to DGLaundry; do not invent a second staff origin.
- [ ] Return the client identifier, scopes, audience, and the approved origin
      list through the approved secret/configuration channel. Do not put client
      secrets in GitHub, issue comments, chat, URLs, or logs.

### 2. Make OIDC keys usable

- [ ] Publish the provider signing JWKS at
      `https://api.dgfy.ph/oidc/jwks`.
- [ ] Configure the corresponding private signing key in the provider's
      secret manager and record only key IDs/fingerprints in the evidence.
- [ ] Confirm discovery at
      `https://api.dgfy.ph/oidc/.well-known/openid-configuration` advertises
      the same issuer, authorization endpoint, token endpoint, JWKS URI, and
      `S256` support.
- [ ] Capture the discovery and JWKS response hashes, key IDs, algorithm, and
      rotation/revocation procedure in the linked issue.

Read-only preflight on 2026-09-07 found discovery reachable with issuer
`https://api.dgfy.ph/oidc`, but the JWKS endpoint returned
`oidc_keys_not_configured`. OIDC sign-in must stay disabled until a valid JWKS
is published and an end-to-end sandbox authorization succeeds.

### 3. Expose and authorize the partner contract

The provider must confirm the exact HTTP methods, authentication middleware,
request/response schemas, scopes, audience, rate limits, and error contract for
these provider-owned routes:

- `POST /api/v1/partners/dglaundry/account/launch`
- `GET /api/v1/partners/dglaundry/session-context`
- `POST /api/v1/partners/dglaundry/registration-intents`
- `POST /api/v1/partners/dglaundry/location-intents`
- `POST /api/v1/partners/dglaundry/staff-invitation-intents`
- `POST /api/v1/partners/dglaundry/mappings`
- `POST /api/v1/integrations/dglaundry/events` for signed inbound DGLaundry
  events, if enabled by the accepted storefront/booking slices

The DGLaundry production profile expects the provider base URL
`https://api.dgfy.ph`, the issuer `https://api.dgfy.ph/oidc`, and the partner
base URL `https://laundry.surebizcorp.com`. Partner writes use the approved
asymmetric HTTP Message Signature profile in production; local HMAC fixtures
are not production evidence.

The provider must verify that every company and location mapping is explicit,
immutable, tenant-scoped, and membership-authorized. Email, name, slug,
phone, or a caller-supplied company ID must never select a company or grant
access.

### 4. Provision one acceptance mapping

- [ ] Create one sandbox/acceptance laundry company and one location through
      the normal DGFY registration and approval flow.
- [ ] Approve the owner membership and the DGLaundry partner attachment.
- [ ] Return the immutable DGFY account, membership, company, and location IDs
      through the approved secure channel; only non-secret IDs may be recorded
      in the issue/PR.
- [ ] Confirm the mapping can be revoked without deleting DGFY identity or
      DGLaundry operational records.

## Storefront implementation follow-up

Use [the storefront connection checklist](DGLAUNDRY_STOREFRONT_CONNECTION_CHECKLIST.md)
for exact routes, configuration ownership, source gaps and the end-to-end
customer/order/payment acceptance matrix. PR #1721 merged this handoff; it
did not certify the storefront or provider configuration as complete.

## Contract package to qualify

The DGLaundry candidate reviewed for this handoff is:

- Source SHA: `3d071db124bc528b64e2fbec7388a8a8cd94f217`.
- Partner OpenAPI SHA-256:
  `8850efb0bd47fb7a002e8e942421dc62ef672c843a07deb456ec333a14942648`.
- Event catalogue SHA-256:
  `2f3ea8bd08ce00f0eef9a46cf5816cb69dd2f6612fe1f85913bcb18809ca5de6`.

Before activation, the provider and DGLaundry owners must attach redacted
acceptance evidence for:

1. Authorization, callback, logout, session expiry, revocation, and failed
   state/nonce/PKCE/issuer/audience checks.
2. Registration, explicit company approval, location mapping, staff invitation,
   and wrong-company/wrong-location denial.
3. Signed catalog and availability projection, quote, booking groups, progress,
   tracking, receipt confirmation, and counter-payment separation.
4. Fixed, per-kilo, and mixed booking behavior, including expiry, cancellation,
   refund, duplicate request, replay, out-of-order event, outage, retry, and
   redrive behavior.
5. Trace IDs, provider event IDs, idempotency keys, rate-limit behavior,
   reconciliation results, rollback/kill-switch procedure, and named owners.

The customer storefront and online payment/refund authority remain dark for
this integration until the corresponding provider and hosted gates are
qualified. A local test, a source review, or a draft PR does not authorize
production activation.

## Acceptance criteria

This handoff is complete for provider review when the issue or PR contains:

- the registered callback, launch/logout origins, client metadata, scopes, and
  audience;
- discovery and JWKS hashes plus key IDs/fingerprints and the rotation owner;
- the confirmed method/auth/schema matrix for every route above;
- one approved acceptance company/location mapping with immutable IDs;
- redacted sandbox evidence for the negative and replay cases listed above;
- the rollback, escalation, and secret-rotation owners; and
- an explicit statement that the integration remains disabled until DGLaundry
  hosted TLS/DNS and deployment evidence is attached.

## Do not do

- Do not deploy, mutate, or SSH into the DGLaundry or Surebizcorp server from
  this provider handoff.
- Do not place passwords, bearer tokens, refresh tokens, client secrets, private
  keys, database credentials, or full signed payloads in GitHub or chat.
- Do not connect DGFY and DGLaundry databases, Redis instances, runtimes,
  private networks, or secret stores.
- Do not enable a global laundry mode or infer identity from an email, name,
  slug, phone number, or caller-selected tenant.
- Do not treat `laundry.dgfy.ph` as the Surebizcorp staff origin.
