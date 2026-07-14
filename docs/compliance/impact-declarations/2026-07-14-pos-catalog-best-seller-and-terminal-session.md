---
status: reference
owner: engineering
last_reviewed: 2026-07-14
related_adr: 0029-catalog-inventory-pos-storefront-ownership-boundaries.md
declaration_id: 2026-07-14-pos-catalog-best-seller-and-terminal-session
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.07.14
verification_evidence: backend-catalog-tests,frontend-pos-contract-tests,pos-production-build,architecture-guardrails,tenant-schema-coverage
rollback_note: Revert the best-seller migration and catalog projection together, then revert terminal catalog UI and company-session handoff changes. Existing checkout, payment, receipt, and inventory quantities are not rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-14T12:00:00+08:00
preflight_request_ref: POS-CATALOG-BEST-SELLER-TERMINAL-2026-07-14
---

# POS Catalog Best Seller And Terminal Session Contract

## Compliance Impact Classification

Major. This adds a server-owned POS best-seller catalog projection, catalog availability controls, and a same-tab POS company-session handoff. It does not change checkout totals, payment authorization, fiscal receipts, or inventory movements.

## Affected Surfaces

- POS catalog and catalog-override settings.
- POS terminal setup, availability filtering, starter-item image confirmation, and company switching.
- Tenant schema repair and runtime schema readiness checks.

## Compliance Preconditions

- Best-seller status is resolved from completed, paid POS transactions over the configured lookback period or from an explicit catalog override.
- The catalog availability filter does not write stock quantities and preserves service and Always Available visibility.
- The company-switch handoff has a 60-second lifetime, stores no credential in browser storage, and is consumed after one refresh attempt.
- Existing Storefront routes, checkout contracts, payment flows, and receipt calculations remain unchanged.

## Verification Evidence

- Focused backend catalog, tenant-schema, and runtime-schema tests.
- Focused POS contract tests and POS production build.
- Architecture guardrails, controller-boundary, compliance, documentation, and tenant-schema coverage checks.
