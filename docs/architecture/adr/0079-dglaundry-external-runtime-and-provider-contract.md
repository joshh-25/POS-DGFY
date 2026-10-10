---
status: amended
authority_level: architecture
owner: dgfy-platform
date: 2026-08-30
last_reviewed: 2026-10-10
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

## Amendments

### 2026-10-08 — Runtime attestation and qualification probes (#2306)

Issue [#2306](https://github.com/Sieitzz/dgfy-platform/issues/2306) adds an admin-gated signed
runtime attestation, operator-generated signed event specimens, and staging-only payment-lifecycle
probes for one reserved DGLaundry booking. Readiness fields are derived from current runtime
configuration and checks; client-registration readiness fails closed while registration state
cannot be queried. The probes require the reserved order identity, active mapped company/location,
and test-mode PayMongo for expiry/refund. Fixture creation uses the existing booking/payment flow,
and probe delivery reuses existing DGLaundry outbox, expiry, and refund behavior.

The attestation signs canonical JSON bytes directly with the existing DGFY Ed25519 event key.
This is a proposed document-signature envelope pending confirmation against DGLaundry's validator.
The probe route and response contract was posted to #2306 for provider confirmation and is also
pending. `publicAdmission` and `testAdmission` are best-effort mappings pending validator review.
Local implementation does not establish deployed readiness or hosted validator acceptance.

### 2026-10-07 — Persist DGFY-origin delivery and operator recovery

Issue [#2310](https://github.com/Sieitzz/dgfy-platform/issues/2310) implements Decision 6's
durability requirement on the DGFY side. Outbound provider operations retain an immutable,
company/location-scoped intent before transport, reuse operation/event identity across retries,
and use landlord MySQL leases with bounded retries. Foreground delivery and background delivery
share the same signed transport implementation; credentials and signed headers are regenerated per
attempt. Exhausted operations remain inspectable and require an audited owner/admin redrive.

Inbound event signature nonces are claimed atomically in shared Redis only after digest, signature,
and timestamp verification. The accepted signature lifetime is bounded to 300 seconds and claims
remain through the final accepted second. Redis unavailability fails closed. Operator dead-letter
inspection is scoped to the caller's accepted owner/admin membership and an active mapped
company/location; stored payloads and guest tracking capabilities are never returned.

This amendment records operational semantics under the existing, untagged Decision 6. It does not
claim exactly-once transport: provider idempotency remains required for safe at-least-once delivery.

### 2026-10-07 — Ratify `laundry` as the #518 engine classification; widen `external`'s documented meaning; adopt the contract of record

Issue [#518](https://github.com/Sieitzz/dgfy-platform/issues/518) ("Decide the sibling-app
integration tier and its engine classification") was opened to make this decision but implementation
shipped first: `laundry` was added to `WORKFLOW_MODE_VALUES` with engine `external`
(`packages/shared-constants/src/workflowModes.js`, commit `c460faf71`) while #518 sat open and this
ADR sat `proposed`. This amendment closes that gap rather than leaving the shipped code governed by
a non-binding document.

- **Ratified for #518**: `laundry`, as a `WORKFLOW_MODE_VALUES` entry with
  `WORKFLOW_MODE_ENGINE.laundry = 'external'`, is the engine classification this ADR's Decision 1
  already described. No further decision is needed on #518; it is closed by this amendment.
- **`external`'s documented meaning is widened by this mode.** Elsewhere in the codebase, the
  `external` tier means "DGFY provides registration and UI/UX visibility only" — the `#505`/ADR 0037
  Decision 8 shape. `laundry` is not that: DGFY also owns the public tenant storefront, checkout, and
  DGFY-origin payment capture/refund (Decision 4 above). `external` for this mode specifically means
  "DGLaundry owns the operational engine," not "DGFY is visibility-only." A future `external`-tier
  mode must state which of these two shapes it means rather than assuming the generic one.
- **This does not retroactively authorize a new hard-coded workflow mode as a general pattern.**
  `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`'s "no new hard-coded verticals after the Store
  Template layer" rule stands for every future vertical; this amendment records `laundry` as the one
  dated exception that rule's own text anticipates (a genuinely new mode family whose lifecycle the
  existing capability vocabulary cannot express — here, inverted engine ownership, not a new
  combination of existing capabilities). See that playbook's matching amendment, same date.
- **Contract of record**: `docs/api/PARTNER_INTEGRATION_CONTRACT.md` is the authoritative DGFY-owned
  contract a partner developer codes against, addressing issue #519's "write the contract down"
  requirement. It restates and verifies this ADR's decisions against current source; this ADR
  remains the architectural authority, the contract document is the implementation-level detail.

### 2026-10-10 — Generic partner contract and `laundry` engine shape (#803)

- Clause amended: Decision 1 and the 2026-10-07 rule that every future `external` shape must be
  named (`default`).
- Change: the generic [Third-Party Partner Contract](../../api/THIRD_PARTY_PARTNER_CONTRACT.md)
  defines `external` authority as a per-location attachment attribute, not a new workflow mode.
  The existing `laundry` mode remains the DGLaundry-owned operational-engine shape: DGLaundry owns
  its operational engine, while DGFY retains the storefront and DGFY-origin payment responsibilities
  already stated here. The DGLaundry-specific contract remains authoritative for that integration;
  its legacy claim, routes, and environment client triple are compatibility seams until #2311 proves
  generic replacement and ADR 0035 removal criteria pass. The generic contract is reference while
  proposed ADR 0092 awaits approval.
- Reason: answer the required generic polarity without rewriting the DGLaundry-specific runtime or
  authorizing another hard-coded workflow mode.
- See: ADR 0035, ADR 0092, #803, and #2311.
