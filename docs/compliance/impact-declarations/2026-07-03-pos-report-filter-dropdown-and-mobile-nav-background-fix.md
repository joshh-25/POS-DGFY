---
status: reference
owner: engineering
last_reviewed: 2026-07-03
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-03-pos-report-filter-dropdown-and-mobile-nav-background-fix
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.03
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the report-section select dropdown back to the icon button row in PosReportsAnalyticsWorkspace.jsx, and drop the CSS variable fallback on the mobile nav sidebar background in TerminalPageLayout.jsx; no report data, calculation, or navigation routing logic is touched.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-03T00:00:00+08:00
preflight_request_ref: POS-REPORT-FILTER-DROPDOWN-MOBILE-NAV-BG-2026-07-03
---

# POS Report Filter Dropdown and Mobile Nav Background Fix

## Compliance Impact Classification

Major. This change replaces the POS report-section selector's button row with a `<select>` dropdown and fixes a transparent mobile navigation menu background. Both are presentational fixes: report section switching still calls the same `handleSectionChange` handler with the same section ids, and the sidebar background fix only supplies a fallback color for an existing CSS custom property. No report calculation, data-fetching, checkout, payment, or fiscal logic is changed. Classified `major` per the `pos`/`terminal` surface floor since both files are POS-surface components.

## Affected Surfaces

1. `frontend/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx` — the Daily/Monthly/Yearly/Comparison/Profit-Loss report section switcher changes from a row of icon buttons to a single `<select>` dropdown. Unused icon imports (`BarChart3`, `CalendarRange`, `LineChart`, `PieChart`, `Receipt`) are removed since icons are no longer rendered per-option; `handleSectionChange` and `REPORT_SECTIONS` ids are unchanged.
2. `frontend/src/features/pos/components/TerminalPageLayout.jsx` — the mobile navigation slide-in overlay's background now falls back to `#FFFFFF` when `--pos-shell-sidebar` is unset (`var(--pos-shell-sidebar, #FFFFFF)`), fixing a transparent/see-through mobile menu.

## Compliance Preconditions

1. Report data source, date-range/granularity resolution, and all POS report calculations (sales, profit/loss, comparisons) remain unchanged.
2. Checkout totals, VAT breakdown, DGFY fee calculation, payment method handling, discounts, and order submission behavior remain unchanged.
3. POS terminal lock, DGFY unlock, legacy grace login, terminal ID, shift, and compliance gate behavior remain unchanged.
4. No backend routes, repositories, models, migrations, payment files, or production environment configuration are changed.
5. The report-section dropdown must offer the same five sections (`daily`, `monthly`, `yearly`, `comparison`, `profit_loss`) and invoke the same `handleSectionChange` callback as the prior button row.
6. The mobile nav sidebar must render an opaque, non-transparent background in both the themed (`--pos-shell-sidebar` set) and fallback (`#FFFFFF`) cases.

## Verification Evidence

The commands listed in front matter must pass before deployment. Manual verification: confirm the POS report page's section selector is a dropdown that switches between all five report sections correctly; confirm the mobile hamburger navigation menu renders a solid, opaque background instead of a transparent/see-through panel.
