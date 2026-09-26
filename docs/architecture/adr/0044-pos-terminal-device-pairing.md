---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-06-28
last_reviewed: 2026-09-14
review_by: 2027-03-14
applies_to: architecture_decision
topic: pos_terminal_device_pairing
---

# ADR 0044: POS Terminal Device Pairing

## Context

The web POS previously required repeated terminal-password entry after cashier authentication. Cashier identity, store grants, terminal registry identity, and shift opening remain separate controls, but the device credential requirement slowed normal counter handoff and encouraged unsafe password sharing.

## Decision

A browser POS may be paired to one registered terminal after an authenticated operator selects an active registered terminal. Pairing authority is a signed, 30-day, HttpOnly, SameSite cookie. JavaScript must never read or persist the pairing token.

The pairing is bound to tenant id, terminal id, assigned location id, and a fingerprint derived from the current assigned location. The backend must revalidate all bindings against the active terminal registry after every cashier login. Changing the terminal assignment, active state, location binding, or tenant invalidates the pairing without a database migration or revocation table.

A valid pairing does not authenticate a cashier and does not open a shift. The cashier must still authenticate, hold POS permission, and have an active location grant for the paired terminal's store. Only then may POS skip repeated terminal verification and show Opening Cash directly. Shift opening remains backend-authoritative and continues to enforce cashier location grants and terminal home-location policy.

An authenticated DGFY tenant master-admin or tenant user with the `admin` role may enter an in-memory administrator navigation mode without terminal pairing or Opening Cash. This bypass exists for configuration, reporting, item, and oversight navigation; it does not create a cashier shift and must not authorize checkout or cash-drawer mutations that require an active shift. The bypass is established only by the DGFY company-session flow and is cleared by terminal lock or browser refresh.

Missing, expired, tampered, or invalidated pairing fails closed to the existing one-time Terminal Unlock flow. Relocking an already open shift continues to require terminal selection plus cashier credentials. Pairing is reusable by design as a device credential; it is not a single-use business-action token.

## Consequences

- First use on a browser still requires Terminal ID selection.
- Later cashier logins on that paired browser go directly to Opening Cash when all backend checks pass.
- Pairing tokens are never stored in browser-readable storage.
- IMS authentication and UI behavior are unchanged.
- Regular POS Settings > POS Setup manages cashiers inside each terminal card when the current administrator has `users:manage`. Cashier listing and creation use protected POS endpoints, and each new cashier inherits the terminal's active store assignment. Multiple cashiers may share that store-bound terminal workflow without introducing a direct terminal-user table.
- No tenant schema migration is required.

## Validation

- Pairing token signature, tamper, and binding-change tests.
- HttpOnly/SameSite cookie transport test.
- Cashier location-grant allow and denial tests.
- POS frontend contract test for Opening Cash and secure fallback.
- Browser privileged-token storage guard.
- `npm run check:architecture`.

## Amendments

### 2026-08-24: Pairing Is Not Cashier Takeover Authentication (Phase 156)

- Pairing remains a device-binding signal only. It never authenticates a
  relief cashier, starts attendance, starts a break, opens a register shift, or
  authorizes a drawer mutation.
- A current operator session may be established only
  after the cashier's tenant identity, location grant, terminal scope, and
  dedicated cashier-authentication step have all passed server-side. Pairing
  may reduce repeated device verification but cannot replace that step.
- Missing, expired, or invalid pairing continues to fail closed to the existing
  authenticated terminal-unlock flow. No browser-readable operator token is
  introduced by this amendment.
- The current pairing and shift-opening behavior remains unchanged until a later
  implementation phase activates the approved operator-session contract. This is
  a governance amendment only; it does not authorize migration or runtime work.
- See `docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md`.

### 2026-09-14: Strict Device Enrollment Contract (Phase 345)

- The browser pairing cookie remains a logical terminal compatibility signal. It
  is not proof of unique physical hardware and does not satisfy strict device
  enforcement by itself.
- A tenant may explicitly require an enrolled device for a registered terminal.
  The enrolled device must prove possession of a secure signing key bound to
  the tenant, terminal, and location. The device proof is an additional factor
  after cashier identity and membership resolution; it never authenticates a
  cashier or opens a shift on its own.
- One active device is allowed per strict terminal. Re-enrollment replaces and
  revokes the previous device atomically. A missing, expired, replayed, or
  revoked proof fails closed with an audited administrator recovery path.
- Strict enforcement binds the terminal to its registered home location; a
  location-switch permission cannot override that binding. Authorized device
  policy administration may use a separate admin step-up surface so a lost
  device can be revoked or replaced without requiring the lost device.
- The existing default browser behavior and no-migration pairing contract stay
  unchanged while strict mode is disabled. This Phase 345 amendment records
  policy only; Phases 346-350 implement enrollment, iMin proof, UI, bridge
  command authorization, and rollout validation.
