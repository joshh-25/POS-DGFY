---
status: reference
owner: engineering
last_reviewed: 2026-10-22
declaration_id: 2026-10-22-item-price-range-2686
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.04.07
verification_evidence: apps/dgfy-api/tests/itemValidator.priceRange.test.js,packages/web-core/src/features/inventory/__tests__/itemPriceLimits.test.js,packages/web-core/src/features/pos/utils/__tests__/editItemSaveErrors.test.js,packages/web-core/src/features/pos/__tests__/additionalCategoriesEdit.behavior.test.jsx,npm run build:pos,node --check apps/dgfy-api/src/validators/itemValidator.js,node scripts/check-app-version-bump.js with develop branch context,git diff --check
rollback_note: Revert the item price validators, shared price-limit helper, POS client checks and validation-message handling, focused tests, and this declaration together. No migration or persisted-data rewrite is included; reverting restores the previous accepted-price range.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T12:01:40.624Z
preflight_request_ref: PREFLIGHT-LOCAL-1792670400688-2026-10-22-ITEM-PRICE-RANGE-2686
---

# Item sale and cost price range validation (#2686)

The API and POS item create/edit flows now reject sale prices and unit costs above the existing
`DECIMAL(10,4)` ceiling of `999999.9999`, with field-specific validation feedback.

## Compliance Impact Classification

Major. The shared POS path has a repository-enforced `major` floor for the `pos` and `terminal`
surfaces. Item creation and editing now reject sale prices and unit costs above `999999.9999`,
matching the existing `DECIMAL(10,4)` item columns. The API remains authoritative, and the POS
checks prevent the same invalid values from being submitted through these forms.

## Affected Surfaces

- `pos` and `terminal` item creation and item editing, including field-specific validation feedback.
- API item create, draft-create, and update validation for `default_sale_price` and `cost_per_unit`.

## Compliance Preconditions

- The maximum matches the precision and scale of the existing item price columns; no migration,
  schema change, or rewrite of stored item data is included.
- Values above the maximum fail validation before persistence and return field-specific 422 details.
- POS forms apply the same limit before issuing a write request. Their existing two-decimal input
  precision remains unchanged; the API accepts the full four-decimal column range.
- Existing null/empty handling, lower bounds, price-versus-cost checks, and item authorization are
  unchanged. This does not alter checkout totals, discounts, tax, receipts, or payment behavior.

## Verification Evidence

The front matter lists the focused API and POS tests, POS production build, API syntax check,
branch-aware app-version check, and `git diff --check`. A local request-time preflight returned
`no_breach` against the repository's ephemeral fixture; it did not access a production environment
or persistent tenant data.

## Preflight Reconciliation

The local request-time preflight returned `no_breach` / `ALLOWED` and allowed the change to proceed.
The reconciliation tool recorded its generated request reference and timestamp in the front
matter. The fixture used an ephemeral MySQL/Redis database and was torn down after the run.
