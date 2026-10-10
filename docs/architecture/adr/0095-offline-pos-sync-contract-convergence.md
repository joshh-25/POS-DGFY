---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-10-10
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: apps/dgfy-pos,packages/web-core,apps/dgfy-api,mobile-pos-sync
topic: pos_offline_sync_contract
related_adr: docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md, docs/architecture/adr/0043-standalone-native-hardware-pos-runtime.md, docs/architecture/adr/0075-standalone-mobile-offline-financial-reconciliation.md, docs/architecture/adr/0076-standalone-mobile-offline-order-actions.md
---

# ADR 0095: Offline POS Sync Contract Convergence

## Status

Proposed. Tech-lead approval is required before acceptance because the recommended dispositions
extend or scope existing `[binding]` clauses in ADR 0075 and ADR 0076 to the web POS. Until
accepted, this ADR does not constrain implementation. The web migration remains a separately
scoped implementation phase.

## Context

The web POS and native POS have separate offline queues and clients. The backend already owns a
shared mobile POS sync API, Joi validation, and `PosOperationReplay` ledger. Issue #1484 records the
product decision that web adopts that endpoint contract and the three-channel model rather than
reversing the native contract. ADR 0075 and ADR 0076 currently govern native offline behavior only;
extending their binding clauses directly would require tech-lead approval under ADR 0039.

The authoritative operation consistency model also classifies shift open/close and parked-sale
claims as CP while disconnected. Existing web queue behavior and native route support do not change
that classification. Catalog authoring is owned by OPIS under ADR 0087 and AGENTS.md.

The detailed endpoint mapping, client capability matrix, and migration constraints live in
[`docs/features/POS_OFFLINE_SYNC_CONTRACT.md`](../../features/POS_OFFLINE_SYNC_CONTRACT.md).

## Decision

1. **The platform owns the shared server contract.** The `dgfy-platform` Joi validators, use cases,
   and replay ledger are authoritative for endpoint and replay behavior. The mobile
   `SYNC-ARCHITECTURE.md` remains authoritative for native local storage and SyncEngine behavior.
   REST+JSON wire-format redesign remains out of scope under #470. `[default]`
2. **Web adopts the three-channel model and existing sync routes.** Channel A is the durable ledger,
   Channel B is server-owned reference data, and Channel C is online order discovery whose
   mutations use Channel A. Each client has an explicit capability policy; endpoint acceptance
   alone does not authorize a client to queue an operation. `[default]`
3. **`PosOperationReplay` is the shared dedupe ledger for adopted `/sync/*` effects.** Web checkout
   replay preserves its original `idempotency_key`; `PosTransaction.idempotency_key` and
   `request_hash` remain a secondary checkout-row guard. The ordinary online checkout route
   remains available. Cutover must keep old queue rows on the old route until replayed or explicitly
   resolved, reconcile uncertain outcomes before migration, and never dual-submit a row. `[binding]`
4. **The operation consistency model controls client capability.** Web shift open/close,
   parked-sale claims, and order actions remain online-only in this version. `item_create` is out of
   the POS contract because catalog authoring belongs to OPIS. Existing queue/replay discrepancies
   are implementation drift to be shaped as follow-up work; this ADR does not reclassify them as
   AP. `[binding]`
5. **Channel B consumes one cursor contract.** Until #468 ships, bootstrap remains snapshot-only
   and a failed pull cannot replace the last valid snapshot. Web later adopts #468's cursor, version,
   and tombstone semantics without a separate web cursor. `[default]`
6. **Device identity remains server-validated.** The sync API requires a validated `device_id` and
   uses tenant/device accounting. A logical web terminal ID is not sufficient proof and must not
   be self-asserted as the sync device identity; web adoption depends on #800's identity contract.
   `[binding]`
7. **One leased drain is one successful round.** Reuse stable `client_sync_run_id` across endpoint
   calls in a drain; empty and failed attempts do not count. Existing two-per-day baseline and
   premium bypass follow ADR 0043. Planned 2/5/10 entitlement semantics are shared, while funding
   and administration remain #2379/#803; #999 owns web limiter reconciliation. `[default]`

### Proposed web dispositions for ADR 0075

These are recommendations pending approval. `Extend` means the same invariant applies to web when
the corresponding capability is implemented; it does not claim that the web runtime already meets
the native storage mechanism.

