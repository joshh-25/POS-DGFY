---
status: reference
owner: engineering
last_reviewed: 2026-08-06
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-08-06-pos-history-scroll-clipping-and-msme-card-radius-parity
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.06
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert POSTransactionHistoryPanel.jsx's single-region scroll wrapper back to the separate min-h-0 flex-1 overflow-hidden / h-full overflow-auto table-only scroll area; no history data-fetching, receipt, or void/report action logic is touched, so rollback is a straight file revert with no data migration. SimpleProductCard.jsx's radius revert (10 back to 20/28 card, 12/18 button) is presentational only.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-06T00:00:00+08:00
preflight_request_ref: POS-HISTORY-SCROLL-CLIPPING-MSME-CARD-RADIUS-2026-08-06
---

# POS History Scroll-Clipping Fix and MSME Product Card Radius Parity

## Compliance Impact Classification

Major. This change fixes a mobile layout bug in the POS Transaction History panel where the filter buttons/table/pagination below the date filters could be clipped instead of scrolling into view, and brings MSME's storefront product card radius in line with Retail's already-updated flat 10px radius. Neither touches history data-fetching, receipt actions, checkout, or any calculation logic — both are presentational fixes. Classified `major` per the `pos`/`terminal` surface floor since `POSTransactionHistoryPanel.jsx` is a POS-surface file.

## Affected Surfaces

1. `frontend/src/features/pos/components/POSTransactionHistoryPanel.jsx` — **Fix: History panel content clipped below the date filters.** Previously, only the table had its own scroll region (`min-h-0 flex-1 overflow-hidden` wrapping a `h-full overflow-auto` inner div), separate from the search/filter bar above it. On mobile, a tall stacked filter grid could push the table/pagination/action buttons below it far enough down that they were clipped by ancestor `overflow-hidden` containers in `POSCheckoutTerminal.jsx`, instead of the whole panel scrolling to reveal them — making the buttons and records below the date filters appear to not load or render. Fixed by wrapping the entire panel (search/sync bar, filter grid, table, pagination) in a single scrollable region (`min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y`) and removing the now-redundant inner table-only scroll wrapper, so the whole panel scrolls together as one region and nothing below the filters can be clipped off-screen.
2. `frontend/apps/store/src/modes/simple/storefront/components/SimpleProductCard.jsx` — **Fix: MSME product card/button corner radius mismatch vs. Retail.** MSME's card still used its original rounder radius (`20`/`28` mobile:desktop card corners, `12`/`18` button corners) while Retail's equivalent card (`RetailProductCard.jsx`) had already been changed to a flat `10` in an earlier pass, leaving the two default-like storefront modes visually inconsistent. Changed MSME's card and "Add to Order" button corners to the same flat `10` Retail uses, on every viewport.

## Compliance Preconditions

1. `POSTransactionHistoryPanel.jsx`'s history data-fetching, filtering, pagination logic, and receipt/void/report row actions are unchanged — only the scroll-container structure changes; no rows, columns, or action availability differ.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged by either fix in this declaration.
3. The single-region scroll change is a mobile/tablet-relevant fix; desktop (`xl:` row layout, unaffected by filter-grid stacking) is not expected to visually change, since the table already fit without scrolling there.
4. MSME's card radius change is a pure styling value change (`borderRadius`); no underlying item data, availability logic, or "Add to Order" click behavior is altered.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: on a mobile viewport, confirm the POS Transaction History panel's filter buttons, table rows, and pagination controls below the date filters are all reachable by scrolling the panel as one region (nothing clipped/cut off); confirm the desktop table layout is unchanged. On the MSME storefront catalog, confirm product cards and their "Add to Order" buttons render with the same flat corner radius as Retail's product cards.
