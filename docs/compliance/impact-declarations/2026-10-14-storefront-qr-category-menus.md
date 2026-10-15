---
status: reference
owner: engineering
last_reviewed: 2026-10-14
declaration_id: 2026-10-14-storefront-qr-category-menus
classification: major
surfaces: api,storefront,opis,database,payments,pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.10.14
verification_evidence: API architecture guardrails and controller-boundary checks, tenant schema coverage check for the QR migration, focused QR API/OPIS/Storefront tests, POS and Storefront production builds
rollback_note: Revert the QR management API, migration, OPIS module, and Storefront category-route changes together. The migration is additive and rollback must preserve existing catalog categories and products.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-14T16:41:01+08:00
preflight_request_ref: NOT-EXECUTED-2026-10-14-STOREFRONT-QR-CATEGORY-MENUS
---

# Storefront QR category menus

## Compliance Impact Classification

**Major.** The compliance floor is mechanical: the shared Store catalog repository
and use-case paths are classified as payment-adjacent by the compliance matrix.
This change adds branch-scoped QR resolution and a public category-menu projection;
it does not alter prices, tax calculation, payment authorization, or transaction
settlement.

## Affected Surfaces

- OPIS QR-code management and QR target configuration.
- Storefront QR entry routing, category-specific menu rendering, and cart handoff.
- Store catalog API QR-token resolution and secondary-category projection.
- Tenant database QR-code metadata migration.

## Compliance Preconditions

- QR records are scoped to the owning tenant and branch/location.
- Public QR tokens resolve only active, authorized storefront targets.
- Catalog data remains sourced from the existing Store catalog read path.
- Cart and checkout continue through the existing storefront order flow.
- QR presentation changes do not change money, tax, payment, or refund semantics.

## Verification Evidence

- API architecture guardrails and controller-boundary checks passed.
- Tenant schema registry coverage passed for the QR migration.
- `git diff --cached --check` passed for the staged batch.
- Focused QR API, OPIS, and Storefront tests are included in this change.
- Production builds for the affected POS/Storefront surfaces passed before commit preparation.

This declaration records the local implementation commit only. No compliance
preflight, push, deployment, or production operation was performed in this turn.
