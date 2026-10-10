---
status: authoritative
authority_level: authoritative
owner: pos
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: pos_inventory_storefront_offline_operations
topic: pos_multi_terminal_consistency_model
---

# POS Multi-Terminal Consistency Model

## Purpose and scope

This contract classifies POS operations during a LAN partition and records the target authority
model for multiple terminals at one location. It covers POS, Inventory, Storefront, and offline
replay. It decides no runtime, API, UI, or schema change. Implementation work remains in the
separately scoped issues referenced below.

## Decision

The backend and its database remain the only serialization point for durable business state.
Terminals may continue locally only for work covered by server-issued authority, stable
idempotency, and a replay path. That work is AP while disconnected: a terminal may accept a
provisional local result, but it cannot make that result canonical or visible to other terminals.
Every operation that needs a fresh server decision is CP and fails closed while offline.

WiFi or Bluetooth between terminals does not change those authority rules. A peer connection may
carry advisory notifications, but it cannot replicate or authorize stock, invoice numbers, shifts,
claims, or registry changes.

## Operation classification

| Operation | Classification during a LAN partition | Rule and reason |
|---|---|---|
| Stock decrement while online | CP | Inventory checks current location stock and records the stock effect under its transaction and locking rules. POS and Storefront request stock changes; Inventory owns stock truth (ADR 0029). |
| Stock decrement while offline | AP, within a server-granted terminal allocation only | A terminal may make a local cash sale against its own cached, server-issued allocation. Replay consumes that allocation idempotently through Inventory. An overrun fails closed into manual resolution; a terminal cannot borrow another terminal's allocation or spend unallocated stock (#997; ADRs 0014 and 0029). |
| Invoice / OR numbering | CP | Fiscal invoice numbers are server-assigned from the tenant's shared `POS_OR` sequence. The offline checkout path uses a `PENDING-` placeholder and a non-fiscal slip; it does not reserve a fiscal number or print a final receipt before server confirmation (ADR 0025 Guardrail 4; #1000 owns any offline fiscal series). |
| Shift open | CP | Opening requires live server confirmation of identity, membership, permissions, terminal/location binding, and the one-open-shift constraints (ADR 0014; ADR 0031). |
| Shift close | CP | Close changes shared financial history and must run through the server transaction and its open-shift guards. Offline close is unsupported; elapsed time or a peer message cannot close a shift (ADR 0031). |
| Z-reading / day close | CP | The server serializes the branch-scoped business date and reading under the existing transaction and uniqueness constraints. A terminal without a live server decision cannot close the branch day. |
| Parked-sale handoff / claim | CP | Claim and transfer require the server's exclusive, recoverable claim lease. A peer cannot grant a second terminal ownership. Ordinary shift close follows ADR 0065's 2026-10-06 amendment and does not block on parked-sale row states. |
| Sale amount charged while offline | AP, as a client claim | An eligible offline cash checkout may charge the amount computed from its server-issued rules and snapshots and retain it on a provisional slip. On replay, the server re-derives and records its amount and flags divergence; the server figure remains reporting truth (ADR 0014 and ADR 0025, both amended 2026-10-10). This does not give the client persistence, pricing-rule, or stock authority. |
| Terminal registry and pairing edits | CP | These are administrative policy writes. They require an online authorized write and must not be merged from peer copies. Pairing remains a logical terminal signal, with strict device proof governed separately (ADRs 0031 and 0044). |

AP here means bounded local availability with later reconciliation, not peer-to-peer consistency.
An operation is not AP merely because a client can queue a request; it must already have the
authority, durable local record, and idempotent replay contract needed for that operation.

## Invoice counter decision

Keep the current tenant-wide `POS_OR` counter unsharded for now. POS fiscal checkout and Storefront
currently use the same key. The counter row is selected `FOR UPDATE` and incremented inside the
checkout transaction; POS non-fiscal slips use the separate `POS_NFS` key. Splitting the fiscal
sequence by terminal or location would create multiple number series and needs an explicit fiscal
series decision, rather than being treated as a performance-only change. Offline fiscal numbering
remains with #1000.

