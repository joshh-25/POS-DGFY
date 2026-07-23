---
status: reference
owner: engineering
last_reviewed: 2026-07-20
declaration_id: 2026-07-20-pos-mobile-catalog-best-seller-tagging
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: POS_CATALOG_PRESENTATION,POS_BEST_SELLER_TAGGING_POLICY
policy_version: 2026.07.20
verification_evidence: backend-architecture-guardrails,backend-controller-boundaries,frontend-lint
rollback_note: Revert the four changed files together; no transaction, payment, receipt, or inventory records are migrated or rewritten, and the new daily_top_enabled setting defaults to false.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-20T06:47:40+00:00
preflight_request_ref: POS-DEVELOPMENT-2026-07-20
---

# POS Mobile Catalog Presentation And Best Seller Tagging

## Compliance Impact Classification

Major. This work changes mobile-only POS catalog presentation (stock name coloring, out-of-stock item visibility) and adds a manual per-item Best Seller override plus a new daily top-1 auto-tagging mode alongside the existing 30-day/top-3 policy. It does not change payment authorization, fiscal receipt generation, transaction totals, or inventory movements.

## Affected Surfaces

- POS catalog (mobile only): item name color now reflects stock level directly (green/yellow/red, always-available items stay green) instead of the desktop gray treatment; out-of-stock items remain visible (locked/grayed) instead of being hidden from the list. Desktop/tablet catalog behavior is unchanged.
- POS item create/edit: a mobile-only Best Seller switch lets staff manually force or clear the Best Seller tag on an item, replacing the prior desktop-only select control.
- POS Setup settings: a new "daily top seller" autotagging toggle (top 1 item by completed paid quantity over the previous 1 day) is added alongside the existing 30-day/top-3 auto-tagging toggle; both are independently configurable and validated server-side.

## Compliance Preconditions

- No changes to checkout, payment authorization, receipt rendering, or fiscal/non-fiscal document contracts.
- No changes to inventory quantities, stock movements, or transaction records.
- Best Seller tagging (manual or auto) is presentation-only metadata on `pos_catalog_overrides` / `system_settings`; it does not affect pricing, stock, or sale eligibility.
- New `daily_top_enabled` setting defaults to `false` and is additive to the existing `pos_best_seller_settings` schema.

## Verification Evidence

- Backend architecture guardrails and controller-boundary checks (pre-commit).
- Frontend lint on the changed POS components.
- Manual compliance preflight run against `POST /api/v1/compliance/preflight` for surfaces `pos, terminal, settings` — result `no_breach`, reason code `ALLOWED`.
