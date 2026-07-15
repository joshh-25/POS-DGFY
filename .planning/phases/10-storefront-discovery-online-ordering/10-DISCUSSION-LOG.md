# Phase 10: Storefront Discovery & Online Ordering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-13
**Phase:** 10-storefront-discovery-online-ordering
**Areas discussed:** Payment integration depth, Guest checkout identity, Stock reservation semantics, Scheduling & delivery/pickup rules

---

## Todo Fold-In (pre-discussion)

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as backlog (recommended) | Doesn't touch Storefront domain — unrelated to Phase 10 scope | |
| Fold into Phase 10 review | Pull it in anyway | ✓ |

**User's choice:** Fold into Phase 10 review.
**Notes:** The todo ("wrap compliance verification and state writes in one transaction") scored as a 0.9 keyword match but is actually Phase 8/9 compliance-state debt, not Storefront/Ordering scope. User chose to fold it in anyway rather than leave it as backlog. Recorded in CONTEXT.md's Folded Todos with a note flagging the mismatch for planner review.

---

## Payment Integration Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Record-only (recommended) | Same as Phase 9 POS: record method+amount, no live capture | |
| Real PayMongo QR Ph (port ADR 0027) | Landlord-owned sessions, dynamic QR Ph, webhook confirmation, split, manual-resolution | ✓ |
| Real PayMongo, but no split fee | Live QR Ph without the 1% split | |

**User's choice:** Real PayMongo QR Ph (port ADR 0027).
**Notes:** A materially larger scope commitment than Phase 9's approach. Legacy `backend/` already has a full live implementation (ADR 0027) as pattern reference, but it must be re-implemented as new code in `apps/dgfy-api` (zero `backend/` touch).

| Option | Description | Selected |
|--------|-------------|----------|
| No split for now (recommended) | Single DGFY account collects full amount; no per-tenant onboarding | ✓ |
| Full split settlement | Real per-tenant child-merchant + automatic 1% split | |

**User's choice:** No split for now, but adjustable in the future.
**Notes:** User explicitly asked whether this remains adjustable later. Answered inline: yes — split routing is provider-side config decided at PayMongo intent-creation time, not baked into the order/payment schema, so a future phase can add it without re-architecting Phase 10's tables. Captured as D-02 in CONTEXT.md.

| Option | Description | Selected |
|--------|-------------|----------|
| No — defer entirely (recommended) | Matches Phase 9's immutable-Availment/no-refund stance | ✓ |
| Yes — basic refund on cancel | Real PayMongo refund on order cancellation | |

**User's choice:** No — defer entirely.

---

## Guest Checkout Identity

| Option | Description | Selected |
|--------|-------------|----------|
| Phone only (recommended) | Phone required, primary contact channel, no verification | |
| Phone + email, both required | Both channels required, no verification | |
| Phone + OTP verification | Phone + OTP required | ✓ |

**User's choice:** Phone + OTP verification.
**Notes:** Follow-up surfaced that no SMS/phone-OTP provider exists in the codebase (only email OTP).

| Option | Description | Selected |
|--------|-------------|----------|
| Email OTP instead (recommended) | Reuse existing emailOtp.js, no new provider | ✓ |
| Add real SMS OTP | New SMS gateway integration (e.g. Semaphore) | |
| No verification after all | Drop OTP requirement entirely | |

**User's choice:** Let's go with Email OTP for now, but let's consider Mobile OTP in the future.
**Notes:** Mobile/SMS OTP captured as a Deferred Idea in CONTEXT.md.

| Option | Description | Selected |
|--------|-------------|----------|
| Anonymous per-order (recommended) | Contact fields on the order only, no reusable identity | |
| Lightweight guest identity | Persistent guest record keyed by verified email | ✓ |

**User's choice:** Lightweight guest identity.

---

## Stock Reservation Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Reserve at order placement (recommended) | Temporary stock hold created at order time | ✓ |
| Validate-only, no reservation | Check only, decrement at finalize | |

**User's choice:** Reserve at order placement.
**Notes:** This is the reservation-semantics decision ADR 0029 explicitly flagged as undefined and deferred.

| Option | Description | Selected |
|--------|-------------|----------|
| Match PayMongo QR Ph expiry (recommended) | One shared expiry clock | ✓ |
| Fixed short window (e.g. 10-15 min) | Independent DGFY-side timeout | |

**User's choice:** Match PayMongo QR Ph expiry (recommended).

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-release (recommended) | Stock automatically released on expiry | ✓ |
| Manual release only | Operator must review and release | |

**User's choice:** Auto-release (recommended).

| Option | Description | Selected |
|--------|-------------|----------|
| Fail fast, ask retry (recommended) | Reject order attempt before payment step | ✓ |
| Accept order, reserve best-effort | Accept regardless, retry reservation in background | |

**User's choice:** Fail fast, ask retry (recommended).

---

## Scheduling & Delivery/Pickup Rules

| Option | Description | Selected |
|--------|-------------|----------|
| Independent of Booking (recommended) | Simple requested_for timestamp, no capacity limit | ✓ |
| Reuse Booking capacity | Route through Phase 8's branch-capacity slot mechanism | |

**User's choice:** Independent of Booking (recommended).

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — business hours + min lead time (recommended) | Reject outside-hours/too-soon scheduling | ✓ |
| No constraints for now | Accept any future timestamp | |

**User's choice:** Yes — business hours + min lead time (recommended).

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — cap it (recommended) | Limit to a near-term scheduling window | ✓ |
| No cap | Allow arbitrarily far-in-advance scheduling | |

**User's choice:** Yes — cap it (recommended).

---

## Claude's Discretion

- Exact lead-time minimum and max-advance-scheduling cap values.
- Exact PayMongo QR Ph session table shape, webhook handler design, and idempotency mechanism for order→Availment finalization.
- Whether the manual-resolution state (STF-05) needs an operator-facing resolution API in Phase 10, or just the data model/state.
- Exact discovery/search mechanics (proximity radius, category filters, "open now" filtering, full-text matching).
- Reservation table/mechanism shape (new table vs. status-flag pattern).

## Deferred Ideas

- Mobile/SMS OTP verification for guest checkout — no SMS provider exists yet.
- 1% DGFY platform-fee split settlement (ADR 0027's full pattern) — deferred but must stay adjustable.
- Refunds/reversals on storefront payments — deferred entirely.
- Booking-style branch-capacity for scheduled orders — deferred; revisit if kitchen/delivery-fleet capacity becomes a real problem.
