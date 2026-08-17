# POS Cashier Terminal Flow

Status: authoritative
Last reviewed: 2026-08-13

## Scope

This document describes how a DGFY-invited `cashier` operates inside the POS terminal after the invitation is accepted, how POS login works when the DGFY account can access multiple companies, and what the cashier can and cannot do by default.

Authoritative references:

- `docs/architecture/adr/0026-browser-session-cookie-authority.md`
- `docs/architecture/adr/0028-dgfy-account-company-switching.md`
- `backend/src/config/permissions.js`
- `backend/src/routes/dgfy.js`
- `backend/src/routes/pos.js`
- `frontend/src/features/pos/pages/TerminalPage.jsx`
- `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md`

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
3. Select the company if the DGFY account owns or has been invited into more than one company.
4. Select an active registered terminal.
5. Enter the opening cash amount.
6. Open the shift.
7. Use `Sell` to create checkout transactions while the shift is open.
8. Use `History` and receipt views to look up completed transactions and receipts.
9. Use `Items` as a view-only item list. Cashiers do not get item create/edit/delete permissions by default.
10. In eligible retail, F&B, and counter workflows, use `Orders` where enabled
    to view incoming online orders and progress allowed order status actions
    while a shift is open. Services uses its booking workspace instead and
    does not show the storefront Orders queue.
11. Use `Shift` to monitor the active shift and close the shift at the end of the cashier's work period.

## Login behavior with multiple companies

The cashier uses one DGFY account identity, but that account can have access to more than one company. Access can come from ownership, founder/admin membership, or an accepted invitation such as `cashier`.

Login works as follows:

1. The cashier enters the DGFY email and password on POS.
2. POS authenticates the DGFY account.
3. The backend lists companies that the DGFY account can switch into.
4. The list can include:
   - companies the account owns;
   - companies where the account has accepted an invitation;
   - companies where the account has an accepted explicit DGFY membership.
5. If the account has only one accessible company, POS can continue with that company.
6. If the account has multiple accessible companies, POS asks the cashier to choose the company for this session.
7. After company selection, POS starts the tenant session for that selected company.
8. The selected company controls the cashier's role, permissions, terminal registry, location scope, items, orders, shifts, and receipts.

Important rules:

- A DGFY account can own one company and also be a cashier in another company.
- The same DGFY login does not give the same permissions everywhere. Permissions are company-specific.
- If the cashier chooses Company A, only Company A terminals, locations, items, shifts, and orders apply.
- If the cashier chooses Company B, Company B's separate tenant-local authorization profile applies instead.
- Pending invitations do not allow POS operation until accepted.
- Email or phone matching alone is not enough to access a company. The DGFY account must have explicit accepted membership.

## Example multi-company login

Example account: `cashier@example.com`

- Owns `Coffee Shop A` as founder/admin.
- Was invited to `Restaurant B` as `cashier`.
- Was invited to `Store C`, but has not accepted yet.

Expected POS behavior:

1. The cashier signs in with `cashier@example.com`.
2. POS lists `Coffee Shop A` and `Restaurant B` as selectable companies.
3. POS does not allow operation for `Store C` until the invitation is accepted.
4. If the cashier selects `Restaurant B`, the cashier receives only the `Restaurant B` cashier permissions and location scope.
5. If the cashier selects `Coffee Shop A`, the account may have admin/founder behavior for that company instead of cashier-only behavior.

## Lock and resume behavior

- If a cashier locks the terminal while a shift is still open, the terminal stores a resume context for that shift.
- Only the cashier who opened the active shift can resume it.
- If another cashier signs in while the first cashier's shift is still open, the UI blocks continuation and instructs the operator to close the current shift first.
- After shift close, cashier login is required before the next shift can begin.
- Closing or replaying a shift close may print through a configured physical
  printer, but it must not open the browser print dialog automatically when no
  printer is available. The saved post-shift handoff provides an explicit
  **Print Shift Summary** action for browser printing.
- When an administrator switches companies, POS clears the previous company's terminal and lock state, retains the newly issued tenant session, and loads the selected company's workspace. A one-time same-tab handoff permits the selected POS workspace to restore that newly issued cookie-backed session without showing login. The target company never inherits the previous company's terminal, shift, or `shift_closed` lock marker.

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
- Use a pending or rejected company invitation to operate POS.
- Use Company A access to operate Company B terminals unless the DGFY account also has accepted Company B membership.

## Operational notes

- Checkout is blocked until the terminal is unlocked and a shift is open.
- Registered terminal enforcement can block shift open and checkout if the selected terminal is not active or has no assigned store location.
- Location scope limits which business locations a cashier can operate against.
- DGFY account authentication and tenant-local authorization are separate: the DGFY account proves identity, while the tenant-local cashier profile controls what that account can do inside the business.
- Company selection is part of authorization. The cashier must be operating inside the intended company before opening a shift.
- If invite search returns `Valid tenant context is required for authenticated requests`, the invite flow has not reached account matching yet. The request is failing because the backend has not bound the authenticated request to the selected company tenant.
