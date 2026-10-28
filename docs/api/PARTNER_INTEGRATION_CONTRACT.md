---
status: authoritative
authority_level: authoritative
owner: dgfy-platform
date: 2026-10-07
last_reviewed: 2026-10-26
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

- Client: `client_secret_basic`, registered client id `DGFY_DGLAUNDRY_CLIENT_ID`, and exact
  redirect `DGFY_DGLAUNDRY_REDIRECT_URI` for the selected environment:

  | DGLaundry deployment | DGFY environment | Client ID | Callback |
  |---|---|---|---|
  | Surebiz, still hosted independently | DEV | `dglaundry-web-dev` | `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback` |
  | DGLaundry staging stack | STAGE | `dglaundry-web` | `https://dglaundry.stage.dgfy.ph/api/v1/session/dgfy/callback` |
  | DGLaundry production stack | PROD | `dglaundry-web` | `https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback` |

  Each environment has independent client registration and keys even where the non-DEV client
  labels match. Surebiz remains on its current host and connects to DGFY over public HTTPS; this
  mapping does not move its runtime or data to DGFY infrastructure.
- Browser client credentials are separate from the retired `DGLAUNDRY_PARTNER_TOKEN` setting;
  hosted deployments deliver `DGFY_DGLAUNDRY_CLIENT_SECRET` through SOPS/Compose secrets (or
  `DGFY_DGLAUNDRY_CLIENT_SECRET_FILE`). Credentials in request bodies are rejected.
- Flow: PAR mandatory → `authorize` → `token` (`authorization_code` grant). `code_challenge_method`
  must be `S256`; any other value is rejected at `/oidc/par`. The browser `authorize` response
  uses explicit Accept negotiation: HTML-preferring navigations enter DGFY Storefront account
  authentication, while missing/wildcard Accept and JSON-preferring clients retain the existing
  JSON protocol behavior, including unauthenticated 401.
- Scope requested by DGLaundry: `openid profile email dglaundry.company_context`.
- ID token: RS256, 300s TTL, carries the custom claim `dglaundry_company_context: { companyId,
  membershipId, role }`.
- State/nonce/authorization-code storage is Redis-backed and single-use (`GETDEL`); in production,
  an unavailable Redis fails closed rather than falling back to memory.
- A valid PAR is consumed once, then held in a Redis-backed, browser-bound interaction for at most
  600 seconds. The DGFY Storefront origin comes from the exact, environment-specific
  `STOREFRONT_PUBLIC_ORIGIN`; the issuer stays on the configured `DGFY_OIDC_ISSUER` at `api.*`.
  Issuer-host completion tickets last at most 60 seconds and never extend the interaction; the
  authorization code remains 120 seconds. No callback, scope, state, nonce, PKCE, or onboarding
  intent is accepted from the browser after PAR redemption.
- Storefront displays the signed-in DGFY identity and current accepted DGLaundry memberships. A
  fixed company selector must match an accepted membership exactly. No eligible membership or an
  explicit `dglaundry_intent=create_company` request can continue with identity scopes only: the
  granted scopes omit `dglaundry.company_context`, and the ID token omits the company-context claim.
  This establishes identity only; DGLaundry still owns company onboarding and no company,
  membership, location mapping, or operational permission is created by the issuer.
- Cookie-authenticated preparation uses the existing CSRF token and exact configured Storefront
  `Origin`. Completion uses an issuer-host-only HttpOnly browser-binding cookie, a same-origin
  fragment-to-POST bridge, live session/client/membership revalidation, and atomic single-use
  ticket/interaction redemption. DGFY session tokens remain HttpOnly and are not returned to
  Storefront or DGLaundry.

For hosted DGLaundry integration, `STOREFRONT_PUBLIC_ORIGIN` must exactly match the integration
environment: `https://dev.dgfy.ph` for development, `https://stage.dgfy.ph` for staging, or
`https://dgfy.ph` for production. Missing values, URL paths, and cross-environment origins fail
production environment validation; do not infer the Storefront origin from request Host headers.