| ADR 0075 clause | Proposed web disposition | Boundary |
| --- | --- | --- |
| Decision 1 — atomic encrypted local ledger | **Extend the atomic sale/queue invariant**; native SQLite/SQLCipher encryption remains native-only. Web must use an equivalent durable IndexedDB transaction and retain server authority. | Web storage does not inherit the native encryption claim. |
| Decision 2 — explicit settlement state | **Extend**; web cash stays provisional until server replay acknowledges it, with explicit pending state. | No client claim becomes persisted settlement truth. |
| Decision 3 — signed Senior/PWD pricing snapshot | **Defer**; web governed discounts remain online-only. | Reopen only with a separately scoped signed-snapshot capability; #957 cash-only scope is unchanged. |
| Decision 4 — PIN exception for signed Senior/PWD evidence | **Defer with Decision 3**. | No offline PIN exception is created for web. |
| Decision 5 — immutable sale-time receipt snapshot | **Extend** to web receipt preview, initial print, and reprint. | Preserve ADR 0045's renderer and current fiscal-finalization gate. |
| Decision 6 — append-only offline void request | **Defer**; web void remains online-only. | Extend only with a durable local request and server conflict contract. |
| Decision 7 — ordered server-history checkpoint | **Extend**; web consumes the same ordered `updated_at` + transaction-ID cursor from #468. | No independent web cursor or cursor advancement before atomic merge. |
| Decision 8 — shift totals provenance/freshness | **Extend** to any web display that combines server totals and pending local work. | Preserve local pending contributions and label freshness. |
| Decision 9 — physical drawer command | **Native-only**. | Local hardware command does not become web ledger authority. |
| Refund amendment 1 — append-only local refund intent | **Defer**; web refunds remain online-only. | No local refund projection is authorized. |
| Refund amendment 2 — server execution authority | **Defer with offline refund capability**. | Existing online refund authority is unchanged. |
| Refund amendment 3 — replay/concurrency fail-closed | **Defer with offline refund capability**. | Any later extension must use stable keys and durable conflicts. |
| Refund amendment 4 — provisional offline cash projection | **Defer with offline refund capability**. | No web cash projection for an offline refund. |
| Refund amendment 5 — local pending is not final success | **Defer with offline refund capability**. | No web offline refund state is added. |

### Proposed web dispositions for ADR 0076

Each clause remains native-only today and applies to web only if a future slice adds durable
cached-order action requests and reconciliation. Web order actions remain online-only under this
proposal.

| ADR 0076 clause | Proposed web disposition | Boundary |
| --- | --- | --- |
| Decision 1 — actions only on previously cached server orders | **Defer/prospective**. | If extended, web cannot discover or create an order offline. |
| Decision 2 — append-only atomic local action | **Defer/prospective**. | Require one durable local projection, request, and outbox write. |
| Decision 3 — conditional replay against observed version | **Defer/prospective**. | Require expected fulfillment/payment state and server version. |
| Decision 4 — cash intent is not settlement | **Defer/prospective**. | Pending cash cannot mark an order paid before acknowledgement. |
| Decision 5 — server authority and durable rejection | **Defer/prospective**. | Require authoritative response, durable conflict, and retained cached order. |

## Consequences

- Web and native clients share endpoint, validation, replay dedupe, and accounting vocabulary while
  retaining client-specific local storage and capability rules.
- Existing web shift-close and item-create queue paths need separately shaped drift/migration work;
  this decision does not make those operations safe offline or place authoring in POS.
- The web reference store waits for #468's cursor contract, and web sync identity depends on #800.
- The proposal has no binding effect until tech-lead approval. A runtime implementation cannot cite
  these proposed web dispositions as accepted requirements.

## Approval Record

- Tech-lead approval: **pending**.
- Required approver: Pat / platform tech lead.
- Scope requiring approval: the proposed web dispositions for ADR 0075 and ADR 0076 binding clauses.

## References

- Issue #1484 — web/mobile POS offline-sync convergence.
- ADR 0039 — lifecycle, strictness tiers, and approval path.
- ADR 0014, ADR 0043, ADR 0075, and ADR 0076.
- `docs/features/POS_OFFLINE_SYNC_CONTRACT.md` — detailed platform contract.
- `docs/features/POS_MULTI_TERMINAL_CONSISTENCY_MODEL.md` — authoritative CP/AP rules.
- `dgfy-mobile/docs/architecture/SYNC-ARCHITECTURE.md` — native client architecture.
