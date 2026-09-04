---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-28
last_reviewed: 2026-08-28
review_by: 2027-02-28
applies_to: mobile_pos,pos,orders,payments,sync
topic: standalone_mobile_offline_order_actions
supersedes_in_part: docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md, docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md
---

# ADR 0076: Standalone Mobile Offline Order Actions

## Status

Accepted on 2026-08-28 for Phase 180. The user explicitly approved Phase 4 of
the native cashier rollout in this task.

## Context

The native cashier can lose connectivity after it has already downloaded an
online order. Existing status replay lacked a compare-and-set contract, cash
collection was online-only, and a terminal status could remove the cached order
before the server acknowledged it. That creates duplicate-tender and silent-loss
risks when another terminal changes the same server order.

## Decision

1. **Offline actions apply only to previously cached server orders.** `[binding]`
   The device cannot discover or create a server-originated online order while
   disconnected.

2. **Every order action is append-only and atomic locally.** `[binding]` The
   local projection, `order_action_request`, and outbox mutation commit together.

3. **Replay is conditional.** `[binding]` Status and cash actions carry the last
   observed fulfillment status, payment status, and `updated_at` server version.
   The existing locked order mutation rejects any mismatch with
   `MOBILE_ORDER_VERSION_CONFLICT`.

4. **Cash intent is not settlement.** `[binding]` Offline cash collection records
   tendered cash but leaves the local order unpaid until the server accepts the
   operation under an open shift and registered terminal.

5. **The server remains authoritative.** `[binding]` Accepted responses replace
   the provisional projection with the authoritative order. Permanent rejection
   creates durable conflict and dead-letter evidence; it never deletes the
   cached order or retries forever.

6. **Only one unresolved action per order is allowed.** `[default]` The cashier
   must wait for acknowledgement or resolve a conflict before issuing another
   state/payment action. This avoids speculative dependency chains with unknown
   intermediate server versions.

## Consequences

- Cashiers can continue fulfillment and record pickup cash during a network drop.
- Duplicate idempotency keys replay deterministically through existing POS
  operation-replay storage.
- A terminal completion disappears from the active local queue only after ack.
- Concurrent web/native edits surface as reviewable conflicts instead of
  last-write-wins state.

## Non-Goals

- Discovering new online orders while disconnected.
- Offline delivery settlement, balance settlement, refunds, or provider capture.
- Automatic resolution of a server conflict.

## Validation Contract

1. Mobile migration and local-source tests prove atomic staging and retention.
2. Transport/use-case tests prove the versioned order-action envelope.
3. POS lifecycle tests prove stale cash and status actions do not mutate orders.
4. Reconciliation tests prove acknowledgement, durable conflict, and dead letter.
5. Android staging UAT covers airplane-mode action, reconnect, and conflict UI.

## Approval Record

- Tech-lead approval: confirmed by @patterueldev on
  [dgfy-platform PR #1134](https://github.com/Sieitzz/dgfy-platform/pull/1134#issuecomment-5454776667)
  (2026-08-29).
- Platform implementation phase: Phase 180.

## References

- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- `docs/architecture/adr/0075-standalone-mobile-offline-financial-reconciliation.md`
- `docs/compliance/impact-declarations/2026-08-28-mobile-offline-order-actions.md`
- [dgfy-mobile PR #19](https://github.com/Sieitzz/dgfy-mobile/pull/19) at merge
  commit `0f44d42e5755fdb352cff708cfd0aad956512f27` — existing native online-order
  queue baseline only; it does not implement the Phase 180 offline action client.
- Phase 180 client follow-up: no versioned dgfy-mobile PR/commit exists yet;
  platform evidence must not be presented as native-client evidence.
