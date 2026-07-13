---
status: reference
owner: engineering
last_reviewed: 2026-07-13
related_adr: docs/architecture/adr/0018-barcode-identity-labels-and-scan-routing.md
declaration_id: 2026-07-13-pos-catalog-batched-barcode-loading
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.13
verification_evidence: npm --prefix backend test,npm --prefix frontend test,npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the primary_barcode batch mapping in posRepository.js and restore the prior per-item barcode lookup in TerminalOperationsWorkspace.jsx; item barcode identities, POS visibility, stock, pricing, checkout, and fiscal calculations are unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-13T17:50:00+08:00
preflight_request_ref: POS-CATALOG-BATCHED-BARCODE-LOADING-2026-07-13
---

# POS Catalog Batched Barcode Loading

## Compliance Impact Classification

Major. The change affects the POS and terminal surfaces, which have a major classification floor. It replaces repeated barcode display reads with one tenant-scoped batch lookup during the existing POS catalog read. No barcode identity is created, updated, deactivated, or resolved for cart entry by this change.

## Affected Surfaces

1. `GET /pos/catalog` now includes the active primary barcode summary for each returned catalog item.
2. POS Item Management reads that catalog-supplied value for barcode display instead of calling `/items/:item_id/barcodes` once per item.
3. The barcode management, barcode scan, stock, item price, discount, checkout, payment, receipt, and fiscal paths are unchanged.

## Compliance Preconditions

1. The batch query is limited to the catalog item IDs already authorized and visible in the current tenant's POS catalog.
2. Only active barcode rows are returned; the primary row is preferred and the first active row is used only when an item has no explicit primary barcode, matching the prior UI selection behavior.
3. The returned display summary contains only `item_barcode_id`, `code`, and `is_primary`; it does not expose item cost, stock, customer, payment, or fiscal data.
4. POS scan-to-cart remains governed by `POST /pos/scan` and its existing readiness, location, stock, and compliance checks.

## Verification Evidence

1. Backend repository tests prove one batch barcode lookup supplies the catalog primary barcode and preserves existing catalog behavior.
2. Frontend contract tests prove Item Management consumes `primary_barcode` and no longer calls the per-item barcode client helper.
3. POS production build, documentation lint, compliance gate, and architecture guardrails pass.
