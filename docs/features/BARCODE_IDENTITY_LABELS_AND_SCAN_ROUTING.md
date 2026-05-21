---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-05-05
applies_to: barcode_identity_labels_scan_routing
topic: barcode_identity
---

# Barcode Identity, Labels, And Scan Routing

## Summary
Barcode support is implemented as a cross-boundary identity and routing layer. A scan identifies an inventory, POS, Storefront, service, ticket, package, or batch context, but existing domain rules still decide whether the user can act on that context.

Authoritative docs used for this implementation:

- `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/adr/0005-tenant-module-boundaries.md`
- `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md`
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
- `docs/architecture/adr/0009-multi-location-inventory-ledger-and-safety-rollout.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md`
- `docs/architecture/adr/0018-barcode-identity-labels-and-scan-routing.md`

## Tenant Setup
Tenants can attach an existing manufacturer or supplier barcode to an item without generating a replacement. Tenants can also generate an internal Code 128-style barcode when no usable external barcode exists. Internal generated codes are tenant-local identifiers and must never be described as official UPC, EAN, or GTIN values.

Barcode rows are scoped to the tenant database. The same manufacturer barcode can exist in another tenant, but an active code cannot silently point to two active unrelated identities inside one tenant. Conflicts fail closed and return the existing linked record for controlled resolution.

## Barcode Identity Fields
- `code`: the raw operator-visible scan value.
- `normalized_code`: the compare key produced by the shared normalization utility.
- `symbology`: detected class such as `upc_a`, `ean13`, `code128`, `qr`, or `unknown`.
- `source`: `manufacturer`, `supplier`, `tenant_generated`, `legacy_import`, or `system_generated_reference`.
- `scope`: `inventory`, `pos`, `storefront_qr`, `batch`, `service`, `ticket`, or `package`.
- `quantity_multiplier`: package/case multiplier applied as a suggested quantity, not a stock movement by itself.
- `is_primary`: preferred item barcode for labels and exports.
- `is_active`: active scan identity flag. Deactivated rows remain historically explainable.

## Modes That Benefit
- Inventory item setup/details: assign imported barcodes, generate internal barcodes, set primary codes, deactivate aliases, and preview labels.
- Receiving: scan item/package/batch codes to prefill item and quantity before normal receiving rules run.
- Stock count: scan item/package/shelf labels to prefill counted item and suggested unit quantity while preserving location context.
- Transfers: scan item/package/batch labels to prefill transfer lines, then use existing source/destination location rules.
- Batch/lot lookup: scan a batch/lot label to open item and batch context.
- POS Terminal: scan item/service/package codes into the cart only after POS eligibility passes; service booking/ticket scans route to the Services booking context and do not mutate the cart.
- Offline POS replay: store scan intent and snapshot, then revalidate server-side state before commit.
- Storefront QR: open Storefront-safe item/service landing pages and cart handoff only when the effective Customer Access Mode is `transaction`.
- Services: scan service item/package labels as service-sale rows and booking/ticket QR as redacted references. Booking/ticket QR payloads are lookup/routing identities, not cartable stock identities.

## Failure Rules
- Duplicate active assignment returns `BARCODE_CONFLICT` metadata and does not move the code automatically.
- Missing barcode returns `BARCODE_NOT_FOUND`.
- POS blocked scans return reason codes such as `BARCODE_SCOPE_NOT_POS`, `TICKET_SCAN_NOT_CARTABLE`, `NOT_POS_VISIBLE`, `ITEM_INACTIVE`, `MISSING_PRICE`, `OUT_OF_STOCK`, `LOCATION_CONTEXT_REQUIRED`, `UNAUTHORIZED_LOCATION`, `COMPLIANCE_BLOCKED`, or `SERVICE_UNAVAILABLE`.
- POS service booking/ticket scans return routed status with `SERVICE_BOOKING_SCAN_ROUTED`; the UI should direct the operator to Services > Bookings without adding a cart line.
- Storefront QR blocked by Customer Access Mode returns `CUSTOMER_ACCESS_MODE_BLOCKED` details.
- Public QR payloads never expose `cost_per_unit` or raw `current_stock`.
- Service rows stay stock-exempt unless scanning a supply item.

## Printable Labels
The backend renders label payloads; the frontend renders browser-printable labels and QR/barcode previews. Label types include item, shelf, package, batch, service, ticket, and booking references. Label payloads include normalized label type, human-readable type, and browser-print layout metadata such as purpose, width, and height. Printing emits a `barcode.label_print_intent` audit event but does not mutate stock or sale state.

## Implementation Surfaces
- Backend inventory endpoints manage barcode aliases, generation, resolution, conflict actions, and label payloads.
- Backend POS endpoints resolve scans through POS use cases and return resolved, blocked, or routed metadata.
- Backend Storefront endpoints resolve public QR/deep-link payloads through Storefront visibility and Customer Access Mode.
- Inventory UI exposes barcode management on item setup/detail surfaces.
- POS UI exposes always-ready scanner input and blocked reason feedback in Terminal.
- Storefront UI exposes QR landing behavior with transaction-only cart handoff.

## Validation
Required gates before broad rollout:

- `npm run check:architecture`
- `npm run lint:docs`
- backend barcode utility/use-case tests
- POS scan resolver tests
- Storefront QR access-mode tests
- label contract tests for browser-print metadata and audit intent
- frontend barcode manager/POS scan/Storefront QR tests
- Storefront build, POS build, and SKUpervisor build
