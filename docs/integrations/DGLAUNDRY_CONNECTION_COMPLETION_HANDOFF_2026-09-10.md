---
status: provider_action_required
authority_level: implementation_handoff
owner: dgfy-platform integration owners
last_reviewed: 2026-09-10
applies_to: laundry.surebizcorp.com
topic: staged_dglaundry_connection_completion
---

# DGLaundry connection completion handoff

This handoff updates the connected work tracked by [issue #519](https://github.com/Sieitzz/dgfy-platform/issues/519), [PR #1721](https://github.com/Sieitzz/dgfy-platform/pull/1721), and [PR #1769](https://github.com/Sieitzz/dgfy-platform/pull/1769). Please assign named owners in the issue and reply there with the deployed SHA and redacted evidence for every completed row. `@patterueldev` is requested as the release/integration coordinator for the provider side.

It is a contract handoff. It does not grant access to DGLaundry, its database,
its credentials, or Surebizcorp infrastructure, and it does not authorize
provider activation by itself.

## Document authority

For the 2026-09-10 connection-completion review, this file is the current
provider-action checklist. It supersedes the operational guidance in
[DGLAUNDRY_SUREBIZCORP_PROVIDER_HANDOFF.md](./DGLAUNDRY_SUREBIZCORP_PROVIDER_HANDOFF.md),
[DGLAUNDRY_STOREFRONT_ORDERS_HANDOFF.md](./DGLAUNDRY_STOREFRONT_ORDERS_HANDOFF.md),
[DGLAUNDRY_BOOKING_PAYMENTS_HANDOFF.md](./DGLAUNDRY_BOOKING_PAYMENTS_HANDOFF.md),
and [DGLAUNDRY_CONNECTION_COMPLETION_UPDATE_2026-09-10.md](./DGLAUNDRY_CONNECTION_COMPLETION_UPDATE_2026-09-10.md).
Those documents remain historical context only; they must not be used to infer
provider readiness or authorize activation.

## Target values and contract identifiers (ratification required)

| Surface | Required value | Authority/status |
| --- | --- | --- |
| Staff origin | `https://laundry.surebizcorp.com` | Fixed integration target |
| OIDC callback | `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback` | Fixed integration target |
| DGLaundry partner base | `https://laundry.surebizcorp.com` | Fixed integration target |
| Customer storefront pattern | `https://dgfy.ph/tenant-store/<approved-handle>` | Fixed integration target |
| DGLaundry partner health | `GET /api/v1/integrations/dgfy/health` | Fixed integration target |
| Contract versions | `external-runtime-v0.1`, `laundry-mode-v1` | Proposed identifiers; not yet emitted or validated by the DGFY runtime; ratification is tracked in [issue #519](https://github.com/Sieitzz/dgfy-platform/issues/519) |

The URL values are fixed integration targets. The version strings are contract
proposals from the DGLaundry manifest, not current DGFY constants. Do not treat
this handoff or the fixture as runtime authority until issue #519 is accepted
and the provider implementation emits and validates the ratified values.

Do not substitute `laundry.dgfy.ph`, an IP address, an HTTP URL, a trailing
slash, or `skupervisor.surebizcorp.com`.

## DGLaundry package to consume

DGLaundry is delivering the package from its isolated branch
`codex/dgfy-connection-completion`, created from the deployed baseline
`da9ced73e98ed4d0a6f886273920cf9ae2a6203c`. The exact qualified and deployed
application SHA is `253cfcfa771d15942d28b80c73a577b02c58259b` (DGLaundry PR
[#3](https://github.com/Sieitzz/dglaundry/pull/3)), running at the staff origin
with DGFY disabled. Its contract manifest hash is
`a295bed55bfe1d4c98f4613b27bdd239fc83fea181628f00bacfeec700db4df3`, and the
schema head is `075_mock_provider_credentials.sql`. The immutable image
digests and deployment verification record are in the DGLaundry release
manifest; provider qualification remains pending.

The provider can run the neutral, secret-free contract fixture checked into this
repository at `tests/fixtures/dgfy/connection-contract.json` without importing
DGLaundry runtime source or a database. The manifest defines all required event
types, signature components, exact URLs, negative cases, and the six acceptance
suites. Public keys and fingerprints may be exchanged; private keys, tokens,
passwords, and full signed payloads must remain in the approved secret channel.

The DGLaundry key ceremony has generated these public fingerprints for
provider registration. They identify the key sets only; no private material is
included here. Fingerprints are SHA-256 over the DER-encoded SubjectPublicKeyInfo;
the corresponding public PEM files are in
[`docs/integrations/dglaundry-public-keys/`](./dglaundry-public-keys/):

| Purpose | Key ID | Public PEM | SHA-256 public-key fingerprint |
| --- | --- | --- | --- |
| DGFY partner request verification (P-256) | `dgfy-partner-p256-20260910` | [`dgfy-partner-p256-20260910.pub`](./dglaundry-public-keys/dgfy-partner-p256-20260910.pub) | `913bfd2594af5fa8f4b5924f801fa357102654ead2e8acc8edb61afa8b7f7d03` |
| DGLaundry event verification (Ed25519) | `dglaundry-events-ed25519-20260910` | [`dglaundry-events-ed25519-20260910.pub`](./dglaundry-public-keys/dglaundry-events-ed25519-20260910.pub) | `4a9d9cb1a524dc25cc7e5a5afafd0ba12308f76dec51ce2f5dba40cd476a554e` |
| Machine client assertions (RSA) | `dglaundry-machine-rsa-20260910` | [`dglaundry-machine-rsa-20260910.pub`](./dglaundry-public-keys/dglaundry-machine-rsa-20260910.pub) | `261b7de775689cf72c8cf5aef56f84b575fd2f8dd48c5eeb09f5714928f661a2` |

## Required provider work

### Identity/platform — named owner required

- Publish a valid OIDC signing JWKS at `https://api.dgfy.ph/oidc/jwks` and
  confirm discovery advertises the same issuer, token endpoint, JWKS URI, and
  PKCE S256 support. The current live JWKS failure was
  `oidc_keys_not_configured` (503).
- Register the exact callback above and confirm the approved logout and launch
  destinations. Correct any status-link builder that points at a SKUpervisor
  origin; return the actual application identifier.
- Register browser Authorization Code + PKCE + PAR separately from the
  machine client. Verify first-time identity-only onboarding, multiple pending
  company applications, approval/rejection/correction, revocation, logout,
  invalid state/nonce/callback, and failed company switching.
- Register a separate machine client for `private_key_jwt` token issuance.
  DGLaundry will send short-lived client assertions and renew the access token;
  browser cookies and OIDC tokens must never be reused as machine credentials.

### Partner API/security — named owner required

- Implement and deploy short-lived machine-token issuance and validation for
  the DGLaundry partner client. Document the accepted assertion algorithm,
  audience, scope, expiry, key ID, and rotation procedure.
- Verify DGFY-to-DGLaundry partner requests with P-256
  `ecdsa-p256-sha256`, tag `dgfy-external-runtime-v1`, and separate RFC 9421
  `Signature-Input` and `Signature` headers. Cover the method, target URI,
  body digest/content type when present, authorization, idempotency key when
  present, app ID, contract version, and date.
- Accept DGLaundry-to-DGFY events with Ed25519, tag `dglaundry-dgfy-v1`, the
  same split headers, bounded timestamps, nonce replay protection, altered
  payload rejection, unknown-key rejection, and overlapping key rotation.
- Prove empty-body GET and query handling through the real proxy path. A new
  signature may retry one event ID; a reused nonce or altered payload must
  fail. Keep event inbox acceptance separate from business processing.

### Company/onboarding — named owner required

- Connect registration and location intents to the actual admin approval
  workflow. Persist immutable account, subject, company, membership, location,
  and version IDs; reject email/name/slug or caller-supplied mapping claims.
- Emit signed company access/approval events only after the authoritative
  decision, and prove replay, gap, snapshot reconciliation, suspension, and
  revocation behavior.
- Make launcher and registration-status destinations point to the approved
  DGFY application and status page. Do not show “waiting for approval” until a
  verified provider application is pending.

### Storefront — named owner required

- Materialize the approved handle, shop profile, mapped branches, catalog,
  options, availability, hours, fulfillment methods, and public media from the
  DGLaundry projections. Preserve versions and tombstones.
- Prove an ordinary customer can browse and order from the approved shop
  without merchant membership or access to staff-only routes. Validate branch
  mapping and readiness before quote and submission.
- Report desktop/mobile evidence for discovery → branch selection → catalog →
  options → quote → checkout → history → tracking → receipt confirmation.

### Payments/orders — named owner required

- Run quote → reservation → fixed/per-kilo/mixed booking → payment →
  operations → tracking → receipt. DGFY owns online payment/refund authority;
  DGLaundry receives immutable snapshots and never charges the provider payment
  again.
- Prove expiry, cancellation, duplicate payment webhook, provider outage,
  refund, out-of-order update/payment events, reconciliation, and no duplicate
  inventory or financial effects. Per-kilo children remain reservation-only
  until an authenticated DGLaundry attendant records grams and local tender.
- Return the provider event IDs, payment IDs, order/group references, versions,
  and redacted expected results for each case.

## Joint activation order

1. Provider qualification runs the shared manifest against the designated
   qualification environment with registered clients and one approved mapping.
2. Staff activation enables OIDC login and company setup while commerce remains
   off. Verify callback, multiple applications, approval, switching, staff
   branch permissions, logout, and revocation.
3. After recovery, backup, monitoring, and signed-transport gates pass, enable
   exactly one approved branch. Run a controlled payment and refund through the
   complete customer journey.
4. Observe 24 hours for queue age, authorization failures, order divergence,
   resource pressure, backup freshness, and operator alerts. If a gate fails,
   disable new online orders, preserve accepted work, keep reconciliation
   available, and roll back only to a compatible application image.

## Evidence format and close condition

Reply in issue #519 using:

`flow | owner | DGFY SHA | DGLaundry SHA | environment | test/evidence | pass/fail | blocker`

The connection is closed only when every provider row has a named owner,
deployed SHA, and passing evidence. Documentation merge or a generic
acknowledgment alone does not close a row. Record separate results for **staff
connected**, **online ordering verified**, and **production operations
verified**.
