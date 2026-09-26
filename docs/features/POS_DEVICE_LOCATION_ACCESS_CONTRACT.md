---
status: authoritative
authority_level: authoritative
owner: architecture
date: 2026-09-14
last_reviewed: 2026-09-14
review_by: 2027-03-14
applies_to: pos, android_bridge, hardware_bridge, tenant_security
topic: pos_device_location_access_contract
---

# POS Device and Location Access Contract

This contract defines the approved design for optional merchant-controlled POS
device restriction. It is the policy output of Phase 345. Runtime work is
deferred to Phases 346-350.

## Decision

1. **Area means merchant branch/location.** The authoritative scope is the
   terminal registry `location_id` plus the operator's tenant location grant.
   GPS, Wi-Fi, IP address, and a claimed client fingerprint are telemetry or
   supporting signals only; none is the sole proof of physical presence.
2. **Enforcement is opt-in and tenant-controlled.** The default remains the
   current logical terminal, membership, permission, location-grant, operator,
   and shift checks. A tenant may enable strict device enforcement only after
   an approved device-proof client is enrolled for the terminal.
3. **A strict terminal has one active enrolled device.** One device key may be
   bound to one terminal at a time. Replacing it revokes the previous device
   before the replacement is accepted. A device cannot silently move between
   tenants, terminals, or locations.
4. **Device proof is an additional factor.** It never replaces DGFY or staff
   credentials, accepted membership, tenant authorization, POS permissions,
   location grants, operator sessions, open-shift rules, CSRF, or audit checks.
5. **The initial strict-client set is narrow.** The signed iMin Android wrapper
   is supported after Phase 347. The future standalone native Android POS may
   adopt the same contract. Browser POS and Electron are policy-off clients
   until they implement an OS-backed signing provider. The LAN device bridge
   is a hardware transport, not a cashier identity.
6. **No strict offline login exists.** An already authenticated device may use
   only the existing scoped offline catalog/order capabilities while its
   online device lease is valid. A new device, new login, or expired lease
   requires online proof. Offline actions keep the existing idempotency,
   version-conflict, outbox, and reconnect rules.

## Client capability matrix

| Client | Strict device enforcement | Proof | Phase 345 decision |
| --- | --- | --- | --- |
| iMin Android WebView wrapper | Yes, after upgrade | Android Keystore key signs server challenges | Implement in 347 |
| Standalone native Android POS | Yes, when same contract is adopted | Native secure key provider | Contract-compatible future client |
| Browser POS | No initially | Existing HttpOnly pairing is not hardware proof | Keep policy off |
| Electron POS | No initially | Requires OS key-store provider | Keep policy off |
| LAN device bridge | Not a login client | Bridge command credential/ticket | Secure separately in 349 |

Strict mode must show an actionable unsupported-client state. It must not
silently downgrade to policy-off access.

## Lifecycle and security values

| Artifact | Contract |
| --- | --- |
| Admin activation code/QR | One-use, server-hashed, 10-minute lifetime; bound to tenant, terminal, and location |
| Device challenge | Server nonce, one-use, 60-second lifetime; bound to purpose, tenant, device, terminal, location, and session |
| Device enrollment | Active until revoked, replaced, terminal/location binding changes, or tenant is disabled |
| POS session | Existing 24-hour standard or 30-day remembered lifetime under ADR 0026; every refresh requires fresh device proof in strict mode |
| Strict request proof | One-use signature/ticket for every terminal-bound protected session, shift, checkout, payment, drawer, print, void/refund, delivery, and sync mutation; 60-second expiry |
| Offline device lease | 24 hours from the last successful online proof; no new login or enrollment offline |

Private keys never leave the approved client secure key store. Activation
secrets, private keys, raw passwords, and bearer tokens are never logged,
returned in settings payloads, or placed in browser storage or URLs.

## Required authorization flow

1. An authorized master admin enables strict enforcement for a registered
   terminal and creates an activation code/QR.
2. The approved client authenticates the operator, requests activation, and
   submits its public key plus the one-use activation proof.
