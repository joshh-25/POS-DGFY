---
status: reference
owner: engineering
last_reviewed: 2026-06-30
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-30-frontend-release-gate-baseline
classification: regulatory
surfaces: pos,terminal,storefront,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.06.30
verification_evidence: npm run test:frontend,npm run check:frontend-budgets,npm --prefix frontend run build:all,npm run lint:docs,npm run check:architecture,npm run check:compliance
rollback_note: Revert the POS lazy import boundaries and budget baseline updates; no checkout calculation, payment, fiscal receipt, tax, terminal session, API, database, or compliance decision behavior is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-30T11:07:50+08:00
preflight_request_ref: FRONTEND-RELEASE-GATE-BASELINE-2026-06-30
---

# Frontend Release Gate Baseline

## Compliance Impact Classification

Major. The change touches compliance-sensitive POS route and layout files to restore lazy-loaded bundle boundaries. It changes module loading and release-budget enforcement only.

## Affected Surfaces

1. SKUpervisor POS route loading.
2. Standalone POS checkout and operations workspace loading.
3. Storefront discovery map and customer-account regression coverage.
4. Frontend route-chunk release budgets.

## Compliance Preconditions

1. Checkout totals, discounts, VAT, fees, payment methods, and order submission remain unchanged.
2. Fiscal receipt status, receipt rendering, and document classification remain unchanged.
3. Terminal authentication, lock state, shift state, queue persistence, and hardware behavior remain unchanged.
4. No backend route, repository, model, migration, database, or production configuration is changed.
5. Lazy-loaded POS components must retain their existing Suspense loading states and receive the same props.

## Verification Evidence

The commands listed in front matter must pass before promotion. Fresh build evidence must show separate standalone and SKUpervisor checkout chunks within their declared limits.