### 2. Inbound machine (DGLaundry → DGFY) — `client_credentials` + `private_key_jwt`

- `DGFY_DGLAUNDRY_MACHINE_CLIENT_ID` (default `dglaundry-machine`) authenticates with a
  `private_key_jwt` assertion (RS256, ≤300s lifetime, replay-protected by one-time `jti`).
- Requests exactly the registered inbound scope `dglaundry`; missing, combined, or unknown scopes
  are rejected. This scope grants the DGLaundry machine partner-API surface. The `dglaundry:*`
  operation scopes below are for the opposite DGFY → DGLaundry direction and must not be reused.
- Grants an **opaque** (non-JWT) DGFY access token only after its 300-second grant is durably stored;
  token issuance fails closed if Redis storage is unavailable.
- Each request's signed `x-dgfy-app-id` must equal the environment's registered DGLaundry app ID
  (`DGFY_DGLAUNDRY_PARTNER_APP_ID`; currently `dglaundry`). The machine OAuth client ID and app ID
  are separate identities.
- Every DGLaundry→DGFY API request additionally carries its own RFC 9421 HTTP Message Signature —
  see "Request/event signing" below. The bearer token and the signature are both required; neither
  replaces the other.

### 3. Outbound service token (DGFY → DGLaundry) — RS256, one exact scope

For DGFY-initiated calls (quote, booking preparation, order resolution), DGFY mints a **5-minute
RS256 JWT** from its OIDC signing key (`dglaundryPartnerAccessToken.js`), not an opaque token:

- `iss` = the exact environment-specific DGFY OIDC issuer (`https://api.dev.dgfy.ph/oidc` in DEV,
  `https://api.stage.dgfy.ph/oidc` in staging, and `https://api.dgfy.ph/oidc` in production).
  `sub` and `client_id` = the registered
  `DGFY_DGLAUNDRY_SERVICE_CLIENT_ID`, distinct from the inbound machine client above.
- `aud` = the exact DGLaundry partner API origin (`https://laundry.surebizcorp.com` in DEV,
  `https://dglaundry.stage.dgfy.ph` in staging, and `https://dglaundry.dgfy.ph` in production).
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
- Required headers checked for presence: `X-DGFY-App-Id`, `X-DGFY-Contract-Version`, `Date`, and
  `Authorization`. The DGLaundry machine client ID, exact inbound scope `dglaundry`, and app ID
  are independently checked against the configured registration before the request signature is
  accepted; hosted configuration must explicitly set `DGFY_DGLAUNDRY_PARTNER_APP_ID`.

### Ed25519 events (`dglaundry-dgfy-v1`)

- Covered components, exact order: `@method`, `@authority`, `@path`, `content-digest`,
  `content-type`.
- Timestamp window via `created`/`expires` params in `Signature-Input`: `0 < expires − created ≤
  300s`, `created ≤ now + skew`, and `expires ≥ now`.
- Receiver claims `sha256(keyid\0nonce)` with Redis `SET NX EX` under the `dglaundry:event:nonce:`
  prefix after signature verification. The claim lasts through the final accepted second. A
  duplicate returns `401 DGLAUNDRY_SIGNATURE_REPLAY`; unavailable Redis returns `503
  DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE` and does not ingest the event.

### Hosted profile requirements

Hosted DEV, staging, and production integrations run with `NODE_ENV=production`, so durable Redis
replay checks and production signature rules stay enabled even when the DGFY deployment label is
DEV. `DGLAUNDRY_SIGNATURE_PROFILE=http-message-signatures-v1` is required for both directions; the
HMAC fallback profile (`hmac-local-v1`) is blocked in this hosted runtime.

## Endpoint matrix

All paths below are exactly as mounted in `apps/dgfy-api/src/server.js:760-770`. "Caller" is who may
legitimately call the route; "Auth" is the middleware that actually gates it today.

### OIDC provider — mounted at `/oidc`

