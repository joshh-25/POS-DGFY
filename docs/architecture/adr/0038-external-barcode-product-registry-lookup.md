---
status: accepted
date: 2026-07-25
last_reviewed: 2026-07-25
classification: authoritative
---

# ADR 0038: External Barcode Product Registry Lookup

## Context
ADR 0018 defines tenant-local barcode identities and scan routing for known items. Inventory operators also need to scan an unknown retail UPC/EAN/GTIN while creating an item and receive product metadata from an external registry. External registry data is advisory, rate-limited, and may be incomplete, so it cannot become an authorization or inventory source of truth.

This change crosses the Inventory and external-integration boundary. It follows `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0018, and ADR 0029.

## Decision
- Add a server-side product-registry port and an Open Food Facts adapter. Browser clients must not call external registries directly.
- Accept only valid GTIN-8, UPC-A/GTIN-12, EAN-13, and GTIN-14 values with valid check digits.
- Require authenticated item-create permission for lookup. Lookup identifies a possible product only and never authorizes item creation, stock, pricing, POS visibility, or Storefront visibility.
- Cache found results for 24 hours and no-match results for 15 minutes to protect provider limits. Cache failure remains non-blocking.
- Return normalized advisory fields: product name, brand, quantity, category suggestion, image preview URL, provider URL, and attribution.
- Never auto-create or assign a DGFY category from an external taxonomy. The operator must select or create the tenant-owned category.
- Never silently import an external image. The UI may preview the attributed provider image; persistent item media continues through DGFY's governed upload pipeline.
- Require an explicit operator action before applying lookup data. Existing entered values are not overwritten automatically.
- When the scanned code is accepted during item creation, create its `manufacturer` barcode identity in the same tenant database transaction as the item. A barcode conflict rolls back the item creation.
- Preserve all ADR 0018 behavior for known-item resolution, POS scan-to-cart, permissions, stock validation, and conflicts.

## Consequences
- Product lookup can fail independently without blocking manual item creation.
- Community registry data may be incomplete or inaccurate and must remain visibly attributed and editable.
- No new database table or migration is required because accepted codes use the existing `item_barcodes` table.
- A future commercial GS1/provider adapter may replace or supplement Open Food Facts without changing the API or UI contract.

## Validation
- Unit-test GTIN validation, found/no-match normalization, timeout handling, provider failures, and caching.
- Verify unauthorized users cannot call the lookup endpoint.
- Verify accepting a barcode creates the item and manufacturer barcode atomically; duplicate barcode conflicts create neither.
- Verify the Add Item form handles scanner Enter, loading, no-match, provider outage, reviewed prefill, attribution, and manual fallback.
- Run architecture guardrails, controller-boundary checks, barcode regression tests, frontend tests, and production builds.
