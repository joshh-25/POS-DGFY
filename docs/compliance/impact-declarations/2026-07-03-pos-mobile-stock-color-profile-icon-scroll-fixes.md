---
status: reference
owner: engineering
last_reviewed: 2026-07-03
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-03-pos-mobile-stock-color-profile-icon-scroll-fixes
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.03
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert getMobileStockNameColorClassName and its use on the mobile catalog item name, revert the profile-icon wrapper split in TerminalOperationsWorkspace.jsx's SettingsWorkspace, and revert the h-full/overflow-hidden -> h-auto/overflow-visible (xl:-gated) layout classes in POSCheckoutTerminal.jsx and TerminalPageLayout.jsx; no stock data, storefront asset upload, or checkout logic is touched, so rollback is a straight file revert.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-03T00:00:00+08:00
preflight_request_ref: POS-MOBILE-STOCK-COLOR-PROFILE-ICON-SCROLL-FIXES-2026-07-03
---

# POS Mobile Stock Color Coding, Profile Icon, and Catalog Scroll Fixes

## Compliance Impact Classification

Major. This change adds a presentational stock-level color indicator to mobile catalog item names, fixes a layout bug where the storefront profile icon was clipped on mobile, and fixes an unscrollable Sell/catalog screen on mobile and tablet viewports by relaxing fixed-height/overflow-hidden classes to auto-height/visible below the `xl` breakpoint. No stock values, calculations, asset data, or checkout/cart logic are read or written differently than before — only rendering (color class, wrapper structure, and height/overflow utility classes) changes. Classified `major` per the `pos`/`terminal` surface floor since all three files are POS-surface components.

## Affected Surfaces

1. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` — mobile-only (`sm:hidden`): adds `getMobileStockNameColorClassName(stockValue, isAlwaysAvailable)`, applied only to the catalog item name's text color class (green for always-available or stock > 100, yellow for 0 < stock ≤ 100, red for stock ≤ 0 or non-numeric/missing stock). No other classes on that element change, so there is no layout shift. Also fixes the Sell/catalog pane being unscrollable below the `xl` breakpoint: `shellClassName`, `checkoutGridClassName`, `catalogViewportClassName`, `catalogPaneHeightClassName`, and the catalog scroll container's className move from unconditional `h-full`/`overflow-hidden` to `h-auto`/`overflow-visible` with the prior fixed-height/scroll behavior preserved only at `xl:` and above.
2. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` — in `SettingsWorkspace`'s Storefront Media section, the circular profile-icon wrapper is moved outside the cover photo's `overflow-hidden` container on mobile (`sm:hidden` block) so the icon's `-bottom-8` overlap offset is no longer clipped by that container. The cover photo's own rendering and clipping (`rounded-xl`, `overflow-hidden`) is untouched; the existing structure is preserved unchanged at `sm:` and above (`hidden sm:block`).
3. `frontend/src/features/pos/components/TerminalPageLayout.jsx` — `workspaceSectionClassName` and the checkout-workspace wrapper div move from unconditional `h-full` to `h-auto`/`xl:h-full`, part of the same catalog-scroll fix (so the workspace container doesn't force a fixed height below `xl` that could clip/prevent scrolling of the sell catalog).

## Compliance Preconditions

1. Stock values used for color coding are read directly from `item.current_stock` on every render (no caching/staleness); the color coding does not alter `current_stock`, inventory, or any backend value.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
3. Storefront cover/profile asset upload, storage, and retrieval logic (`resolveAssetUrl`, `storefrontAssets`) is unchanged; only the wrapping markup around the existing profile-icon preview element changes.
4. All height/overflow class changes are gated so the previous fixed-height, `overflow-hidden`/`overflow-y-auto` scroll behavior is fully preserved at `xl:` and above; only viewports below `xl` (mobile and tablet) get the relaxed `h-auto`/`overflow-visible` behavior that fixes the scroll bug.
5. Desktop (`>=xl`) catalog card content, profile/cover media layout, and workspace section height are pixel-equivalent to pre-change behavior.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a mobile viewport, confirm catalog item names render green/yellow/red according to stock level (and green for always-available items), confirm the storefront profile icon in Settings no longer has its bottom clipped by the cover photo container, and confirm the Sell/catalog screen scrolls correctly on mobile and tablet; confirm desktop (`>=xl`) catalog layout and scroll behavior are unchanged.
