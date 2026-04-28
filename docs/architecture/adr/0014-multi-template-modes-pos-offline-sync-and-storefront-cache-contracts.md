# ADR 0014: Multi-Template Modes, POS Offline Replay Hardening, and Storefront Cache Contracts

## Status
Accepted (2026-04-27)

## Context
The platform now targets expanded operational templates across business types while preserving existing manufacturing/MSME route-gating behavior and non-destructive tenant upgrades.

Three contract gaps were identified:
1. Workflow modes were expanded, but item/product wizard defaults and POS runtime defaults were not yet template-driven from one registry.
2. POS terminal offline replay relied on local browser storage and lacked deterministic replay states, retry governance, and manual resolution tooling.
3. Storefront discovery/catalog high-read paths lacked explicit HTTP cache contracts and Redis cache-aside acceleration for read-heavy queries.

These concerns span frontend UI/UX contracts, backend API behavior, and operational performance controls.

## Decision
Adopt a cross-layer hardening contract in three parts:

1. Business mode templates
- Keep backward-compatible family semantics (`manufacturing` vs `msme`) for legacy gates.
- Add a centralized template registry for the expanded mode set (`retail`, `services`, `manufacturing`, `food_manufacturing`, `fnb`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`, `msme`).
- Drive item/product wizard defaults and POS defaults from the template registry while keeping tenant assignment policy manual.

2. POS offline replay hardening
- Replace fragile local-only queue behavior with durable IndexedDB queue storage and localStorage fallback compatibility.
- Standardize client replay statuses:
  - `queued`
  - `replaying`
  - `replayed`
  - `failed_manual_resolution_required`
- Enforce deterministic retry/backoff policy with max retry attempts and manual-resolution transition for unrecoverable failures.
- Add operator-visible Sync Queue console for filtering, replay, retry-now, and mark-resolved actions.
- Add Service Worker background sync hook (`sync` tag: `pos-terminal-operation-replay`) with graceful fallback to connectivity events.

3. Storefront read-path cache contracts
- Set explicit HTTP `Cache-Control` headers for public discovery/catalog read routes.
- Enforce `no-store` on checkout/order and authenticated mutation routes.
- Add Redis cache-aside for discovery list/profile read responses using tenant/filter/geo-bucket-aware keys with short TTL.

## Consequences
1. Expanded business templates become configuration-driven without destructive migration to legacy route logic.
2. POS offline replay becomes production-strong with durable queue state, explicit operator workflow, and deterministic retry behavior.
3. Discovery and catalog read performance improve under load with bounded cache staleness and explicit cache semantics.
4. Additional maintenance is required for queue schema evolution and template registry updates.

## Guardrails
1. Existing family-gated behavior (`manufacturing` vs `msme`) remains source-of-truth for route visibility.
2. Payment portal implementation remains out of scope; only non-payment order lifecycle hardening is included.
3. Checkout/mutation endpoints must remain non-cacheable (`no-store`).
4. Idempotency conflict and blocked replay behavior must remain deterministic across POS mutation endpoints.

## Rollback Notes
1. UI rollback can hide Sync Queue surfaces while preserving queued records.
2. Runtime rollback can disable Service Worker sync and rely on online/offline replay fallback.
3. Discovery/profile Redis cache-aside can be disabled by Redis unavailability without API contract break.
4. Template registry rollback can fall back to family defaults (`manufacturing`/`msme`) without data loss.

