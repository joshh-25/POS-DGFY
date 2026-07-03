---
status: reference
owner: engineering
last_reviewed: 2026-07-03
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-03-pos-mobile-ui-responsive-layout
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.03
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the mobile-only className/layout changes, the tailwind pos-slide-in keyframe, and the mobileSearchExpanded UI state; no checkout calculation, payment, fiscal receipt, or terminal session logic is touched, so rollback is a straight file revert with no data migration.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-03T00:00:00+08:00
preflight_request_ref: POS-MOBILE-UI-RESPONSIVE-LAYOUT-2026-07-03
---

# POS Mobile UI Responsive Layout

## Compliance Impact Classification

Major. This change is a mobile-viewport (`<640px`, Tailwind `sm`/`max-sm`) presentational rework of existing POS terminal screens. It reorganizes markup and Tailwind utility classes for responsive layout and adds a transform/opacity-only page-transition animation. No backend routes, calculation logic, receipt/fiscal document generation, payment handling, or terminal session/auth behavior is changed. Classified `major` (not `minor`) per the `pos`/`terminal` surface floor in `docs/compliance/compliance-classification-matrix.md`, since these are POS-surface files.

## Affected Surfaces

1. `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` — catalog card layout (horizontal card on mobile), expandable mobile search bar (`mobileSearchExpanded` local UI state), Filter/Scan button width, keyed wrappers for Sell/History slide-in animation.
2. `frontend/src/features/pos/components/POSBarcodeScanner.jsx` — added a passthrough `className` prop to the Scan button (no behavioral change).
3. `frontend/src/features/pos/components/POSTransactionHistoryPanel.jsx` — filter and pagination control layout reflow for mobile.
4. `frontend/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx` — mobile-only filter row regrouping (Payment/Source/Category, Date From/To/Range/Cashier) using `sm:hidden` / `sm:contents` blocks alongside the existing desktop layout.
5. `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` — mobile upload button for the gallery image row, equal-width shift tab buttons on mobile, keyed wrapper for the operations sub-page slide-in animation.
6. `frontend/src/features/pos/components/TerminalPageLayout.jsx` — keyed wrappers so the checkout/operations workspace containers unmount/remount on mode switch, driving the slide-in animation.
7. `frontend/tailwind.config.js` — new `pos-slide-in` keyframe (`translateX`/`opacity` only) and animation utility, mobile-gated via `max-sm:animate-pos-slide-in`.

## Compliance Preconditions

1. Fiscal receipt status, receipt rendering, and document-type classification remain unchanged.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
3. POS terminal lock, DGFY unlock, legacy grace login, terminal ID, shift, and compliance gate behavior remain unchanged.
4. No backend routes, repositories, models, migrations, payment files, or production environment configuration are changed.
5. All new layout, animation, and mobile-search-toggle behavior is gated to mobile breakpoints (`max-sm:` / `sm:hidden` / `sm:contents`) or is additive UI-only state (`mobileSearchExpanded`); desktop and tablet (`>=640px`) rendering and interaction are unchanged.
6. The `pos-slide-in` animation uses `transform`/`opacity` only (no layout-affecting properties) and is scoped with `max-sm:` so it never runs at `>=640px`.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: confirm mobile viewport (`<640px`) renders the reorganized catalog card, expandable search bar, regrouped report/history filters, equal-width shift tabs, and the mobile gallery upload button; confirm desktop/tablet (`>=640px`) rendering is pixel-identical to the pre-change layout; confirm Sell↔History and Checkout↔Operations transitions animate on mobile only.
