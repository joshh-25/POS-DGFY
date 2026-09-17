---
status: provider_action_required
authority_level: implementation_handoff
owner: dgfy-platform integration owners
last_reviewed: 2026-09-17
applies_to: laundry.surebizcorp.com
topic: staged_dglaundry_connection_completion
---

# DGLaundry connection completion handoff

This handoff updates the connected work tracked by [issue #519](https://github.com/Sieitzz/dgfy-platform/issues/519), DGFY [PR #1920](https://github.com/Sieitzz/dgfy-platform/pull/1920), and DGLaundry [PR #20](https://github.com/Sieitzz/dglaundry/pull/20). Please assign named owners in issue #519 and reply there with the deployed SHA and redacted evidence for every completed row. `@patterueldev` is requested as the release/integration coordinator for the provider side.

It is a contract handoff. It does not grant access to DGLaundry, its database,
its credentials, or Surebizcorp infrastructure, and it does not authorize
provider activation by itself.

## Document authority

For the 2026-09-17 connection-completion review, this file is the current
provider-action checklist. It supersedes the operational guidance in
[DGLAUNDRY_SUREBIZCORP_PROVIDER_HANDOFF.md](./DGLAUNDRY_SUREBIZCORP_PROVIDER_HANDOFF.md),
[DGLAUNDRY_STOREFRONT_ORDERS_HANDOFF.md](./DGLAUNDRY_STOREFRONT_ORDERS_HANDOFF.md),
[DGLAUNDRY_BOOKING_PAYMENTS_HANDOFF.md](./DGLAUNDRY_BOOKING_PAYMENTS_HANDOFF.md),
and [DGLAUNDRY_CONNECTION_COMPLETION_UPDATE_2026-09-10.md](./DGLAUNDRY_CONNECTION_COMPLETION_UPDATE_2026-09-10.md).
Those documents remain historical context only; they must not be used to infer
provider readiness or authorize activation.

## Current execution status — 2026-09-17

This section is the current provider/DevOps gate. The remaining sections retain
the contract details and scenario requirements, but any older SHA, PR, CI,
health, or rollout statement is superseded by this snapshot.

### Why the connection is still disabled

- DGLaundry is hosted and reachable at `https://laundry.surebizcorp.com`, but
  `GET /api/v1/integrations/dgfy/health` currently reports HTTP 200,
  `ready: true`, `connection: disabled`. This is a healthy, intentionally
  closed runtime, not proof of DGFY authentication or commerce connectivity.
- DGFY production has advanced through its normal release flow. Current heads
  are `main=bb54b0b616f8f91d758f1a03c59597d2a69f3711`,
  `staging=18f0ea6048ad195d50958e3e27c6261bbd8f5804`, and
  `develop=eb4a39fdec1156d6c1577b064ac13b51adad3d0a`. PR #1920 is present in
  the current `main` history and its deployment-health workflow passed.
- DGFY discovery responds, but
  `GET https://api.dgfy.ph/oidc/jwks` still returns HTTP 503
  `{"error":"oidc_keys_not_configured"}`. Until this is fixed, browser ID
  tokens and DGLaundry machine-client qualification cannot be validated.
- DGLaundry PR #20 is open at head
  `c1437215b0b791bee5bb36b17f0dc5c54cdac88e`. Its four required GitHub checks
  fail before runner startup with zero executed steps because of the
  organization Actions billing/spending restriction. This is not a source
  test failure and must not be bypassed.

### DGLaundry evidence already complete

On the clean PR #20 handoff branch, the DGLaundry team has passed typecheck,
architecture, connection-contract validation, 18 local contract vectors,
47/47 integration tests, 339 unit tests (21 intentionally skipped), build,
documentation, OpenAPI, container, and formatting checks. The acceptance
runner correctly blocks when QA origins, exact application SHAs, fixture,
configuration revision, branch-list hash, and secret-manager inputs are not
provided. The skipped tests are the real MySQL 8.4 qualification tests; local
MariaDB 10.4 is not accepted as equivalent evidence.

### Required DGFY and DevOps actions

1. **DGFY identity/platform owner:** install the OIDC signing key through the
   approved secret manager and make the public JWKS return HTTP 200. Register
   separate browser and machine clients; use the exact callback
   `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback`; enforce
   issuer/audience, PAR, PKCE S256, Redis-backed state/nonce, atomic one-time
   code consumption, logout, switching, and revocation. Configure the machine
   client with `private_key_jwt`, exact DGLaundry scope/audience, short-lived
   tokens, renewal, and revocation. Publish only key IDs/fingerprints and
   sanitized evidence.
2. **DGFY partner API/security owner:** verify the actual HTTPS proxy against
   the DGLaundry RFC 9421 profile: P-256 `ecdsa-p256-sha256`, fixed-width
   64-byte IEEE-P1363 `r || s`, split `Signature-Input`/`Signature` headers,
   target URI, covered headers, query strings, and empty bodies. Verify
   DGLaundry accepts Ed25519 events at
   `POST /api/v1/integrations/dgfy/events`. Prove tamper, unknown/rotated key,
   expiry, replay, wrong-company/location, idempotency, ordering, retry,
   reconciliation, and authorized dead-letter redrive behavior.
3. **DGFY storefront/orders/payments owner:** provide a reviewed synthetic
   fixture for every proposed branch, including immutable company/location
   mappings, branch handles, catalog/availability IDs, fixed/per-kilo variants,
   and the canonical frozen branch-list SHA-256. Keep staff operations on
   `laundry.surebizcorp.com` and customer tests on an explicit non-production
   DGFY QA storefront. Prove catalog, availability, quote, order, progress,
   notification, fulfillment, receipt, counter activity, privacy, and branch
   isolation. Use sandbox PayMongo only; fixed-price children may be charged,
   while per-kilo children remain reservation-only until local measurement.
4. **CI administrator/DevOps owner:** resolve the `Sieitzz` Actions
   billing/spending restriction or authorize the isolated `sieitz-runner` for
   DGLaundry. It must provide Linux/Docker/buildx, Node 24, MySQL 8.4,
   Playwright Chromium, clean workspaces, and no production credentials. After
   review, set `DGLAUNDRY_RUNNER_LABELS_JSON=["sieitz-runner"]`; registering a
   runner alone does not reroute existing jobs. Rerun PR #20 and require actual
   executed steps with terminal `COMPLETED/SUCCESS` results.
5. **Hosting owner:** maintain the protected qualification stack at
   `https://laundry.surebizcorp.com` with separate QA MySQL, storage, Redis,
   worker queues, secrets, identities, and network. Preserve the disabled
   release/data for rollback. Verify TLS, callback/event routing, private-port
   restrictions, clock synchronization, migration/runtime identities, the
   documented 10 GiB reserve, off-server backup/restore (RPO ≤5 minutes,
   RTO ≤4 hours), acknowledged Zabbix alerts, kill switches, and executable
   rollback commands.
6. **Joint test owners:** after the provider and host owners publish exact
   DGFY/DGLaundry SHAs, configuration revision, reviewed fixture, frozen
   branch-list hash, and ephemeral browser state, run the six PR #20 suites
   against the hosted Surebizcorp app and explicit DGFY QA origin. Execute all
   41 scenario IDs exactly once and attach sanitized reports.

No owner may claim the connection is live while JWKS is 503, PR #20 checks are
admission-failing, the QA fixture/configuration is absent, or hosted scenario
evidence is missing. Public admission and payments remain disabled.

## Target values and contract identifiers (ratification required)

| Surface | Required value | Authority/status |
| --- | --- | --- |
| Staff origin | `https://laundry.surebizcorp.com` | Fixed integration target |
| OIDC callback | `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback` | Fixed integration target |
| DGLaundry partner base | `https://laundry.surebizcorp.com` | Fixed integration target |
| Customer storefront pattern | `https://dgfy.ph/tenant-store/<approved-handle>` | Fixed integration target |
| DGLaundry partner health | `GET /api/v1/integrations/dgfy/health` | Fixed integration target |
| Contract versions | `external-runtime-v0.1`, `laundry-mode-v1` | DGLaundry emits `external-runtime-v0.1`; provider validation and issue #519 ratification remain pending. `laundry-mode-v1` remains proposed until the provider accepts it. |

The URL values are fixed integration targets. `external-runtime-v0.1` is the
currently emitted DGLaundry health contract version, but it is not evidence that
the provider has validated the connected runtime. `laundry-mode-v1` remains a
proposal. Do not treat this handoff or the fixture as runtime authority until
issue #519 is accepted and the provider implementation emits and validates the
ratified values.

Do not substitute `laundry.dgfy.ph`, an IP address, an HTTP URL, a trailing
slash, or `skupervisor.surebizcorp.com`.

## DGLaundry package to consume

DGLaundry’s connection implementation is already merged through its governed
`develop`/`master` path. The current consumer qualification and provider
handoff are tracked in DGLaundry [PR #20](https://github.com/Sieitzz/dglaundry/pull/20)
at head `c1437215b0b791bee5bb36b17f0dc5c54cdac88e`. The hosted application at
`https://laundry.surebizcorp.com` is healthy but remains `connection: disabled`;
immutable image publication and hosted qualification are pending the CI/QA
gates above. Do not reuse older PR #3 or `253cfcfa...` values as current
qualification evidence.

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
3. After recovery, backup, monitoring, and signed-transport gates pass, freeze
   and independently validate the complete approved-branch allowlist. Run the
   full sandbox customer journey for every listed branch. Obtain separate human
   authorization for one capped live payment and its refund/receipt
   reconciliation before enabling live online payments.
4. Enable **all approved branches together** through one release-controlled
   activation revision. Observe 24 hours for queue age, authorization failures, order divergence,
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