| Method | Path | Caller | Auth |
|---|---|---|---|
| GET | `/oidc/.well-known/openid-configuration` | Anyone | none |
| GET | `/oidc/jwks` | Anyone | none (returns 503 if signing key unconfigured); publishes active and retiring registry keys |
| POST | `/oidc/par` | DGLaundry browser client | client registration check |
| GET | `/oidc/authorize` | DGLaundry browser client | Explicit HTML negotiation starts an interaction; JSON callers retain `authenticateDgfyAccount` and protocol behavior |
| GET | `/oidc/complete` | DGFY issuer browser | Minimal no-store, CSP-restricted same-origin completion bridge |
| POST | `/oidc/complete` | DGFY issuer browser | Exact Origin, CSRF cookie/header, issuer-host binding cookie, one-time ticket |
| POST | `/oidc/token` | DGLaundry browser or machine client | client credentials / `private_key_jwt` |
| GET | `/oidc/logout` | Signed-in DGFY account holder and registered browser client | `authenticateDgfyAccount`, signed `id_token_hint` matching that account; revokes its linked opaque token and redirects only to the exact configured post-logout URI |
| POST | `/oidc/revoke` | Registered browser or machine client | `client_secret_basic` or `private_key_jwt`; revokes only tokens owned by the authenticated client |
| POST | `/oidc/introspect` | Registered browser or machine client | `client_secret_basic` or `private_key_jwt`; tokens owned by another client are reported inactive |

All `/oidc/*` endpoints use the Redis-backed `oidcLimiter`: 20 requests per 5 minutes in
production and 100 per 5 minutes in development by default. `OIDC_RATE_LIMIT_MAX_REQUESTS` and
`OIDC_RATE_LIMIT_WINDOW_MS` override the budget and window. The limiter keys requests by IP,
client ID, and route; see [RATE_LIMITING.md](RATE_LIMITING.md).

### DGFY Storefront OIDC interaction API — mounted at `/api/v1/dgfy/oidc`

| Method | Path | Caller | Auth |
|---|---|---|---|
| POST | `/interactions/{id}/bind` | Storefront browser | One-use PAR handoff fragment, CSRF cookie/header, exact configured Storefront Origin; sets a per-interaction host-only HttpOnly cookie |
| GET | `/interactions/{id}` | Storefront browser | Requires the per-interaction Storefront cookie; public presentation hints; account/company data only with a valid DGFY session |
| POST | `/interactions/{id}/complete` | Storefront browser | `authenticateDgfyAccount`, per-interaction Storefront cookie, CSRF cookie/header, exact configured Storefront Origin |
| GET | `/errors/{id}` | Storefront browser | Public, bounded, server-stored readable error details; restart link only for the active registered DGLaundry browser client |

The issuer redirects to Storefront with a random one-use handoff in the URL fragment. Storefront removes the fragment before requesting `/bind`; the API consumes the handoff and sets a host-only `sku_oidc_storefront_binding_{interactionId}` cookie whose lifetime ends with the interaction. The interaction ID alone is never proof of browser authority. Login and registration requests that include `oidc_interaction_id` also require this cookie, and successful authentication evidence is stored against its binding.

Completion preparation accepts `action=company` plus `company_id`, or `action=create_company`.
The server rechecks accepted membership and creates a one-minute or shorter opaque ticket. The
Storefront sends the user to the configured issuer's `/oidc/complete#ticket=...`; it never receives
the DGFY session token. Cookie-authenticated writes retain the global CSRF control; CORS and
`SESSION_COOKIE_DOMAIN` policy are unchanged.

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
| GET | `/admin/attestation` | DGFY administrator | `authenticateAdmin`; no-store response |
| POST | `/orders/{externalOrderReference}/cancel` | DGLaundry machine client | `requireDglaundryPartner`; staging fixture only; `Idempotency-Key` |
| POST | `/orders/{externalOrderReference}/expire` | DGLaundry machine client | `requireDglaundryPartner`; staging test-mode fixture only; `Idempotency-Key` |
| POST | `/orders/{externalOrderReference}/refund` | DGLaundry machine client | `requireDglaundryPartner`; staging test-mode fixture only; `Idempotency-Key` |
| POST | `/orders/{externalOrderReference}/receipt` | DGLaundry machine client | `requireDglaundryPartner`; staging fixture only; `Idempotency-Key` |
| POST | `/customer-activities` | DGLaundry machine client | `requireDglaundryPartner` |
| GET | `/dead-letters?company_id=&location_id=&direction=&limit=` | DGFY laundry company owner/admin | `authenticateDgfyAccount`, accepted membership + active mapping |
| POST | `/dead-letters/{id}/redrive` | DGFY laundry company owner/admin | `authenticateDgfyAccount`, accepted membership + active mapping + CSRF for cookie sessions |

