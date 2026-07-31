---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-06-28
last_reviewed: 2026-06-28
review_by: 2026-12-28
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
