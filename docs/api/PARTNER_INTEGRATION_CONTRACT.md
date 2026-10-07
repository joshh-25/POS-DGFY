---
status: authoritative
authority_level: authoritative
owner: dgfy-platform
date: 2026-10-07
last_reviewed: 2026-10-07
review_by: 2027-04-07
applies_to: dgfy_dglaundry_integration
topic: partner_integration_contract
---

# DGFY partner integration contract — DGLaundry

This is the authoritative, DGFY-owned record of what DGFY exposes to the DGLaundry sibling app and
what DGLaundry must provide in return. It answers issue
[#519](https://github.com/Sieitzz/dgfy-platform/issues/519)'s own requirement: *"this contract needs
to be an actual document... not tribal knowledge."*

It is written from verified source on both repositories (`dgfy-platform` @ `develop`,
`dglaundry` @ `develop`), not from any single handoff. The `docs/integrations/DGLAUNDRY_*.md` files
remain as dated operational handoffs and qualification runbooks — useful history, but none of them
carries contract authority; two of them (`DGLAUNDRY_CONNECTION_COMPLETION_HANDOFF_2026-09-10.md`,
`DGLAUNDRY_CONNECTION_COMPLETION_UPDATE_2026-09-10.md`) say so explicitly in their own frontmatter.
This document supersedes none of them as a record, but is the one a partner developer should code
against going forward.

The architectural decision this contract implements is [ADR
0079](../architecture/adr/0079-dglaundry-external-runtime-and-provider-contract.md).

## Scope note (issue #466)

This is a hand-written contract fragment covering exactly the DGLaundry-facing surface. It is not,
and does not claim to be, a general OpenAPI specification for `dgfy-api` — #466's finding that no
such spec exists remains accurate. A machine-readable fragment of this same surface is published
alongside it at [`partner-dglaundry-openapi.yaml`](partner-dglaundry-openapi.yaml).

## Ownership boundary

| DGFY owns | DGLaundry owns |
|---|---|
| Global identity (OIDC issuer, account, membership) | Branches, catalog authoring, quote calculation |
| Company/location mapping and approval | Schedules, shifts, machines, service jobs |
| Public tenant storefront and customer URL | Fulfillment execution, proof of completion |
| DGFY-origin online checkout, payment capture, refund | Counter payments, operational reporting |
| Customer history, notifications, tracking | — |

The two applications do not share runtime source, databases, Redis, private networks, credentials,
bearer/refresh tokens, or signing private keys (ADR 0079 Context). `laundry` is an **external**
`WORKFLOW_MODE_ENGINE` classification: DGFY renders the customer storefront and launches staff
operations, but DGLaundry owns the operational engine end to end
(`packages/shared-constants/src/workflowModes.js`).

## Credential profiles — four separate trust paths, non-interchangeable

A valid credential in one profile never substitutes for another (ADR 0079 Decision 7). All four
coexist on every signed request/event; none of them alone is sufficient.

### 1. Browser — Authorization Code + PKCE S256 + PAR

- Client: `client_secret_basic`, registered client id `DGFY_DGLAUNDRY_CLIENT_ID` (default
  `dglaundry-web`), redirect `DGFY_DGLAUNDRY_REDIRECT_URI` (exactly
  `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback` for the Surebizcorp deployment).
- Flow: PAR mandatory → `authorize` → `token` (`authorization_code` grant). `code_challenge_method`
  must be `S256`; any other value is rejected at `/oidc/par`.
- Scope requested by DGLaundry: `openid profile email dglaundry.company_context`.
- ID token: RS256, 300s TTL, carries the custom claim `dglaundry_company_context: { companyId,
  membershipId, role }`.
- State/nonce/authorization-code storage is Redis-backed and single-use (`GETDEL`); in production,
  an unavailable Redis fails closed rather than falling back to memory.

### 2. Inbound machine (DGLaundry → DGFY) — `client_credentials` + `private_key_jwt`

- `DGFY_DGLAUNDRY_MACHINE_CLIENT_ID` (default `dglaundry-machine`) authenticates with a
  `private_key_jwt` assertion (RS256, ≤300s lifetime, replay-protected by one-time `jti`).
- Grants an **opaque** (non-JWT) DGFY access token, 300s TTL, scoped by whatever the caller sends in
  `scope` — see "Known gaps" below; DGFY does not currently constrain this value.
- Every DGLaundry→DGFY API request additionally carries its own RFC 9421 HTTP Message Signature —
  see "Request/event signing" below. The bearer token and the signature are both required; neither
  replaces the other.

### 3. Outbound service token (DGFY → DGLaundry) — RS256, one exact scope

For DGFY-initiated calls (quote, booking preparation, order resolution), DGFY mints a **5-minute
RS256 JWT** from its OIDC signing key (`dglaundryPartnerAccessToken.js`), not an opaque token:

- `iss`/`sub`/`client_id` = the registered `DGFY_DGLAUNDRY_SERVICE_CLIENT_ID` (distinct from the
  inbound machine client above).
- `aud` = the exact DGLaundry partner API origin.
- `scope` = **exactly one** operation scope — see the table below. DGLaundry's verifier requires
  strict equality, not membership in a list.
- `dgfy_company_id` / `dgfy_location_id` = the active mapped values for this request.
- `jti` unique per token.
- The HTTP request carrying this bearer is independently signed with DGFY's own P-256 key
  (`dgfy-external-runtime-v1` profile). Static/hosted bearer values are not supported for this
  profile.

| Operation | DGFY → DGLaundry route | Required scope |
|---|---|---|
| Create a quote | `POST /api/v1/integrations/dgfy/quotes` | `dglaundry:quotes:create` |
| Prepare a booking group | `POST /api/v1/integrations/dgfy/booking-groups/prepare` | `dglaundry:bookings:prepare` |
| Resolve order projections | `POST /api/v1/integrations/dgfy/order-projections/resolve` | `dglaundry:orders:read` |

### 4. Event signing — separate Ed25519 key registry, both directions

DGFY-origin events (`dglaundry-dgfy-v1` tag) and DGLaundry-origin events are both Ed25519-signed,
using a key registry **distinct from** the P-256 request-signing keys above — a receiver selects
the verification key by algorithm + `keyid`, never by route name.

## Request/event signing — exact profiles

### RFC 9421 P-256 requests (`dgfy-external-runtime-v1`)

Applies to every signed DGLaundry↔DGFY partner-API request (not events).

- Algorithm: `ecdsa-p256-sha256`, signature IEEE-P1363, fixed 64 bytes raw `r || s`.
- Covered components, exact order: `@method`, `@target-uri`, (`content-digest`, `content-type` if a
  body is present), `authorization`, (`idempotency-key` if present), `x-dgfy-app-id`,
  `x-dgfy-contract-version`, `date`.
- Content digest: `sha-256=:<base64>:` over the raw body.
- Clock skew: `max(30, DGLAUNDRY_INTEGRATION_MAX_SKEW_SECONDS || 300)` seconds.
- Replay protection: Redis `SET NX EX` keyed on `sha256(keyId\0nonce)`; a production instance with
  Redis unavailable returns `503 DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE` rather than skipping
  the check.
- Required headers checked for presence: `X-DGFY-App-Id` (not validated against any registry — see
  "Known gaps"), `X-DGFY-Contract-Version`, `Date`, `Authorization`.

### Ed25519 events (`dglaundry-dgfy-v1`)

- Covered components, exact order: `@method`, `@authority`, `@path`, `content-digest`,
  `content-type`.
- Timestamp window via `created`/`expires` params in `Signature-Input`: `expires − created ≤ 300s`,
  `created ≤ now + skew`, `expires ≥ now`.
- Receiver: DGFY's inbound replay cache is an **in-process Map**, not Redis-backed — see "Known
  gaps."

### Production profile requirements

`DGLAUNDRY_SIGNATURE_PROFILE=http-message-signatures-v1` is enforced in production for both
directions; the HMAC fallback profile (`hmac-local-v1`) is explicitly blocked outside non-production
environments at the signature-verification layer.

## Endpoint matrix

All paths below are exactly as mounted in `apps/dgfy-api/src/server.js:760-770`. "Caller" is who may
legitimately call the route; "Auth" is the middleware that actually gates it today.

### OIDC provider — mounted at `/oidc`

| Method | Path | Caller | Auth |
|---|---|---|---|
| GET | `/oidc/.well-known/openid-configuration` | Anyone | none |
| GET | `/oidc/jwks` | Anyone | none (returns 503 if signing key unconfigured) |
| POST | `/oidc/par` | DGLaundry browser client | client registration check |
| GET | `/oidc/authorize` | DGFY account holder (browser) | `authenticateDgfyAccount` |
| POST | `/oidc/token` | DGLaundry browser or machine client | client credentials / `private_key_jwt` |
| POST | `/oidc/revoke` | DGLaundry browser client | client registration check |

### Partner provider API — mounted at `/api/v1/partners/dglaundry`

| Method | Path | Caller | Auth |
|---|---|---|---|
| GET | `/account/companies` | DGFY account holder | `authenticateDgfyAccount` |
| POST | `/account/launch` | DGFY account holder | `authenticateDgfyAccount` |
| GET | `/session-context` | DGLaundry browser session | `authenticateDglaundryAccessToken` |
| POST, GET | `/registration-intents[/:intentId]` | DGLaundry machine client | `requireDglaundryPartner` |
| POST, GET | `/location-intents[/:intentId]` | DGLaundry machine client | `requireDglaundryPartner` |
| POST, GET | `/staff-invitation-intents[/:intentId]` | DGLaundry machine client | `requireDglaundryPartner` |
| POST | `/mappings` | DGLaundry machine client | `requireDglaundryPartner` |
| GET | `/health` | DGLaundry machine client | `requireDglaundryPartner` |
| GET | `/capabilities` | DGLaundry machine client | `requireDglaundryPartner` |
| GET | `/companies/{companyId}` | DGLaundry machine client | `requireDglaundryPartner` |
| GET | `/orders/{externalOrderReference}` | DGLaundry machine client | `requireDglaundryPartner` |
| POST | `/customer-activities` | DGLaundry machine client | `requireDglaundryPartner` |

The order lookup accepts `company_id` / `location_id` or `companyId` / `locationId` query
parameters first, with `X-DGFY-Company-Id` and `X-DGFY-Location-Id` headers as fallbacks. The joint
harness currently uses camelCase query parameters while DGLaundry's proposal declares headers; both
forms are supported pending alignment between the two repositories.

### Inbound event receiver and customer/storefront operations — absolute paths

| Method | Path | Caller | Auth |
|---|---|---|---|
| POST | `/api/v1/integrations/dglaundry/events` | DGLaundry worker | Ed25519 event signature |
| GET | `/api/v1/store/laundry/catalog` | Storefront customer or guest | tenant context + active DGLaundry mapping + `services` capability |
| GET | `/api/v1/store/laundry/availability` | Storefront customer or guest | tenant context + active DGLaundry mapping + `services` capability |
| POST | `/api/v1/store/laundry/quotes` | Storefront customer or guest | tenant context + active DGLaundry mapping + `services` capability |
| POST | `/api/v1/store/laundry/orders` | Storefront customer or guest; per-kilo only | tenant context + active DGLaundry mapping + `services` capability |
| GET/PATCH | `/api/v1/store/laundry/orders/:externalOrderReference` | Owning Store customer or guest tracking capability | tenant context + active mapping + ownership binding |
| POST | `/api/v1/store/laundry/orders/:externalOrderReference/cancel` | Owning Store customer or guest tracking capability | tenant context + active mapping + ownership binding |
| POST | `/api/v1/commerce-payments/dglaundry/booking-groups/payment-sessions` | Storefront customer or guest; fixed/mixed | tenant context + active mapping + payment feature gate |

The legacy `/api/v1/dgfy/laundry/*` customer routes have been removed. Storefront customers use the
tenant-scoped routes above; the integration router now only receives signed DGLaundry events.

### Outbound — DGFY calling DGLaundry

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/integrations/dgfy/quotes` | Create a priced quote |
| POST | `/api/v1/integrations/dgfy/booking-groups/prepare` | Prepare fixed/per-kilo booking group |
| POST | `/api/v1/integrations/dgfy/order-projections/resolve` | Reconcile order/tracking state |
| POST | `/api/v1/integrations/dgfy/events` | Submit/cancel/receipt-confirm events |

## Event catalogue

### DGLaundry → DGFY (accepted by `apps/dgfy-api/src/modules/dgfyLaundryOrders/contracts.js`)

| Event type | Purpose |
|---|---|
| `dglaundry.laundry_catalog.published.v1` | Catalog projection update |
| `dglaundry.laundry_branch.availability_changed.v1` | Availability projection update |
| `dglaundry.laundry_order.accepted.v1` | Order accepted by DGLaundry |
| `dglaundry.laundry_order.rejected.v1` | Order rejected |
| `dglaundry.laundry_order.counter_registered.v1` | Counter (in-shop) activity registered |
| `dglaundry.laundry_order.service_progressed.v1` | Per-line service progress |
| `dglaundry.laundry_order.status_changed.v1` | Aggregate status change |
| `dglaundry.laundry_order.fulfillment_changed.v1` | Fulfillment state change |

### DGFY → DGLaundry (accepted by DGLaundry's `supportedProviderEventTypes`)

| Event type | Purpose |
|---|---|
| `dgfy.company.access_changed.v1` | Membership/location mapping version change |
| `dgfy.company.ownership_changed.v1` | Owner subject changed |
| `dgfy.company.suspended.v1` | Company suspended |
| `dgfy.company.mapping_changed.v1` | Location mapping changed |
| `dgfy.company.connection_activated.v1` | Integration connection activated |
| `dgfy.company.access_snapshot.v1` | Full access-state repair snapshot |
| `dgfy.laundry_order.snapshot.v1` | Full order-state repair snapshot |
| `dgfy.laundry_order.submitted.v1` | Order submitted (paid, for fixed-price) |
| `dgfy.laundry_order.status_changed.v1` | Status change |
| `dgfy.laundry_order.updated.v1` | Fulfillment/schedule update |
| `dgfy.laundry_order.payment_status_changed.v1` | Payment state change |
| `dgfy.laundry_order.cancelled.v1` | Order cancelled |
| `dgfy.laundry_order.receipt_confirmed.v1` | Customer confirmed receipt |

**Documented in DGLaundry's own event catalogue but not in its accepted set:**
`dgfy.laundry_business.registration_status_changed.v1` would be quarantined if DGFY sent it today —
flagged for reconciliation, not yet an active contract item.

## Error contract

- Transport-signature failures return `401`/`503` with a machine-readable `error_code` (e.g.
  `DGLAUNDRY_REQUEST_SIGNATURE_INVALID`, `DGLAUNDRY_REQUEST_REPLAY`,
  `DGLAUNDRY_REQUEST_REPLAY_STORE_UNAVAILABLE`) — see `dglaundryPartnerAuth.js` and
  `dglaundryEventSignature.js` for the full enumerated set on the DGFY side.
- OIDC errors use the standard OAuth2 error shape (`invalid_grant`, `invalid_client`,
  `temporarily_unavailable`) per RFC 6749.
- DGLaundry expects `application/problem+json` (RFC 9457): `{ type, title, status, code, detail?,
  requestId? }`, `429` with `Retry-After`, and `503` for provider-dependency outage. DGFY does not
  currently emit this shape on `/api/v1/partners/dglaundry/*` — recorded as a gap, not a contract
  DGFY already satisfies.

## Known gaps (verified in source, 2026-10-07)

This table is the document's load-bearing content — it states plainly what is built, what is
configuration-only, and what does not exist, rather than implying full readiness.

| Gap | Status | Tracking |
|---|---|---|
| Staging/production JWKS returns `503 oidc_keys_not_configured` — no key-file mount or env classification exists in `infrastructure/docker/` | ⚠️ config/infra, not code | filed under epic #517 |
| Browser/machine/service client IDs never registered (`dglaundry-connection-manifest.json` ships blank) | ⚠️ config | filed under epic #517 |
| Signed provider runtime attestation, signed event specimens, payment-lifecycle probe routes | ❌ not built | filed under epic #517 |
| No `end_session_endpoint`, no userinfo, no introspection; access tokens are opaque; single-key JWKS (no overlap rotation); `/oidc/*` excluded from `generalLimiter` | ❌ not built | filed under epic #517 |
| Customer-facing laundry ordering: catalog, quote and per-kilo submission are callable from the laundry storefront; fixed/mixed submission uses verified payment finalization but remains dark-disabled while the DGLaundry booking-payment feature flag is off | ⚠️ partially shipped; fixed-price checkout is not available until its payment gate is enabled | #2308 |
| Legacy `x-dglaundry-partner-token` shared secret still accepted in production when no `Authorization` header is sent | ❌ security gap | filed under epic #517, `security` |
| Inbound `scope` is never enforced server-side; `x-dgfy-app-id` is required-present but never validated against a registry | ❌ security gap | filed under epic #517, `security` |
| No outbound outbox/retry/dead-letter (plain `fetch`, nothing durable); event replay cache is in-process, not Redis; `listDglaundryDeadLetters` is built but unrouted | ❌ not built | filed under epic #517 |
| `ServiceBooking.source` has no external/sibling value and the DGLaundry integration has zero coupling to `ServiceBooking` — it uses parallel projection tables and a parallel `dglaundry_booking` payment target instead | ⚠️ design question, not a build gap | #522's premise should be re-read before implementation |

### Customer-ordering hardening contract (#2308)

- Storefront customer identity is optional. A signed-in Store customer is bound by the trusted
  `dgfy_account_id`; a guest receives DGFY-minted order and private tracking references. Submitted
  contact name, email, and phone are informational and are **not verified identity or ownership
  proof**. Do not use them for account binding.
- The guest tracking reference is a reusable bearer capability for that guest order, not a
  single-use credential. Per-operation idempotency keys prevent replay of the same request key and
  payload. DGFY does not locally freeze mutations on a terminal order projection; it relies on the
  provider to reject a mutation after a terminal transition, and the projection may lag until a
  signed provider event arrives. This eventual state window is a residual risk for follow-up
  hardening.
- Direct `/api/v1/store/laundry/orders` submission is per-kilo-only. Fixed/mixed orders must use
  the DGLaundry booking payment-session target, and `dgfy.laundry_order.submitted.v1` must remain
  behind PayMongo-verified finalization. The `DGLAUNDRY_BOOKING_PAYMENTS_ENABLED` flag stays off
  until its separate operator gates are approved; the storefront must show an unavailable state.
- This work does not create, change, or extend Store customer accounts, password recovery, or
  session lifecycle. Existing Store auth remains the account lifecycle owner.
- Validation evidence for this surface: DGLaundry order/payment use-case and reservation-cancel
  tests; storefront rendered-component and mode/catalog tests; `npm run build:store`;
  `npm run check:architecture`; and `npm run lint:docs`.

## What a future sibling/third-party app can and cannot reuse

**Reusable as a pattern:** the identity/transport/eventing stack — OIDC with PAR/PKCE S256,
`private_key_jwt` client-credentials, RFC 9421 P-256 request signing, Ed25519 event signing, a
durable signed-event inbox with dedupe/quarantine/dead-letter, and an identity-mapping table keyed
on immutable `(issuer, subject)` rather than email/name/slug.

**Not reusable as built:** this implementation is DGLaundry-specific end to end — one hardcoded
client triple in environment variables (no `oauth_client`/`api_key`/`service_account` table of any
kind), a vendor-named namespace (`/api/v1/partners/dglaundry`, not a generic `/api/v1/partners/:app`
or `/api/v1/external/:app`), and an ID token carrying a `dglaundry_company_context` claim. It cannot
admit a second partner without code changes, and `/oidc` is mounted specifically from the
`dgfyLaundry` module. It also inverts the polarity a genuinely external POS app would want: here
DGFY materializes sanitized projections while DGLaundry owns the engine (`ims=false`, `pos=false`
on the laundry tenant); an external POS wanting DGFY as the engine of record for transactions and
inventory needs the opposite shape.

See [issue #796](https://github.com/Sieitzz/dgfy-platform/issues/796) (Epic: Third-party app
integration tier) and [#803](https://github.com/Sieitzz/dgfy-platform/issues/803) (the third-party
version of this same question) for that separate track.
