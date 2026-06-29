---
status: reference
owner: engineering
last_reviewed: 2026-06-29
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-29-pos-terminal-checkout-grid-layout-hotfix
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.06.29
verification_evidence: npm --prefix frontend test -- --run src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js --testTimeout 20000,npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the POS checkout grid span classes and the matching responsive layout contract test; no database, fiscal receipt, checkout calculation, payment, auth, or terminal session behavior is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-29T11:45:00+08:00
preflight_request_ref: POS-TERMINAL-CHECKOUT-GRID-LAYOUT-HOTFIX-2026-06-29
---

# POS Terminal Checkout Grid Layout Hotfix

## Compliance Impact Classification

Major. This hotfix changes the rendered POS checkout layout only. It assigns explicit `2xl` grid spans to the catalog and current-sale panes so the terminal does not compress those panes into single narrow columns on wide screens.

## Affected Surfaces

1. Standalone POS terminal checkout layout.
2. POS responsive layout contract tests.

## Compliance Preconditions

1. Fiscal receipt status, receipt rendering, and document-type classification remain unchanged.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
3. POS terminal lock, DGFY unlock, legacy grace login, terminal ID, shift, and compliance gate behavior remain unchanged.
4. No backend routes, repositories, models, migrations, payment files, or production environment configuration are changed.
5. The layout must keep the catalog and current-sale panes readable at `2xl` widths while preserving the existing single-column fallback below the `2xl` breakpoint.

## Verification Evidence

The commands listed in front matter must pass before deployment. Live production proof must include a POS rendered check showing the catalog and current-sale panes use the full checkout width instead of appearing as narrow single grid columns.
