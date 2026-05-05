---
status: accepted
date: 2026-05-05
last_reviewed: 2026-05-05
classification: authoritative
---

# ADR 0018: Barcode Identity, Labels, And Scan Routing

## Context
Tenants need barcode support across Inventory, POS, Storefront, and Services without turning the barcode into a bypass path. Existing `items.sku_code` is a human/business SKU and must remain separate from scan identities. The project already separates transport controllers, use cases, repositories, POS visibility, Storefront visibility, customer access modes, multi-location stock, and Services stock exemption.

This decision follows `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0005, ADR 0007, ADR 0008, ADR 0009, ADR 0014, ADR 0016, ADR 0017, `docs/features/CUSTOMER_ACCESS_MODES_AND_INVENTORY_DISPLAY.md`, `docs/features/IMS_POS_SALES_UX_JOURNEY.md`, and `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`.

The change is cross-boundary because it touches tenant-local inventory identity, POS scan-to-cart, Storefront public QR routing, Services/ticket references, offline replay metadata, auditability, printable labels, CSV/import/export, and public/private API contracts.

## Decision
- Add tenant-local barcode identity rows separate from `items.sku_code`. `sku_code` remains the human/business SKU; barcode rows are scan aliases.
- Support imported manufacturer/supplier barcodes and tenant-generated internal barcodes. Official GS1 prefix allocation remains out of scope until a separate ADR.
- Store barcode source as one of `manufacturer`, `supplier`, `tenant_generated`, `legacy_import`, or `system_generated_reference`.
- Store barcode scope as one of `inventory`, `pos`, `storefront_qr`, `batch`, `service`, `ticket`, or `package`.
- Enforce active barcode uniqueness within the current tenant database. The same manufacturer code may exist in multiple tenants, but one tenant cannot silently map one active code to two active unrelated identities.
- Support package aliases with `quantity_multiplier`, so a unit code and a case code can resolve to the same item with different quantities.
- Resolve conflicts fail closed. Duplicate scans/imports return deterministic conflict metadata and must be handled through explicit UI actions with audit logging.
- Generate browser-printable label payloads for item, shelf, package/case, batch/lot, service/package, and ticket/booking labels. Printer SDK profiles are out of scope.
- Generate public QR payloads as Storefront-safe deep links. QR cart handoff is allowed only when effective Customer Access Mode permits transaction behavior and existing checkout gates pass.

## Scan Routing Contract
- Barcode resolution identifies a record only. It never authorizes an action by itself.
- Inventory scan workflows may prefill item, batch, package, and quantity context, but stock movement still goes through existing inventory use cases and location-grant checks.
- POS scan-to-cart runs through POS use cases. The scan must pass item status, POS visibility, price, shift location, location grant, stock policy, service-stock exemption, and compliance readiness before the UI can treat it as addable.
- Offline POS queues may store scan intent and resolved snapshots for operator continuity, but replay must revalidate server-side barcode mapping, item state, location/stock, and compliance before commit.
- Storefront QR routing uses Storefront visibility only. It must not read `pos_visible` as customer-facing eligibility.
- Storefront public payloads must not expose `cost_per_unit` or raw `current_stock`; they use the existing inventory display contract.
- Services scans resolve service-sale or booking/ticket references. Service rows stay stock-exempt unless the scanned record is a supply item.
- Ticket/booking QR responses redact customer contact data unless an existing authenticated or claim flow permits disclosure.

## Consequences
- A new `item_barcodes` tenant table becomes part of runtime schema readiness and tenant model binding.
- Inventory item setup/detail screens gain barcode management and label preview.
- POS Terminal gains an always-ready scan entry that returns success, routed service-booking metadata, or blocked reason codes instead of silently adding invalid lines.
- Storefront gains a QR landing route that evaluates Customer Access Mode before exposing catalog or cart actions.
- CSV import/export can include barcode aliases but must never expose records outside the current tenant database.
- Audit logs must cover barcode create/update/deactivate/primary change/conflict resolution/label print intent.
- No architecture allowlist exception is required.

## Validation
- Run `npm run check:architecture` and `npm run lint:docs`.
- Add backend tests for normalization, symbology detection, uniqueness/conflict behavior, generation, package multipliers, deactivation/history, POS blocked/routed reasons, Storefront QR mode behavior, Services stock exemption, ticket redaction, label contracts, and offline replay revalidation.
- Add frontend tests for barcode setup, conflict modal, label preview, POS scan success/blocked/routed states, Storefront QR mode handling, and permission-aware controls.
- Add browser E2E coverage for manufacturer/internal barcode setup, printable label preview, POS scan-to-cart, checkout stock deduction, Storefront transaction QR, and non-transaction QR blocking.
