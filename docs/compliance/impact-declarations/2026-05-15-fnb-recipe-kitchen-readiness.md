---
status: reference
owner: engineering
last_reviewed: 2026-05-15
related_adr: 0019-food-and-beverage-mode-full-service-restaurant.md
declaration_id: 2026-05-15-fnb-recipe-kitchen-readiness
classification: major
surfaces: pos,terminal
reason_codes_impacted: FNB_RECIPE_INGREDIENT_SHORTFALL,FNB_RECIPE_UOM_INCOMPATIBLE,FNB_KITCHEN_ORDER_UNAVAILABLE
policy_version: 2026.05.15
verification_evidence: npm run qa:fnb-readiness,npm run lint:docs,npm run check:architecture,git diff --check
rollback_note: Revert the F&B recipe helper, POS and Storefront kitchen-ticket patches, and UI shortfall messaging; then rerun POS checkout and Storefront F&B tests before restoring the previous checkout behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-15T14:54:13+08:00
preflight_request_ref: FNB-RECIPE-KITCHEN-READINESS-2026-05-15
---

# F&B Recipe Kitchen Readiness

## Compliance Impact Classification

Major.

This declaration covers the F&B recipe-driven checkout and kitchen-ticket readiness work. It affects POS checkout blocking, cashier-facing terminal guidance, Storefront checkout acceptance, and F&B kitchen ticket lifecycle behavior. It does not change fiscal compliance state, payment authorization, tax calculation, receipt issuance, compliance downgrade behavior, or tenant compliance policy decisions.

## Affected Surfaces

- POS checkout now runs shared F&B recipe preflight before accepting an F&B sale and returns structured blocker details for ingredient shortfalls or incompatible recipe units.
- POS kitchen-ticket creation now avoids duplicate active tickets, links transaction/check context, and snapshots recipe movement metadata for kitchen operations.
- Storefront F&B quote and checkout use the same recipe availability contract before accepting online orders.
- Storefront and POS terminal UI now show cashier/customer-safe F&B blocker messages instead of generic checkout failures.
- F&B kitchen queue displays source, station/check context, line quantities, and recipe movement counts from ticket snapshots.

## Compliance Preconditions

1. F&B recipe checkout must remain restaurant-native and must not expose manufacturing job orders in F&B navigation or checkout.
2. Ingredient stock checks must complete before transaction or online order acceptance when the menu item requires recipe consumption.
3. Shortfall and UOM incompatibility failures must be non-fiscal validation failures and must not create partial payment, receipt, or transaction artifacts.
4. Idempotent POS and Storefront retry behavior must not duplicate kitchen tickets or ingredient deductions.
5. Compliance lifecycle gates remain owned by existing compliance middleware and must not be bypassed by F&B kitchen-ticket creation.

## Verification Evidence

- `npm run qa:fnb-readiness`
- `npm run lint:docs`
- `npm run check:architecture`
- `git diff --check`
