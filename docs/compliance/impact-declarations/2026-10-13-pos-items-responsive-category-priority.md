---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-13
declaration_id: 2026-10-13-pos-items-responsive-category-priority
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.10.09
verification_evidence: 29 POS test files and 244 tests passed,POS and Storefront production builds passed,documentation lint passed,architecture checks passed,git diff check passed
rollback_note: Revert the POS Items catalog/category presentation changes and this declaration; no API, schema, migration, or persisted category-order rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-13T08:54:30Z
preflight_request_ref: NOT-EXECUTED-2026-10-13-POS-ITEMS-RESPONSIVE-CATEGORY-PRIORITY
---

# POS Items Responsive Catalog and Category Priority

This declaration covers responsive POS Items catalog views and category-priority controls, plus the Storefront presentation that consumes the existing saved category order. It changes presentation and ordering behavior only; existing APIs and persistence contracts remain in place.

## Compliance Impact Classification

Classified `major` because changes under `packages/web-core/src/features/pos/**` have a repository-enforced minimum classification of `major` for the `pos` and `terminal` surfaces. This batch includes the Items grid and list/table views, responsive item cards, category ordering UX, category actions, and supporting frontend tests. Storefront's All-items presentation follows category priority while preserving alphabetical ordering within each category. No payment, tax, fiscal calculation, or compliance decision logic is changed.

## Affected Surfaces

- POS Items catalog and category-management presentation across desktop, tablet, and mobile.
- Storefront All-items product ordering derived from the existing category order and membership data.
- Shared POS presentation styles and frontend contract/behavior tests.

## Compliance Preconditions

- Existing category persistence and reorder APIs remain unchanged; no database or schema change is included.
- Existing item pricing, stock, tax, checkout, payment, authorization, and audit behavior remain unchanged.
- Storefront continues to show each item once in the All view, prioritizing its earliest-ranked category and sorting items alphabetically within that category.
- No backend source, migration, or persisted tenant data is modified.

## Verification Evidence

The current working tree passed 29 focused POS test files (244 tests), the focused Storefront ordering suite (9 tests), the POS and Storefront production builds, `npm run lint:docs`, `npm run check:architecture`, and `git diff --check`. These checks will be rerun after the branch is synchronized with `develop`.

## Preflight Reconciliation

No live preflight was run for this local change batch: Docker is unavailable in this environment, so the repository's local fixture-based reconciliation command cannot run. The `NOT-EXECUTED-*` reference is the documented PR-open placeholder; the required `no_breach` front-matter value and timestamp are schema placeholders, not evidence of an evaluation. The continuous compliance sweep is expected to evaluate and reconcile the declaration after it reaches `develop`.
