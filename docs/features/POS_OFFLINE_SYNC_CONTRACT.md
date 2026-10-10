---
status: authoritative
authority_level: authoritative
owner: pos
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: apps/dgfy-pos,packages/web-core,apps/dgfy-api,mobile-pos-sync
topic: pos_offline_sync_contract
---

# POS Offline Sync Contract

## Purpose and authority

This document defines the shared platform contract for the web POS adopting the backend's
`/api/v1/mobile-pos/sync/*` and `/api/v1/mobile-pos/bootstrap/*` surfaces. The product decision is
that web converges on the native client's endpoint contract and three-channel model; it does not
reverse the native design. The byte-level wire format remains REST+JSON and is outside this
decision's scope (#470).

`dgfy-platform` is authoritative for endpoint paths, validation, replay behavior, server-side
idempotency, and round accounting because it owns the Joi validators, use cases, and
`PosOperationReplay` ledger. The native client behavior—SQLite outbox transactions, SQLCipher,
local projection, and SyncEngine—is governed by
[`dgfy-mobile/docs/architecture/SYNC-ARCHITECTURE.md`](https://github.com/Sieitzz/dgfy-mobile/blob/develop/docs/architecture/SYNC-ARCHITECTURE.md).
That document describes the native client; this platform contract does not copy or replace it.

The contract records the target and current capabilities. Runtime migration is separately scoped;
this document does not authorize an API, schema, or client change. ADR 0095 is proposed and has no
constraint effect until tech-lead approval under ADR 0039.

## Three independent channels

The channels have different data authority, cadence, and tier semantics. They must not be combined
into one cadence or one retry path.

| Channel | Data and direction | Offline role | Cadence and accounting |
| --- | --- | --- | --- |
| **A — Ledger** | Durable POS operations and acknowledgements; client to server and reconciliation back | Offline-critical only where the operation has a durable local record, server-issued authority, and idempotent replay contract | One leased drain is one round. Free baseline: at most two successful rounds per local day/device; premium bypass follows ADR 0043. Empty and failed attempts do not count. |
| **B — Reference** | Catalog, settings, and device policy; server to client | Cached reference data may support bounded offline work but is never a write authority | Opportunistic while online, independent of Channel A's cap. Bootstrap is snapshot-only today; cursor/tombstone behavior follows #468 when delivered. |
| **C — Live Orders** | Discovery of server-originated orders; server to client | Discovery requires connectivity. Actions may be staged only for already cached orders when a client implements the approved offline action capability | Poll while online. Any staged action replays through Channel A; it gets no separate retry, dedupe, or round-accounting path. |

The 2/5/10 tier vocabulary describes planned entitlement semantics owned by #1484. Funding,
administration, and entitlement decisions remain with #2379/#803. This contract creates no counter
and does not claim that planned 5/10 tiers are shipped. Current server accounting remains per
tenant+device with a stable `client_sync_run_id` reused within the bounded window described by ADR
0043. `/sync/items` currently sits outside the round limiter; #999 owns that reconciliation.

## Platform envelope and replay ownership

The platform sync routes accept a request-level `device_id`, optional `client_sync_run_id`, and
batched `entries[]`. Transaction-like entries carry `local_transaction_id` and `payload`; shift and
order-action entries additionally carry an `operation_type`. Exact validation and response fields
are defined by `apps/dgfy-api/src/validators/posValidator.js` and the corresponding mobile POS use
cases. `/sync/checkouts`, `/sync/voids`, `/sync/refunds`, `/sync/order-actions`, `/sync/items`,
`/sync/shifts`, `/sync/hardware-events`, and `/sync/checkpoint` are current server surfaces.

For adopted `/sync/*` writes, `PosOperationReplay` is the shared effect-deduplication ledger,
keyed by operation and idempotency key. Checkout rows also retain their existing
`PosTransaction.idempotency_key` and `request_hash` uniqueness guard. The ordinary online
`POST /pos/checkouts` path remains supported. Web migration must preserve each queued checkout's
original idempotency key exactly and must not retry an uncertain legacy request through both paths.

The compatibility window starts at web cutover and lasts until all pre-cutover queue entries have
been replayed or explicitly resolved. Legacy rows continue through their legacy route during that
window. A row with an uncertain legacy outcome must be reconciled by its existing idempotency key
before it is sent to the new route. New rows use the sync envelope only after that route is enabled
for the client. This avoids dual-posting and does not require a time-based window that could expire
while a terminal remains offline.

## Web operation mapping and capability policy

An endpoint accepting an operation does not make that operation safe for every client to queue.
Capability requires the local transaction, authority, and replay behavior to satisfy the
authoritative per-operation consistency model in
[`POS_MULTI_TERMINAL_CONSISTENCY_MODEL.md`](POS_MULTI_TERMINAL_CONSISTENCY_MODEL.md).

| Existing web operation | Target or disposition | Web policy |
| --- | --- | --- |
| `checkout` | `POST /sync/checkouts`; map `intent_id` to `local_transaction_id` and preserve the payload's `idempotency_key` | Adopt after cutover compatibility and dedupe checks above. Online checkout remains on `/pos/checkouts`. |
| `cash_event` | `POST /sync/shifts`, `operation_type: cash_event` | The client may replay only against a server-confirmed open shift; server authorization and shift identity remain required. |
| `shift_close` | `/sync/shifts`, `operation_type: shift_close` exists | Capability remains online-only. Web currently queues/replays it, which conflicts with the authoritative CP rule; treat that path as implementation drift for PM follow-up. A route envelope is not permission to close offline. |
| `shift_open` | `/sync/shifts`, `operation_type: shift_open` exists | Online-only. The current web replay rejects it with `POS_SHIFT_OPEN_ONLINE_REQUIRED`; a live server decision is required. |
| `switch_location` | `/sync/shifts`, `operation_type: switch_location` exists | Online-only for web. Location and shift authority cannot be asserted from a queued client request. |
| `parked_sale` | No mobile sync endpoint exists | No offline claim or handoff. The operation remains online-only because claim/transfer requires the server's exclusive recoverable lease. A future endpoint requires a separate contract and issue. |
| `item_create` | `/sync/items` can carry item create/update/delete operations | Out of this POS contract: catalog authoring belongs to OPIS under AGENTS.md and ADR 0087. ADR 0088 is proposed and is not a source of binding rules. Existing queued creates require explicit migration/manual-resolution treatment; the item endpoint's existence does not authorize new POS authoring. |
| `order_status_update` | `/sync/order-actions`, `operation_type: status_transition` | Online-only for web in this version. ADR 0076 applies to a native client with a durable cached-order action record; web has no equivalent approved local transaction. |
| Native `void`, `refund`, hardware event, checkpoint | Corresponding `/sync/*` route | Native capabilities only unless a separate web slice adopts their local evidence and reconciliation requirements. |

This policy matrix makes server envelope capability distinct from client capability. The backend
may accept an operation from native while web stays online-only. The shift-close discrepancy and
queued item-create records are drift/migration work; they do not change the CP classification or
OPIS ownership in this contract.

## Channel B cursor and migration path

Current `/bootstrap/catalog`, `/bootstrap/settings`, and `/bootstrap/device-policy` behavior is
snapshot-only. Until #468 defines and ships delta/cursor pull, a failed or invalid bootstrap must
not replace the last valid local snapshot. Web's #993 local reference-data store consumes the same
`since`/cursor, per-item version, and tombstone contract that #468 establishes; it must not invent
a web-specific cursor. The sequence is backend #468 contract and implementation, then web reference
store adoption. This document is the platform contract both implementations cite.

## Device identity and terminal authority

The sync envelope requires `device_id` matching `POS_DEVICE_ID_PATTERN`; free-tier limiting is
currently tenant+device keyed. Web's logical terminal ID is not automatically a valid device
identity and must not be self-asserted as one. The web migration depends on #800's server-validated
terminal identity contract. This document does not design or weaken that identity proof.

## Native and IMS boundaries

The native client's SQLite/SQLCipher storage and local SyncEngine remain governed by the mobile
architecture document linked above. The platform owns their server endpoint and replay contract.
ADR 0075 and ADR 0076 remain native-specific until ADR 0095 receives the required approval; the
proposed clause dispositions are recorded there.

`apps/dgfy-ims`'s Skupervisor POS twin is not a target of this first cut. New back-office-level
authoring work belongs in OPIS, and IMS is on the low-priority/deprecation track under AGENTS.md.
Issue #1001 decides whether the IMS twin converges or retires. If it converges, it can consume the
shared `packages/web-core` implementation and inherit this contract; if it retires, no IMS sync
work is needed. This document does not decide #1001 or #358.

## References and follow-up ownership

- ADR 0014 — web offline persistence, replay safety, and client-authoritative charged amount.
- ADR 0043 — shared sync-round vocabulary and native accounting.
- ADR 0075 and ADR 0076 — native offline financial and order-action contracts; web scope proposed
  in ADR 0095.
- ADR 0087 — OPIS back-office placement.
- ADR 0039 — ADR strictness and approval path.
- `docs/features/POS_MULTI_TERMINAL_CONSISTENCY_MODEL.md` — CP/AP operation rules.
- `apps/dgfy-api/src/routes/mobilePos.js` and `apps/dgfy-api/src/validators/posValidator.js` —
  current server endpoint and validation owners.
- `packages/web-core/src/features/pos/services/terminalOperationQueueStore.js` and
  `packages/web-core/src/features/pos/utils/posTerminalQueueReplay.js` — current web queue behavior.
- `#468` owns cursor/tombstone implementation; `#800` owns verified terminal identity; `#999`
  reconciles web round limiting; `#1001/#358` own the IMS outcome; `#2379/#803` own entitlement
  administration and funding decisions; `#470` owns wire-format redesign.