### DGLaundry company registration review

Registration submissions carry the configured DGFY OIDC `issuer` and the exact applicant
`subject`. DGFY resolves that pair to an active account; request-supplied company, tenant, location,
membership IDs, email, name, and slug do not establish identity or select an existing company.
Pending registrations are durable admin work items and do not use the older 15-minute partner
intent expiry.

`GET /registration-intents/{intentId}` returns the current `intentId`, status, reason, nullable
company/location/membership IDs, exact issuer and subject, membership/company/business/connection
statuses, `statusVersion`, and `companyAccessVersion`. Pending, correction-required, and rejected
responses have no company, provider location, or membership IDs. Approval returns DGFY-generated
company, provider-location, and accepted owner-membership IDs. A provider location ID is never
substituted with a DGLaundry branch ID.

DGFY Platform Admin exposes a separate queue under Tenant Management. Its API routes are under
`/api/v1/admin/tenants/dglaundry-registration-intents` and require the live `admin.tenants`
permission. Queue search and status filters read registration intents separately from tenant rows
and Storefront registration drafts. The decision request is
`{ decision, expectedStatusVersion, reason }`, where decision is `approve`, `reject`, or
`request_correction`. Rejection and correction require a reason. DGFY checks the expected version
under a row lock; stale decisions return `409`. An exact retry of the recorded decision is
idempotent. Approval atomically creates the active DGFY laundry company, its first DGFY-owned
provider location, the applicant's accepted owner membership, the incremented status/access
versions, and an admin audit record. Rejection and correction create no company, location, or
membership.

DGLaundry's existing status refresh is the only reconciliation path into the local workspace. It
must match the saved intent and exact local account issuer/subject, observe a non-regressing
status version, and verify active company, accepted membership, laundry mode, active connection,
and all three authoritative IDs before local organization/branch creation. Repeated refresh returns
the original local workspace. Surebiz demo provisioning stays mock-backed and does not call this
connected DGFY approval flow.

The order lookup uses `company_id` and `location_id` as the canonical scope query parameters. The
query-only `companyId` and `locationId` aliases remain temporarily compatible because the complete
target URI is signed; conflicting or repeated values are rejected. Unsigned
`X-DGFY-Company-Id` / `X-DGFY-Location-Id` header aliases are rejected rather than used as scope.
The DGLaundry joint harness sends only the canonical snake_case parameters.

The runtime attestation endpoint returns `{ attestation, signature, keyId, algorithm, details }`.
`signature` is base64 Ed25519 over the canonical JSON encoding of `attestation`; the envelope is
not an RFC 9421 HTTP signature. Client readiness remains false until actual client registrations
can be inspected. The `publicAdmission` and `testAdmission` mappings are implementation estimates
and still need confirmation against DGLaundry's private validator. This source-side contract does
not establish hosted readiness.

`GET /capabilities` advertises the four lifecycle probes in `paymentLifecycleProbes`. Each entry
contains `kind`, `method`, `path`, `statePath`, `orderReferencePath`, `paymentModePath`,
`companyIdPath`, and `locationIdPath`. All probe responses use this flat shape:

```json
{
  "externalOrderReference": "DGLAUNDRY-QUALIFICATION-SANDBOX-0001",
  "state": "...",
  "paymentMode": "test",
  "companyId": "...",
  "locationId": "..."
}
```

