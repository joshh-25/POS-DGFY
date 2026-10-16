---
status: reference
authority_level: reference
owner: pos-platform
last_reviewed: 2026-10-16
applies_to: apps/dgfy-pos, packages/web-core
topic: pos_affiliates_ui
---

# POS Affiliates UI

## Scope

This document records the frontend-only redesign of POS > Affiliates. The page keeps the existing affiliate service calls, permissions, audit fields, invitation flow, commission controls, QR/share-link flow, price-rule flow, and cashout actions. No backend route, database table, migration, API contract, or server-side calculation was changed.

The page entry point remains `packages/web-core/src/features/pos/components/AffiliatesWorkspacePanel.jsx`, so the existing POS route and terminal workspace integration do not change.

## Added and redesigned UI parts

The following parts were added or rearranged in the frontend:

1. A three-part secondary navigation for **Affiliates List**, **Cashout**, and **Settings**. The active tab uses the same compact sizing, spacing, blue underline, overflow behavior, and keyboard tab navigation pattern as the POS Items navigation. Switching tabs is local page state and does not make a new API request.
2. An Affiliates List toolbar with client-side search, a status filter, and an Invite Affiliate action.
3. Five summary cards for total affiliates, active affiliates, affiliate sales, commissions owed, and cashout requests.
4. An Items-style affiliate table with the shared POS table surface, compact local table density, a non-sliding table surface, responsive mobile records, row actions, and a pagination footer placed outside the table surface in the same way as POS Items.
5. A local status filter for active, pending, suspended, revoked, and all affiliate records.
6. A frontend-only invite dialog. It collects the same email and optional rate override as the previous form and calls the existing invite service only after submission.
7. A Cashout view with search, status filtering, four status summary cards, a cashout table, local CSV export, row action dialogs, and shared POS pagination placed outside the table surface.
8. A Settings view with the requested two-column layout for Program Settings and Selling Price cards, with responsive stacking on smaller viewports.
9. Reset All controls for unsaved Program Settings and Selling Price changes. Reset only restores the values loaded from the API in the current page session; it does not write anything.
10. Responsive shared dialogs for the existing commission-rate editor, share link/QR code, suspend/reactivate/revoke controls, per-affiliate price override, cashout approval/rejection, and payment reference entry.
11. Pending invite management is shown below the **Affiliates List** table so pending invitations remain discoverable beside enrolled affiliate records. Settings remains focused on program configuration.
12. The Affiliate workspace now uses the borderless page-level frame used by the POS settings workspaces; internal cards and table surfaces retain their own outlines.

## Preserved behavior

- Existing permissions still decide whether the user can view, manage, configure, approve, or pay.
- Existing locked-terminal, offline, loading, error, and retry states remain available.
- Existing affiliate names, emails, short codes, statuses, commission rates, earning balances, joined dates, and revocation audit fields remain visible.
- The status audit still shows the recorded timestamp, tenant user ID, and reason, including the existing fallback text for missing values.
- Existing invitation cancellation, affiliate status changes, reactivation, commission-rate updates, QR payload loading, template price rules, per-affiliate price overrides, cashout approval, payment, and rejection actions call the same service functions as before.
- Existing backend monetary units and commission-rate units are preserved: centavos for money and basis points for rates.

### Enrollment status controls

The frontend follows the status contract exposed by the affiliate API:

- Active enrollments can share their link, be suspended, or be revoked.
- Suspended and revoked enrollments can be reactivated through the dedicated reactivation endpoint.
  The frontend does not fall back to the generic enrollment PATCH because the current contract
  rejects `status: 'active'` there and the dedicated route performs the required slot check.
- Pending enrollment records do not receive an approval button because the `develop` API has no
  pending-enrollment approval transition. A normal email invite is a separate pending invite
  record, managed below the Affiliates List table; accepting it creates an active enrollment. Pending, suspended, and
  revoked enrollments do not show a share-link control because public attribution resolves active
  enrollments only. Rate, price-override, and revoke controls remain available where their existing
  service endpoints support them.

## Data semantics

The current affiliate list API does not provide an attributed-sales total. The Affiliate Sales card and Sales (PHP) column therefore show `—` when no optional sales field is present. The UI does not fabricate sales values. If a compatible existing response field is already present, the page can display it without changing the API.

Commissions owed and unpaid balance use the existing pending plus available earning fields. Cashout totals use the existing cashout amount and status fields. Available balance in the cashout table is resolved from the already-loaded affiliate response by enrollment ID.

Cashout Export is local browser CSV generation from the records already loaded in memory. It does not call an export endpoint or change backend data.

## Local UI data preview

For a disposable populated-state review, append `affiliate_preview=1` to the POS URL:

```text
http://localhost:5174/?view=settings_affiliates&affiliate_preview=1#/terminal
```

This flag loads frontend-only affiliate, cashout, and pending-invite fixtures from
`packages/web-core/src/features/pos/affiliates/affiliateLocalPreview.js`. It does not call affiliate
read APIs while the preview is active, and all affiliate mutations are blocked with a read-only
toast. Remove `&affiliate_preview=1` from the URL and refresh to return to the normal API-backed
state, including the original empty state when the local database has no records. The fixtures are
never written to MySQL, the API, or browser storage.

## File isolation

The redesign is isolated to the affiliate page, the small shared POS primitives needed to keep the
new page consistent, and its documentation:

- `packages/web-core/src/features/pos/components/AffiliatesWorkspacePanel.jsx` — stable page orchestrator and existing service handlers.
- `packages/web-core/src/features/pos/affiliates/` — affiliate-only navigation, views, controls, calculations, and presentation helpers.
- `packages/web-core/Components/ui/pagination.jsx` — optional no-divider pagination footer styling.
- `packages/web-core/src/features/pos/components/PosFilterDialogShell.jsx` — optional content-sized filter surfaces.
- `packages/web-core/src/features/pos/components/PosMobileDataCard.jsx` — optional collapsible mobile fields.
- `packages/web-core/src/features/pos/components/PosReportsKpiCards.jsx` — optional compact KPI value styling.
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` and
  `TerminalPageLayout.jsx` — POS Affiliate route/frame registration.
- `apps/dgfy-pos/tests/e2e/affiliates.authenticated.spec.js` — read-only authenticated browser
  smoke coverage for the Affiliate tabs and responsive surfaces.
- `docs/features/pos-affiliates-ui.md` — this frontend inventory.

These shared changes are backward-compatible and limited to opt-in props/classes used by the
Affiliate page; existing POS surfaces keep their previous defaults. Affiliate-only compact table
density and layout classes remain local to the Affiliate views, so no generic Items or unrelated
page styling is changed. No backend, migration, or API contract files are included.

## Validation

The expected checks for this page are:

```text
npm --prefix apps/dgfy-pos run lint
npm --prefix apps/dgfy-pos run build
npm --prefix apps/dgfy-ims test -- --run ../../packages/web-core/src/features/pos/__tests__/AffiliatesWorkspacePanel.behavior.test.jsx
npm --prefix apps/dgfy-pos test:e2e -- tests/e2e/affiliates.authenticated.spec.js --project=authenticated-google-chrome
```

The authenticated browser smoke spec covers a live read-only Affiliate route, all three tabs,
filters, pagination placement, the invite dialog, action dialogs, mobile overflow, and the
populated read-only preview state. It must not submit real invitations, cashouts, rate changes, or
price-rule mutations. It proves rendered POS behavior, route wiring, and live read integration;
live mutation integration remains a separately authorized sandbox concern and is not claimed by
this frontend-only change.
