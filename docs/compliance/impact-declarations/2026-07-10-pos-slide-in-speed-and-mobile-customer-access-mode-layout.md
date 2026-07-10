---
status: reference
owner: engineering
last_reviewed: 2026-07-10
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-10-pos-slide-in-speed-and-mobile-customer-access-mode-layout
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.10
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the catalog-slide-enter animation duration in index.css back to 50ms, and revert the Customer Access Mode option-card className in TerminalOperationsWorkspace.jsx's SettingsWorkspace back to the single flex-col centered layout (dropping the mobile grid-cols-[auto_1fr] variant); no customer access mode selection/persistence logic is touched, so rollback is a straight file revert.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T00:00:00+08:00
preflight_request_ref: POS-SLIDEIN-SPEED-MOBILE-CUSTOMER-ACCESS-LAYOUT-2026-07-10
---

# POS Slide-In Animation Speed and Mobile Customer Access Mode Layout

## Compliance Impact Classification

Major. This change tunes the duration of an existing mobile page-transition animation and reworks the mobile layout of the Customer Access Mode option cards in POS Settings. Neither touches customer access mode selection, persistence, or policy evaluation logic — only a CSS animation-duration value and Tailwind layout classes change. Classified `major` per the `pos`/`terminal` surface floor since `TerminalOperationsWorkspace.jsx` is a POS-surface file.

## Affected Surfaces

1. `frontend/src/index.css` — the `.catalog-slide-enter` mobile-only (`max-width: 639.98px`) animation duration changes from `50ms` to `33.34ms`. This is the same page-switch/add-to-cart slide-in animation introduced in `2026-07-09-pos-mobile-schedule-layout-checkout-animations-bulk-meter.md`; only the speed is adjusted, the keyframe (translateX/opacity) and mobile gating are unchanged.
2. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` — in `SettingsWorkspace`, the Customer Access Mode option cards (`option.value`/`ModeIcon`/label/description/"Applied automatically" badge) switch to a compact 2-column grid on mobile (`grid grid-cols-[auto_1fr]`): the mode icon spans both rows on the left (`row-span-2`) with the label and description auto-flowing into the right column, and the selected-badge spanning both columns below. At `sm:` and above, the original vertical, centered card layout (`sm:flex sm:flex-col sm:items-center ... sm:text-center`) is preserved unchanged.

## Compliance Preconditions

1. `setStorefrontForm`/`customerAccessMode` selection logic, the `onClick` handler, and `effectiveCustomerAccessMode` badge text/logic are unchanged — only the option card's className and internal markup layout change.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged; this change touches only the Settings-tab customer access mode selector UI and an unrelated CSS animation timing value.
3. The `catalog-slide-enter` animation remains transform/opacity only and remains gated to `<640px`; no layout-affecting property is introduced by the speed change.
4. Desktop/tablet (`>=640px`) rendering of the Customer Access Mode cards and the page-transition animation timing (unaffected, since `catalog-slide-enter` itself is mobile-only) are unchanged.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a mobile viewport, confirm the Sell/History/workspace page-switch and add-to-cart fly animations still play at the new, faster duration without visual glitching; confirm the Customer Access Mode cards in POS Settings render as a compact icon-left/text-right row on mobile with the icon spanning both text rows, and confirm the desktop/tablet centered card layout is unchanged.