3. The backend atomically creates the enrollment and writes the audit event.
4. At sign-in, the backend issues a one-use challenge. The client signs the
   canonical challenge with its device key.
5. The backend verifies the signature, enrollment status, tenant, terminal,
   location, session purpose, and expiry before creating or refreshing POS
   authority.
6. Every protected request repeats the same binding check with a one-use
   request proof. A copied browser cookie or terminal ID alone is insufficient.
7. A mismatch fails closed with a stable reason code and a recovery action;
   it never opens a shift, posts a sale, pulses a drawer, or dispatches print.
   POS device-policy administration (list, revoke, replace, and disable) is a
   separate privileged admin surface; it requires admin step-up, reason, and
   audit but does not require the device being recovered.

## Area and recovery policy

- The terminal home location and cashier grant are the access boundary. A
  strict terminal cannot switch to another branch while strict enforcement is
  enabled. The `SWITCH_LOCATION_POS` permission does not override the device's
  terminal/location binding; another branch uses its own enrolled terminal.
- GPS/network evidence is not enabled by this contract. If a future product
  requires a geofence, it must define permission denial, stale readings,
  accuracy thresholds, spoofing/VPN limits, server-side validation, and a
  manager recovery path in a separate approved phase.
- Revoke, replace, and strict-mode changes require an authenticated authorized
  administrator, a reason, and an immutable audit record.
- Recovery re-enrolls a device or deliberately disables strict mode through a
  privileged audited action. It never impersonates a cashier, transfers an
  open shift, or bypasses operator/session controls.
- A revoked device is denied on the next online request. Disconnected devices
  retain only the bounded offline lease and are reconciled when they reconnect.

## Protected-operation inventory

The strict-device gate must cover these existing POS entry points and route
families; Phase 346 must turn this inventory into route/use-case tests:

- **Identity and session:** DGFY login, company selection, POS session,
  `/api/v1/pos/auth/cashier-login`, tenant-session refresh, logout, and native
  mobile bootstrap/sync authentication.
- **Terminal and operator:** `/terminal/pair`, paired-terminal reads/clear,
  operator resume/takeover/return/handoff/end, attendance mutations, and
  terminal location switching.
- **Shift and money:** shift open/current/history/close/force-close, cash
  events, merchant-tender reconciliation, checkout, parked-sale mutations,
  payment-session creation/allocations/confirmation/cancellation, and balance
  collection/refunds.
- **Operational data:** `/catalog`, `/catalog/events`, `/scan`, catalog
  overrides/imports/images, `/transactions`, parked sales, payment sessions,
  `/incoming-orders`, `/order-history`, delivery personnel/runs, location
  monitor, employees/employee credit, discounts, and order status/address/
  delivery assignment/cash/proof routes. Read operations still require
  tenant/session/location scope. Sales, tender, drawer and other operational
  mutations additionally require their existing operator/shift authority and
  request proof. Catalog/configuration administration remains separately
  permission-gated and does not acquire a blanket open-shift requirement; strict
  device proof still applies when using a protected POS route. See the Phase 354
  amendment below for the administrative boundary.
- **Policy administration:** POS terminal registry, strict-device policy,
  enrollment, revoke, replace, and recovery settings. These actions require a
  privileged administrator, step-up, reason, and audit; they are the explicit
  recovery exception to the terminal request-proof gate.
- **Reporting and fiscal:** terminal dashboard, reports/exports, fiscal
  terminal registrations, eSales, fiscal-ledger integrity, X-reading, and
  Z-reading readiness/close/reset/daily/print routes.
- **Hardware and audit:** receipt/summary/Z-reading print, drawer open and
  authorization, fiscal print events, and transaction void/refund operations.

The bridge's own HTTP API is separately authenticated in Phase 349. A bridge
API key authenticates the bridge service; it does not identify the cashier's
browser or permit a cross-terminal command.

## Data and API contract for later phases