The repository evidence reviewed for this decision contains no measured `pos_invoice_counters`
lock-wait distribution or load result, so this record does not claim that current contention is
acceptable. Proposed reopening trigger: measure row-lock wait and checkout latency over a
representative peak period; revisit sharding if the p95 counter-row wait exceeds 100 ms across a
seven-day observation, or checkout's existing latency objective is breached and the counter wait is
shown to be a material cause. If Storefront traffic is the source, evaluate a separate Storefront
counter only after confirming it does not create an unapproved fiscal series. These thresholds are
the proposed decision trigger for review, not a claim that the measurement has already passed.

## Terminal registry decision

The current API reads and rewrites `pos_terminal_registry` as one settings value. The settings
repository supports an optional `expected_updated_at` compare-and-set, but current POS registry save
callers do not pass it; concurrent stale whole-blob writes can therefore overwrite one another.
Passing the existing version guard from those callers is the short-term mitigation and requires no
schema change.

For the normalized target, adopt the already-defined `dgfy_business_*.terminal_identities` table
rather than creating a competing `pos_terminals` identity table. The foundation schema gives each
identity a unique terminal code, label, location binding, status, and optional last-seen time. Its
runtime write contract must use a per-row compare-and-set token to reject stale edits; the exact
token field and write path belong to implementation design. The authoritative migration map already
maps legacy `system_settings.pos_terminal_registry` entries into `terminal_identities` and excludes
password hashes and pairing secrets.

The live API still reads tenant `system_settings`; `terminal_identities` lives in the separate
`dgfy_business_*` schema. This decision sets a target, not a migration date or an immediate runtime
switch. The schema convergence and migration sequence must be designed before implementation. The
other per-terminal fields currently carried by the settings blob—pairing version, device-enrollment
policy, cashier assignments, default selection, and password material—must not be added to
`terminal_identities` by assumption. #800 owns the durable pairing and operational-field design and
must coordinate its shape with this target.

## Terminal-to-terminal transport

Reject LAN WiFi or Bluetooth as a transport for authoritative business state. A peer mesh would
introduce another writer for stock, numbering, shift, or claim state, conflicting with ADR 0025's
backend persistence authority and ADR 0029's `[binding]` Inventory ownership clauses. At most, a
peer channel may carry non-authoritative hints such as cache invalidation or a notice that a claim
changed; the receiving terminal must still read or validate the state with the backend. Bluetooth
also has no baseline support in browser POS under ADR 0067. Any central-host topology proposal stays
with #799.

## Replay and adjacent contracts

ADR 0014's replay policy was revisited by the 2026-10-10 amendment in Phase 496 / #995. This
document makes no duplicate amendment: AP rows must use the existing scoped, durable, idempotent
replay rules and remain compatible with both the `manual` policy and the governed `auto` policy
that #999 has yet to implement. The current `/mobile-pos` free-tier limiter is keyed by tenant and
device and skips failed requests; its two-successful-round behavior is device-scoped. #999 owns
reconciling the limiter's per-device key with the shared per-scope round definition.

## Governance and follow-on work

This decision changes no `[binding]` clause in ADR 0029 and does not authorize any migration or
runtime implementation. ADR 0031's default registry-storage wording is amended to point to this
target while retaining the current settings-backed runtime until separately planned convergence.
ADR 0044's pairing and authorization rules remain unchanged.

Follow-on work for PM to shape:

- Registry compare-and-set in existing POS save callers, followed by `terminal_identities`
  adoption and migration/dual-read sequencing coordinated with #800.
- Counter lock-wait measurement and a separate Storefront counter only if the stated trigger fires
  and fiscal-series review permits it.
- Correct the stale path and device-keying claims on #798 and #795 using current repository
  evidence.

## References

- ADR 0014 — offline POS persistence, replay policy, and stock allocation.
- ADR 0025 — backend persistence authority and receipt guardrails.
- ADR 0029 — `[binding]` Catalog, Inventory, POS, and Storefront ownership boundaries.
- ADR 0031 and ADR 0044 — terminal identity, pairing, and operator authorization.
- ADR 0042 — fiscal document and accreditation controls.
- ADR 0065 — parked-sale claim lease and shift-close rules.
- ADR 0067 — browser support baseline.
- ADR 0043 — standalone native hardware POS with shared backend authority.
- `docs/features/PER_TERMINAL_STOCK_ALLOCATION.md` — Inventory-owned terminal stock allocations.
- `docs/database/dgfy-foundation.md` and `docs/database/dgfy-data-migration-map.md` — normalized
  terminal identity schema and migration mapping.
