---
status: reference
owner: engineering
last_reviewed: 2026-07-15
related_adr: 0017-tenant-lifecycle-cleanup.md,0029-catalog-inventory-pos-storefront-ownership-boundaries.md
declaration_id: 2026-07-15-pos-reports-location-pin-and-imin-routing
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.07.15
verification_evidence: pos-report-repository-tests,tenant-location-usecase-tests,tenant-location-reference-guard-tests,frontend-pos-contract-tests,pos-production-build,architecture-guardrails,controller-boundaries
rollback_note: Revert report category read-model changes, location-pin lifecycle guards, and iMin drawer routing together with their focused tests. No historical transaction, payment, receipt, or inventory data is migrated or rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-15T12:20:00+08:00
preflight_request_ref: POS-REPORTS-LOCATION-PINS-IMIN-2026-07-15
---

# POS Reports, Location Pin, And iMin Routing

## Compliance Impact Classification

Major. This change aligns POS report categories with the customer-facing item category, restores the location-pin confirmation path, and routes iMin drawer events through the native bridge before the USB fallback. It does not alter transaction totals, payment authorization, fiscal receipt generation, or inventory movements.

## Affected Surfaces

- POS reports: Food Category filtering, reporting options, and report output labels.
- POS Storefront settings: location pin reactivation and permanent-deletion confirmation.
- POS terminal hardware: native iMin cash-drawer routing with the existing USB bridge retained as fallback.

## Compliance Preconditions

- Reporting category selection filters the existing item-folder assignment and leaves financial calculations unchanged.
- A location pin can be permanently deleted only after deactivation and only when no operational reference exists, including delivery jobs.
- Native iMin handling runs only for cash-in drawer events; unsupported runtimes retain the existing USB bridge behavior.
- Existing Storefront checkout routes and payloads, payment processing, receipt contracts, and stock movement logic remain unchanged.

## Verification Evidence

- POS report repository and frontend contract tests.
- Tenant-location application-result, reference-guard, and manifest-coverage tests.
- POS terminal view-mode contract test and POS production build.
- Architecture guardrails, controller-boundary, lint, documentation, and diff whitespace checks.
