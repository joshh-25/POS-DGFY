# POS Cashier Terminal Flow

Status: authoritative
Last reviewed: 2026-07-03

## Scope

This document describes how a DGFY-invited `cashier` operates inside the POS terminal after the invitation is accepted, and what the cashier can and cannot do by default.

Authoritative references:

- `docs/architecture/adr/0026-browser-session-cookie-authority.md`
- `docs/architecture/adr/0028-dgfy-account-company-switching.md`
- `backend/src/config/permissions.js`
- `backend/src/routes/dgfy.js`
- `backend/src/routes/pos.js`
- `frontend/src/features/pos/pages/TerminalPage.jsx`
- `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`

## Before the cashier can use POS

1. A company admin or manager opens IMS user management or POS terminal setup.
2. The admin searches for an already registered DGFY account.
3. The admin sends an invitation with role `cashier` and one or more location scopes.
4. The invited DGFY account accepts the business invitation.
5. The system creates or activates the tenant-local cashier authorization profile.
6. The cashier signs in using the DGFY account credentials. No separate POS-only password is created by the invitation flow.

## Default cashier permissions

The default backend `cashier` role grants:

- `items:view`
- `pos:view`
- `pos:transact`
- `pos:shift_close`
- `pos:reprint`

This means the cashier can view POS items, operate checkout, view POS history/receipts, close their terminal shift, and reprint receipts. It does not grant user management, settings management, reports management, cash drawer adjustment, location switching, price override, voiding, fiscal terminal management, eSales management, or close-day/Z-reading authority.

## Normal cashier operating flow

1. Open the POS terminal.
2. Sign in using the cashier's DGFY account credentials.
3. Select the company if the DGFY account belongs to more than one company.
4. Select an active registered terminal.
5. Enter the opening cash amount.
6. Open the shift.
7. Use `Sell` to create checkout transactions while the shift is open.
8. Use `History` and receipt views to look up completed transactions and receipts.
9. Use `Items` as a view-only item list. Cashiers do not get item create/edit/delete permissions by default.
10. Use `Orders` where enabled to view incoming online orders and progress allowed order status actions while a shift is open.
11. Use `Shift` to monitor the active shift and close the shift at the end of the cashier's work period.

## Lock and resume behavior

- If a cashier locks the terminal while a shift is still open, the terminal stores a resume context for that shift.
- Only the cashier who opened the active shift can resume it.
- If another cashier signs in while the first cashier's shift is still open, the UI blocks continuation and instructs the operator to close the current shift first.
- After shift close, cashier login is required before the next shift can begin.

## What cashiers can do by default

- Open a terminal shift with an opening float.
- Sell items through POS checkout while a shift is open.
- View transaction history and receipt details.
- Reprint receipts.
- View store items.
- View incoming online orders where the business mode exposes the queue.
- Progress online order status actions when they have POS transaction permission and an active shift.
- Close their current terminal shift.

## What cashiers cannot do by default

- Invite DGFY users or manage cashier accounts.
- Manage roles, permissions, or user scopes.
- Edit POS setup, terminal registry, storefront setup, receipt identity, or company profile settings.
- Create, edit, or delete inventory items.
- Override item prices.
- Record manual cash drawer adjustments unless separately granted `pos:cash_drawer_adjust`.
- Switch the active shift location unless separately granted `pos:switch_location`.
- View POS reports because the sidebar hides report navigation for the `cashier` role.
- Perform close-day/Z-reading operations unless separately granted `pos:close_day`.
- Void completed POS transactions unless separately granted `pos:void`.
- Manage fiscal terminals or eSales reports.

## Operational notes

- Checkout is blocked until the terminal is unlocked and a shift is open.
- Registered terminal enforcement can block shift open and checkout if the selected terminal is not active or has no assigned store location.
- Location scope limits which business locations a cashier can operate against.
- DGFY account authentication and tenant-local authorization are separate: the DGFY account proves identity, while the tenant-local cashier profile controls what that account can do inside the business.
- If invite search returns `Valid tenant context is required for authenticated requests`, the invite flow has not reached account matching yet. The request is failing because the backend has not bound the authenticated request to the selected company tenant.