The paths were proposed to DGLaundry on #2306 and remain pending provider confirmation. The probe
routes reject every reference except the reserved qualification order and are restricted to
`NODE_ENV=staging`; payment probes also fail closed unless `PAYMONGO_MODE=test`. The fixture
operator command creates its reservation through the existing booking flow and writes a DGFY
projection from the returned provider reservation. It does not seed a parallel order state machine.

Outbound delivery failures and failed paid-session completion reconciliation appear in the scoped
dead-letter listing. Redriving a failed completion retries only the local session reconciliation;
it does not send the provider event again.

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

## Known gaps (verified in source, 2026-10-27)

The administration and permission boundary is defined separately in
[`PARTNER_ADMINISTRATION_MATRIX.md`](PARTNER_ADMINISTRATION_MATRIX.md) for issue #2379. That matrix
assigns first-release DGFY Admin and OPIS responsibilities and distinguishes App, client, credential,
and tenant attachment authority. This contract remains the owner of wire-level partner behavior;
the matrix does not redefine endpoints or offline authorization semantics.

This table is the document's load-bearing content — it states plainly what is built, what is
configuration-only, and what does not exist, rather than implying full readiness.

| Gap | Status | Tracking |
|---|---|---|
| Tenant Management's separate DGLaundry registration queue, versioned admin decisions, and atomic DGFY company/location/owner-membership approval | ✅ source implementation and local API/admin checks passed on the current branch; staging deployment and synthetic end-to-end qualification remain outstanding | This change; staging release owner |
| DEV JWKS and discovery require the independent DEV OIDC signing registration/key; the DEV connection is not live until configuration, key delivery, and authenticated qualification complete | ⚠️ registration and hosted verification remain open | #2387, #2304 |
| Staging/production JWKS returns `503 oidc_keys_not_configured` until a real keypair is installed — shared key resolution, staging bind mounts, and production SOPS-to-Compose-secret delivery are implemented, but no live key installation or deployment has been verified | ⚠️ operator key provisioning and deployment remain | #2303 |
| DEV uses separate `dglaundry-web-dev` / `dglaundry-machine-dev` / `dglaundry-service-dev` IDs; staging and production retain their existing client labels in independent registrations. Registration and live callback verification remain outstanding | ⚠️ contract agreed; host registration and verification remain open | #2387, #2304, #519 |
| Signed runtime attestation, signed event specimen generator, and reserved sandbox payment-lifecycle probes | ⚠️ source implementation is present on this candidate; provider validator compatibility, fixture setup, and staging execution remain outstanding | #2306 |
| OIDC end-session, opaque-token introspection/revocation, DB-backed signing-key overlap rotation, dedicated `/oidc/*` rate limiting, and production Redis fail-closed behavior are implemented on PR #2337; the source is not merged and hosted issuer configuration/verification remain outstanding | ⚠️ source candidate only; staging/production keys, registrations, Redis and real-host behavior remain unverified | #2307, #2337 |
| Customer-facing laundry ordering: catalog, quote and per-kilo submission are callable from the laundry storefront; fixed/mixed submission uses verified payment finalization but remains dark-disabled while the DGLaundry booking-payment feature flag is off | ⚠️ partially shipped; fixed-price checkout is not available until its payment gate is enabled | #2308 |
| Hosted legacy `x-dglaundry-partner-token` fallback, inbound-scope enforcement, and registered app-ID binding | ⚠️ source hardening is implemented on the current candidate; hosted behavior and exact environment registrations remain to verify | #2309 |
| Outbound delivery is persisted in the landlord MySQL outbox and retried with bounded leases/backoff; scoped dead-letter inspection and audited recovery are mounted; inbound event nonce claims use shared Redis | ✅ implemented locally; migration and deployed verification remain separate rollout gates | #2310 |
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

The generic contract is now documented in [Third-Party Partner Contract](THIRD_PARTY_PARTNER_CONTRACT.md).
It defines the DGFY-engine and external-engine tiers while this DGLaundry contract remains authoritative
for the existing DGLaundry integration and its compatibility adapter.
