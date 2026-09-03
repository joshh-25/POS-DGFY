---
status: reference
authority_level: reference
owner: storefront
last_reviewed: 2026-09-03
review_by: 2027-03-03
applies_to: storefront_product_card_configuration_routing
topic: storefront_configurable_product_card_plan
---

# Storefront Configurable Product-Card Plan

## Assessment

This is a sound cross-industry behavior, but it must use POS-provided capability data, not business-mode names or keyword matching. The current Storefront API exposes generic `fnb_modifier_groups` for catalog modes, including retail-style add-ons such as gift wrapping. Retail already uses the shared item-details renderer; Simple MSME can use the same item route. Services must retain their service-detail route because their options are booking-specific.

## Recommended behavior

| Item capability | Card CTA behavior | Route and cart result |
| --- | --- | --- |
| No visible configuration | **Add to Cart** | Adds immediately; no route change. |
| Any visible variation, modifier, or add-on group | **Customize** / **Choose options** | Opens the item-details route; nothing is added yet. |
| Service with selectable options | **Customize service** | Opens its existing booking-detail route; nothing is added yet. |

Optional add-ons are also configurable. Otherwise, customers cannot choose optional extras from a quick-add card.

The primary CTA follows the table. The image and title remain detail-browsing actions; making a non-configurable card tap immediately add an item would create accidental cart additions.

## Implementation plan

1. Create a neutral shared capability helper, for example `requiresStorefrontConfiguration(item)`.
   - Read only public catalog fields: active, storefront-visible groups with valid options.
   - Normalize API variants such as `fnb_modifier_groups` safely.
   - Do not infer configuration from item names, category names, or industry type.
2. Update product-card actions in F&B, Retail, Simple MSME, and default product storefronts.
   - Use the helper before `addToCart`.
   - Configurable item: route to details and show **Customize**.
   - Plain item: retain immediate quick-add and cart fly animation.
   - Preserve disabled and out-of-stock behavior.
3. Reuse the existing canonical product route.
   - `/tenant-store/{store-slug}/item?item={item-id}&location_id={location-id}`
   - Use `buildItemDetailTarget`, not hand-built URLs, so custom domains, browser history, branch selection, and back navigation remain correct.
4. Keep Services separate but equivalent.
   - Use service option groups to open `/service?service={id}&location_id={id}` when setup is required.
   - Retain direct add only for services with no selectable options.
5. Prevent cart and detail-state leakage.
   - Opening details must never create a cart line.
   - Reset draft modifiers and variations when route item, store slug, or location changes.
   - Add to cart only after the customer confirms configuration from the correct item-details page.
   - Preserve existing cart storage scope by storefront and location; add cross-store regression tests.
6. Validate before commit.
   - Unit tests for plain versus configurable capability detection.
   - Card tests for immediate add versus redirect.
   - Routing tests for slug, item ID, and `location_id`.
   - Cart-isolation test: configure/add in Store A, open Store B, and verify Store B's cart is unchanged.
   - Desktop/mobile rendered checks for Retail, F&B, Simple MSME, and Services.
   - Storefront lint, targeted tests, build, and architecture check.

## Architecture classification

This is within the existing frontend boundary. No backend payload or ADR change is expected. It follows Storefront ownership and configuration-driven mode rules in [ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md) and [ADR 0014](../architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md).

No configurable-product-card code has been changed by this document. It is an approved implementation plan for a later scoped change.
