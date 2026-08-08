---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-08
last_reviewed: 2026-08-08
review_by: 2027-02-08
applies_to: pos, inventory, frontend, realtime_delivery
topic: tenant_scoped_pos_catalog_realtime_invalidation
---

# ADR 0055: Tenant-Scoped POS Catalog Realtime Invalidation

## Status

Accepted (2026-08-08)

## Context

The POS terminal previously refreshed its catalog only during local browser
events, initial load, or manual navigation. A catalog item added or updated by
an administrator on another device could remain absent from a cashier's open
terminal until that cashier manually refreshed the page. The existing browser
event cannot cross devices, and sending catalog records through a realtime
channel would risk bypassing the normal location-grant filtering contract.

## Decision

1. Successful Inventory item mutations and POS catalog-override/image
   mutations publish a tenant-scoped `pos.catalog.changed` invalidation after
   their use case has persisted successfully.
2. `GET /pos/catalog/events` is an authenticated, `pos:view`-protected SSE
   stream. It emits only `reason` and `emitted_at`; it does not emit item,
   inventory, location, or price data.
3. POS clients must treat the event as a prompt to re-fetch `GET /pos/catalog`.
   The catalog read remains the single authoritative source and continues to
   apply the requester's location grants, terminal context, and visibility
   rules. [binding]
4. The backend uses local in-process delivery for a single API instance and
   Redis Pub/Sub fan-out when Redis is available. Redis unavailability must not
   prevent a completed catalog mutation or same-instance delivery.
5. Browser clients reconnect with bounded backoff and refresh when the stream
   reconnects, comes online, regains visibility, or reaches a visible-terminal
   fallback interval. Catalog refreshes must not clear the current cart,
   search, filter, or checkout draft. [binding]

## Consequences

1. A cashier sees administrator catalog changes without manual page refresh in
   the normal connected case.
2. Multi-instance delivery is available where Redis is configured, while local
   development remains functional without Redis.
3. A missed event is repaired by reconnect and visibility/online fallback,
   rather than assuming durable event history.
4. No database migration is required because the event stream is an
   invalidation layer over existing catalog reads.
