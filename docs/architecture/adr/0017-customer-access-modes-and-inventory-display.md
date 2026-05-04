---
status: accepted
date: 2026-05-03
last_reviewed: 2026-05-04
classification: authoritative
---

# ADR 0017: Customer Access Modes And Inventory Display Controls

## Context
The existing onboarding classifier exposes `visibility_mode` values (`ghost`, `catalog`, `inquiry`, `transaction`) as advisory classification output only. Product language now needs to describe the actual customer-facing capability: what a customer can see or do after finding a tenant storefront.

This change follows `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0006, ADR 0007, ADR 0008, ADR 0009, ADR 0010, ADR 0013, ADR 0014, and ADR 0016. It is a cross-boundary change because it touches tenant-local settings, onboarding classification, Storefront discovery/profile/catalog/checkout behavior, customer-facing UI, inventory visibility, compliance/payment readiness, telemetry, and documentation.

## Decision
- Introduce Customer Access Mode as the runtime storefront capability contract. Keep internal v1 codes compatible with the existing classifier: `ghost`, `catalog`, `inquiry`, and `transaction`, with user-facing labels `Map Listing Only`, `Catalog Only`, `Inquiry Mode`, and `Online Ordering Mode`.
- Add tenant-local settings for `customer_access_mode` and `inventory_display_mode` in `system_settings`. Use `catalog` and `availability` as default values for existing tenants.
- Keep `visibility_mode` as a backward-compatible alias in onboarding snapshots during migration. New UI copy must use Customer Access Mode.
- Compute an effective customer access mode from the saved requested mode and the declared/verified readiness stage. Storefront public behavior must use the effective mode, not only the raw saved setting.
- Registration-stage guidance is enforced for customer checkout and payment capability. Tenant UI should guide and limit normal selection, while backend quote/checkout/payment paths fail closed when the effective mode does not allow the requested action.
- Inquiry Mode v1 uses existing tenant contact channels as the customer action. It does not add a persisted lead/inquiry inbox until a separate lead-management contract is approved.
- Inventory Display is independent from Customer Access Mode. It controls customer-facing stock presentation only; exact stock remains server-side unless `inventory_display_mode=exact_quantity`.
- Item-level storefront catalog visibility is independent from POS visibility. Inventory-facing users control this with `storefront_catalog_overrides.storefront_visible`, while POS continues to use `pos_catalog_overrides.pos_visible`.
- Storefront item images are independent from POS menu images. Storefront catalog reads prefer `storefront_catalog_overrides.storefront_image_url` and use POS image data only as rollout/backfill fallback.

## Mode Contract
| Internal code | Label | Customer can see | Customer can do |
|---|---|---|---|
| `ghost` | Map Listing Only | Business name, category, location, basic contact | Find or contact the business |
| `catalog` | Catalog Only | Catalog/menu/services, photos, prices, availability presentation | Browse only |
| `inquiry` | Inquiry Mode | Catalog plus contact/inquiry calls to action | Contact, request availability, ask for a quote |
| `transaction` | Online Ordering Mode | Purchasable or bookable catalog entries | Order, book, and pay when payment readiness allows |

Inventory display modes:

| Code | Public presentation |
|---|---|
| `hidden` | No stock/availability text |
| `availability` | `Available`, `Not available`, or `Bookable` |
| `low_stock` | Availability plus low-stock copy such as `Only 3 left` under the configured threshold |
| `exact_quantity` | Exact public quantity when the tenant explicitly chooses it |

## Consequences
- Storefront discovery and profile responses need additive access-mode metadata and cache invalidation after settings changes.
- Storefront catalog responses must continue hiding `cost_per_unit`; quantity fields must be normalized through inventory display policy instead of exposing raw stock by default.
- Public Storefront catalog and checkout eligibility must read item-level storefront overrides when available. During additive rollout, a missing `storefront_catalog_overrides` table may fall back to the prior POS-derived policy with warning logging instead of returning `500`.
- POS catalog responses and terminal eligibility must remain sourced from POS overrides only. Image upload/removal must not silently enable either POS or Storefront visibility.
- Quote, checkout, and service booking public mutations must fail closed when the effective mode is not `transaction`.
- Onboarding remains a soft reminder per ADR 0013, but its business classification step should become the first capture point for Customer Access Mode and Inventory Display preferences.
- Settings > Storefront becomes the long-term source-of-truth surface for changing these controls after onboarding.
- No architecture allowlist exception is required.

## Validation
- Run `npm run check:architecture` and `npm run lint:docs`.
- Add backend tests for mode normalization, effective mode derivation, settings validation, storefront catalog serialization, and quote/checkout blocking.
- Add frontend tests for onboarding wording, Settings deep link ownership, Storefront CTA suppression/replacement, inventory display labels, and checkout panel gating.
- Add compatibility tests proving legacy `visibility_mode` snapshots still deserialize and expose a `customer_access_mode` alias.
- Add catalog split tests proving POS image upload preserves `pos_visible=false`, Storefront image upload preserves `storefront_visible=false`, Storefront catalog reads filter on `storefront_visible`, and POS catalog reads filter on `pos_visible`.

## Addendum: Item-Level Storefront Catalog Overrides (2026-05-03)

The Storefront catalog now has an additive tenant-local override table, `storefront_catalog_overrides`, with item-level visibility and image fields. Migration backfills preserve existing production behavior by deriving initial storefront visibility and images from the previous POS-derived policy before runtime reads switch to the new table.

This addendum does not change Customer Access Mode. Customer Access Mode controls whether the tenant storefront can be browsed, queried, or used for ordering overall. `Show in Storefront` controls whether a specific item appears in the customer-facing catalog when the effective Customer Access Mode permits catalog browsing.

## Addendum: Storefront Fallback Boundary Hardening (2026-05-04)

After the additive table exists, Storefront catalog runtime reads must not treat a missing per-item Storefront override row as permission to inherit POS visibility or POS menu images. Row-missing behavior uses the Storefront default item policy: finished-goods products are visible by default, service rows follow service storefront metadata, and Storefront images remain empty unless a Storefront image override exists.

POS-derived visibility and POS image data are now compatibility fallback only when the `storefront_catalog_overrides` table itself is unavailable during rollout. This preserves rollback safety without re-coupling item-level Storefront catalog state to POS state after migration.

Image replacement is also sequenced for deploy safety: POS and Storefront uploads store the new file, commit the override update, and then best-effort remove the prior file. If the database update fails after storage succeeds, the newly stored file is removed and the old image remains in place.

## Addendum: Production Hardening And Controlled Rollout (2026-05-04)

Runtime enforcement remains default-off through `CUSTOMER_ACCESS_MODES_ENABLED=false`, while controlled tenant rollout is supported through `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS`.

Public discovery index rows materialize Customer Access metadata (`customer_access_mode`, `effective_customer_access_mode`, `max_customer_access_mode`, `inventory_display_mode`, low-stock threshold, `access_capabilities`, limitation reason, and rollout-enabled state) so discovery UI can hide order/cart CTAs before tenant profile load without tenant DB fanout.

Settings updates, onboarding business-classification saves, tenant location changes, and storefront asset changes refresh storefront discovery after successful use-case results. Runtime schema readiness treats the discovery-index Customer Access migration and columns as required for environments that claim this rollout.

Validation evidence must include targeted policy/settings/onboarding/store/service/discovery tests, Storefront helper tests, docs lint, architecture checks, Storefront build, SKUpervisor build, and whitespace diff checks before enabling the rollout broadly.
