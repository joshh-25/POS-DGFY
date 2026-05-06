---
declaration_id: 2026-05-05-barcode-identity-scan-routing
classification: major
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: BARCODE_SCAN_ROUTING,POS_SCAN_TO_CART,OFFLINE_REPLAY_REVALIDATION,STOREFRONT_QR
policy_version: 2026.05.05
verification_evidence: npm_run_check_architecture,npm_run_lint_docs,targeted_backend_frontend_tests
rollback_note: Disable barcode UI/API routes and keep item_barcodes rows inactive; existing SKU/POS/Storefront flows continue without scan routing.
preflight_result: no_breach
preflight_reason_code: BARCODE_SCAN_ROUTING_GATED
preflight_run_at: 2026-05-05T00:00:00Z
preflight_request_ref: CODEX-2026-05-05-BARCODE-PROGRAM
---

# Barcode Identity And Scan Routing Compliance Impact

## Compliance Impact Classification
This is classified as `major` because the change adds POS scan-to-cart routing, offline replay scan metadata, tenant barcode assignment, and public Storefront QR routing. The scan layer identifies records only; fiscal, compliance, payment, stock, and location rules remain enforced by existing use cases.

## Affected Surfaces
- POS Terminal scan resolution and blocked reason reporting.
- Inventory item setup/details barcode assignment and printable label intent logging.
- Storefront QR landing routes and transaction-mode cart handoff.
- Offline POS replay payloads that must revalidate scan mapping before commit.
- Services/ticket QR references with redacted public data.

## Compliance Preconditions
- Scans must not bypass POS visibility, Storefront visibility, location grants, shift location, stock policy, compliance lifecycle, payment readiness, item status, or Services stock exemption.
- Barcode conflicts must fail closed and require explicit resolution.
- Public QR responses must stay Storefront-safe.
- Internal generated codes must not be represented as official UPC/EAN/GTIN identifiers.

## Verification Evidence
Planned verification includes `npm run check:architecture`, `npm run lint:docs`, backend barcode/POS/Storefront tests, frontend barcode/POS/Storefront tests, and POS/Storefront/SKUpervisor builds.
