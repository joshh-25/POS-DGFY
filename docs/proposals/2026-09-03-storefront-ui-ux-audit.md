---
status: reference
authority_level: reference
owner: storefront
last_reviewed: 2026-09-03
applies_to: storefront_ui_ux_improvement_backlog
topic: storefront_ui_ux_audit
---

# Storefront UI/UX Audit — Improvement Backlog

## Scope and evidence

Read-only audit of the local DGFY Storefront across Simple MSME, Retail, F&B,
Services, and Hospitality. Evidence included source inspection, a live Retail
product-detail accessibility-tree check, and a live F&B empty-catalog check.
Hospitality remains a booking flow and should not inherit product-cart language.

## Priority 1 — accessibility and task order

1. Ensure product title, price, quantity, and purchase actions precede related
   products and reviews in DOM order. Retail currently uses the F&B product-detail
   renderer, whose desktop layout can expose pairings and reviews first to assistive
   technologies.
2. Remove the off-screen customer-visible duplicate that announces the technical
   tenant slug and repeats hero images. Keep only meaningful semantic storefront
   content in the accessibility tree.
3. Standardize cart drawers as accessible dialogs: dialog semantics, accessible
   title, Escape dismissal, focus containment, focus restoration, and an inert
   background.

## Priority 2 — checkout and catalog clarity

4. In the `empty_setup` catalog state, hide search, filters, vouchers, and cart
   purchase controls; show only the setup explanation and retry action.
5. Remove redundant cart-count and delivery/pickup-flow badges from commerce
   checkout journey headers so F&B, Simple MSME, and Retail match.
6. Use a checkout typography contract: Segoe UI for transactional UI, consistent
   hierarchy, and at least 44px touch targets for mobile actions.
7. Keep long mobile product names legible: use up to two lines or provide a clear
   route to product details instead of silently clipping the name.

## Priority 3 — shared UI foundations

8. Extract neutral product-detail and cart-drawer structural primitives. Preserve
   industry-owned labels, theme tokens, and business rules, but eliminate repeated
   layout and accessibility behavior.
9. Use one map/address interaction primitive across order flows. It must preserve
   saved-location scrolling, prevent page scroll while dragging a map, and lock the
   background when the expanded map is open.
10. Standardize review empty states so an empty reviews section does not compete
    with a storefront's primary catalog or booking task.

## Validation matrix for future improvements

Test each change with populated and empty storefronts across Simple MSME, Retail,
F&B, Services, and Hospitality; guest and signed-in flows where applicable;
delivery-only and pickup-only locations; long names; multiple images; and 360px,
768px, 1024px, and desktop viewports.

## Constraints

- Keep Hospitality booking terminology and flow distinct from product-cart flows.
- Preserve each industry’s brand palette while sharing accessibility, responsive,
  hierarchy, spacing, and interaction standards.
- Do not claim production validation from local source or local-browser evidence.
