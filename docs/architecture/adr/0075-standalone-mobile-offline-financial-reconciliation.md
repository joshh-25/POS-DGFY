---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-27
last_reviewed: 2026-08-27
review_by: 2027-02-27
applies_to: mobile_pos, pos, discounts, receipts, voids, cash_drawer, sync
topic: standalone_mobile_offline_financial_reconciliation
supersedes_in_part: docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md, docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md
---

# ADR 0075: Standalone Mobile Offline Financial Reconciliation

## Status

Accepted on 2026-08-27 for Phase 171. The user approved Phase 3 of the native
cashier rollout in this task; Phase 171 is the platform governance number for
the same cross-project implementation.

## Context

The native Expo POS must continue cashier operations when the API is unavailable.
The prior mobile path saved some writes locally, but online and offline history
used different read paths, non-cash sales could appear paid before provider/server
acknowledgement, voids had no durable offline representation, and receipts could
be reconstructed from mutable catalog data.

ADR 0033 requires an authorized employee PIN for every governed discount. A
native outage cannot verify a new PIN. Senior and PWD pricing, however, is based
on active server-owned statutory rules and must remain usable by a standalone
cashier device without allowing the client to invent a rate.

## Decision

1. **The encrypted local ledger is the native cashier read/write authority while
   disconnected.** `[binding]` A checkout, its line snapshots, stock movements,
   immutable receipt snapshot, and outbox mutation commit in one exclusive SQLite
   transaction. A partial sale is never visible.

2. **Settlement state is explicit.** `[binding]` Plain cash may be marked
   `paid_local`; non-cash and governed statutory sales are `pending_server` until
   server acknowledgement. The native UI and printed non-fiscal slip must label
   provisional settlement. Rejection becomes a visible sync conflict and never
   silently changes a transaction to paid.

3. **Offline Senior/PWD pricing uses only a signed, expiring server snapshot.**
   `[binding]` The device cannot edit its type, method, rate, VAT treatment,
   eligibility, expiry, version, or signature. Sync verifies the HMAC, expiry,
   and current server rule version before checkout is accepted.

4. **ADR 0033 Decision 7 has one narrow native-offline exception.** `[binding]`
   A Senior/PWD sale replayed with valid evidence from Decision 3 may be accepted
   without collecting a new online PIN. The persisted discount and audit record
   identify the signed mobile policy version rather than fabricating an employee
   approver. Customer name, statutory ID, item eligibility, rule-owned pricing,
   and server calculation remain mandatory. Employee, promo, voucher, manual,
   item-level, and legacy generic discounts retain the PIN/online requirements.

5. **Receipts are immutable sale-time snapshots.** `[binding]` Preview, initial
   print, and reprint use the saved transaction/line snapshot. Catalog changes do
   not rewrite historical item names, prices, discount evidence, or totals.

6. **Voids are append-only offline requests.** `[binding]` A local void records a
   unique request, reason, expected server status/version, reversal stock
   movements, and an outbox dependency. The original sale is retained as
   `void_pending`. The server applies the void idempotently or returns a visible
   status/version conflict; the client never silently overwrites server state.

7. **Server history reconciles through an ordered checkpoint.** `[binding]`
   `updated_at` plus transaction ID is the continuation key. A checkpoint page is
   merged atomically into the local ledger and its cursor advances in the same
   transaction. The History UI always reads the local ledger, including online.

8. **Shift totals expose provenance and freshness.** `[binding]` Server cash
   summary values may be retained alongside unsynced local sales/events, but a
   server refresh must not erase pending local contributions. The UI states
   whether totals are local-only, server-reconciled, or server plus local pending.

9. **A physical drawer-open command is local hardware behavior.** `[default]`
   It remains available offline and is separate from financial cash-in/cash-out
   ledger mutations. Authorization to adjust expected cash remains unchanged.

## Consequences

- Cashiers can sell, print, reprint, open the connected drawer, review history,
  and request voids during an outage without switching to a web/PWA bridge.
- Non-cash and statutory receipts cannot misrepresent server settlement.
- Sync retries are idempotent and dependency-ordered; conflicts require explicit
  operator resolution instead of last-write-wins.
- A compromised client cannot forge statutory evidence without the server secret,
  but device/session security and cashier authentication remain required.

## Non-Goals

- Offline employee credit, employee discount, promo, voucher, manual discount,
  refunds, payment-provider capture, or fiscal BIR finalization.
- Treating a provisional native slip as an official fiscal receipt.
- Replacing terminal pairing, cashier operator authority, or location scope.

## Validation Contract

1. Atomic rollback tests cover sale header, lines, movements, receipt, and outbox.
2. Cash and non-cash settlement tests prove correct local/provisional labels.
3. Signed-policy tests cover valid, expired, tampered, and stale-version evidence.
4. Void tests cover replay, dependency order, version conflict, and single stock reversal.
5. Checkpoint tests cover stable ordering, cursor persistence, duplicate merge, and
   offline restart from the last committed cursor.
6. Android staging UAT covers airplane-mode checkout, receipt/reprint, drawer,
   reconnect, conflict visibility, and shift-summary freshness before release.

## Approval Record

- Tech-lead approval: **accepted by the user in this task on 2026-08-27**.
- Platform implementation phase: Phase 171.

## References

- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md`
- `docs/architecture/adr/0043-standalone-native-hardware-pos-runtime.md`
- `docs/architecture/adr/0045-shared-pos-receipt-renderer.md`
- `docs/architecture/adr/0005-unified-sales-read-model.md`
