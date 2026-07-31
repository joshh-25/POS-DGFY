---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-07-25
last_reviewed: 2026-07-27
review_by: 2027-01-25
applies_to: architecture_decision
topic: external_barcode_product_registry_lookup
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
- Query Open Prices through a separate server-side adapter only after a product match. A price lookup failure is non-blocking and does not change the product lookup result.
- Return at most one recent Philippine `PHP` observed-price suggestion from the configured age window. Discounted observations prefer the recorded non-discounted amount when available. The response must include the provider, observation date, location, and a warning that community price data is not a verified manufacturer SRP.
- Never apply an observed price automatically. The operator must select **Use suggested price**, which copies the advisory value into the existing editable selling-price field. Existing entered prices remain unchanged until that explicit action.
- Category and image suggestions remain advisory until the operator selects **Use product details**. After that explicit action, an exact case-insensitive active tenant-category match may be selected. If no match exists, the suggested name may be staged for the existing authorized category-create-on-save flow; the external registry never creates a category by itself.
- After the same explicit action, the UI may request a persistent image import after item creation. The browser sends only the accepted GTIN, never an arbitrary image URL. The backend resolves the provider record again, accepts only an allowlisted HTTPS image host, stores the image through DGFY's governed optimization pipeline, and records provider attribution with the stored image.
- A manually selected item image always takes precedence over the registry image. Registry image import failure does not roll back an otherwise valid item; it remains an explicit retryable post-create stage.
- Require an explicit operator action before applying lookup data. Existing entered values are not overwritten automatically.
- When the scanned code is accepted during item creation, create its `manufacturer` barcode identity in the same tenant database transaction as the item. A barcode conflict rolls back the item creation.
- Preserve all ADR 0018 behavior for known-item resolution, POS scan-to-cart, permissions, stock validation, and conflicts.

## Consequences
- Product lookup can fail independently without blocking manual item creation.
- Open Prices is a crowdsourced market-price reference, not an authoritative SRP feed. Verified manufacturer or supplier SRP requires a future governed provider adapter.
- Community registry data may be incomplete or inaccurate and must remain visibly attributed and editable before save.
- External images are copied into tenant-scoped DGFY storage; Storefront and POS never depend on provider hotlinks after import.
- No new database table or migration is required because accepted codes use the existing `item_barcodes` table.
- No new price column is required because accepted advisory prices populate the existing `default_sale_price` input and remain editable before save.
- A future commercial GS1/provider adapter may replace or supplement Open Food Facts without changing the API or UI contract.

## Validation
- Unit-test GTIN validation, found/no-match normalization, timeout handling, provider failures, and caching.
- Unit-test Philippine currency/location filtering, recency filtering, regular-price selection for discounted observations, and non-blocking price-provider failures.
- Verify unauthorized users cannot call the lookup endpoint.
- Verify accepting a barcode creates the item and manufacturer barcode atomically; duplicate barcode conflicts create neither.
- Verify the Add Item form handles scanner Enter, loading, no-match, provider outage, reviewed prefill, attribution, and manual fallback.
- Verify observed prices show source, location, and date; do not overwrite selling price automatically; and apply only after **Use suggested price**.
- Verify accepted category suggestions reuse an active tenant category case-insensitively, unauthorized users cannot stage a new category, and manual selection remains editable.
- Verify image import rejects arbitrary URLs, non-HTTPS or unapproved hosts, redirects, oversized/non-image payloads, and duplicate retry side effects; verify the optimized local image and attribution are returned after success.
- Run architecture guardrails, controller-boundary checks, barcode regression tests, frontend tests, and production builds.