Phase 346 must add an additive tenant-scoped enrollment model with at least:
`device_id`, `public_key`, `key_algorithm`, `terminal_id`, `location_id`,
`status`, `enrolled_at`, `last_seen_at`, `revoked_at`, `replaced_by`, and
`client_type`. Activation/challenge records must hold only hashes or nonces,
expiry, purpose, binding, consumed state, and audit references. Unique
constraints must enforce one active device per strict terminal and one active
terminal binding per device.

The API contract must provide authorized issue, activate, list, revoke, replace,
challenge, and proof-verification operations. Controllers stay transport-only;
business checks belong in POS use cases and persistence in repositories. All
requests must derive tenant and terminal scope server-side and reject client
claims that disagree with the authenticated session.

## Acceptance and test matrix

Phase 345 is complete only when the following decisions are recorded and
referenced by implementation tests:

| Area | Required proof |
| --- | --- |
| Policy | Default policy-off compatibility; strict mode is explicit and unsupported clients fail closed |
| Tenant isolation | Device, key, terminal, and location cannot cross tenants |
| Enrollment | One-use/expiry, duplicate activation, replacement, revocation, concurrent activation |
| Authentication | Wrong key, wrong terminal/location, expired/replayed challenge, copied cookie, logout/refresh |
| Authorization | Membership, role, permission, grant, operator, shift, and direct API bypass checks |
| Offline | No offline login; lease expiry; existing idempotency/version-conflict/reconnect behavior |
| Recovery | Admin step-up, reason/audit, re-enrollment, strict-mode disable, open-shift protection |
| Clients | iMin proof interoperability; browser/Electron policy-off behavior; bridge separation |
| Area | Branch/location binding succeeds; no GPS/network enforcement is implied |
| Hardware | Device access does not make sales depend on printer/drawer availability; bridge commands remain separately authorized |

## Phase boundaries and rollout

- Phase 345 records this contract and ADR amendments only. It adds no runtime
  enforcement, migration, activation endpoint, or APK behavior.
- Phase 346 implements durable enrollment and backend gates.
- Phase 347 implements iMin secure-key proof. Android Keystore keys are
  non-exportable; hardware-backed attestation is reported only when the target
  model supports and verifies it.
- Phase 348 implements POS administration and user-facing states.
- Phase 349 secures LAN bridge commands.
- Phase 350 runs full regression, physical UAT, and controlled rollout.

Roll out additively with strict mode disabled, then deploy compatible API and
clients, test in staging, pilot one terminal, and enable per terminal. Recovery
must be documented before enabling the first production terminal.

## Authority and ADR impact

### Phase 354 amendment (2026-09-14)

The approved [cashier/location contract](POS_CASHIER_LOCATION_ACCESS_PHASE_354.md)
adds a separate implementation sequence (355-357) for consistent per-user
operator exclusivity and configurable cashier item editing. It does not redo
Phases 346-350 or make device enrollment a substitute for user authorization.
User exclusivity is tenant-scoped and must cover mixed attendance-lifecycle
settings. Multiple different employees may work at the same location. This is
not a global one-browser-login rule or a GPS/geofence rule.

Administrative catalog/settings actions retain their owning domain's explicit
permissions and scope. They must not be blocked solely because that user has
an active register elsewhere; nor does a location grant alone authorize editing
shared catalog fields. The amendment clarifies the operational-data inventory
above without removing strict-device checks from protected POS routes.

### Existing device-policy authority

This contract follows [`START_HERE`](../START_HERE.md),
[`ARCHITECTURE_BOUNDARIES`](../architecture/ARCHITECTURE_BOUNDARIES.md), and
[`ARCHITECTURE_GOVERNANCE`](../architecture/ARCHITECTURE_GOVERNANCE.md). It amends the default posture
in ADR 0031 and ADR 0044: existing logical terminal and cashier controls remain
the default, while an explicit strict-device tenant policy may add a device
proof gate after the later phases implement it. ADR 0028's any-device behavior
remains the default when strict mode is disabled. ADR 0053's rule that missing
hardware must not block selling is unchanged.
