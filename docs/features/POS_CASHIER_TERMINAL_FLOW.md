# POS Cashier Terminal Flow

Status: authoritative
Last reviewed: 2026-08-26

## Scope

This document describes the standalone POS cashier flow, multi-company DGFY
login, role-default permissions, and the Phase 171 target contract for switching
the active terminal operator. Operator eligibility is capability-based: an
owner, administrator, manager, or invited cashier may sell when the tenant-local
profile has `pos:transact`, `pos:attendance:operate`, allowed location scope,
valid attendance state, and a configured personal POS PIN. Phase 171 is a
documentation contract; later phases must implement and prove the target
switching behavior.

Authoritative references:

- `docs/architecture/adr/0026-browser-session-cookie-authority.md`
- `docs/architecture/adr/0028-dgfy-account-company-switching.md`
- `docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md`
- `apps/dgfy-api/src/config/permissions.js`
- `apps/dgfy-api/src/routes/dgfy.js`
- `apps/dgfy-api/src/routes/pos.js`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md`

## Before the cashier can use POS

1. A company admin or manager opens IMS user management or POS terminal setup.
2. The admin searches for an already registered DGFY account.
3. The admin sends an invitation with role `cashier` and one or more location scopes.
4. The invited DGFY account accepts the business invitation.
5. The system creates or activates the tenant-local cashier authorization profile.
6. The cashier signs in using the DGFY account credentials. No separate POS-only password is created by the invitation flow.

An owner, founder, administrator, or manager with an active tenant membership
does not need a second cashier-role invitation solely to become a POS operator.
The Phase 171 target flow still requires the operator permissions, location and
attendance eligibility, and personal PIN defined below.

## Default cashier permissions

The default backend `cashier` role grants:

- `items:view`
- `pos:view`
- `pos:transact`
- `pos:attendance:view`
- `pos:attendance:operate`
- `pos:employee_credit:use`
- `pos:shift_close`
- `pos:reprint`

This means the cashier can view POS items, operate checkout, manage their own
attendance/break state, use governed Employee Credit tender, view POS
history/receipts, close their terminal shift, and reprint receipts. It does not
grant user management, settings management, reports management, cash drawer
adjustment, location switching, price override, voiding, fiscal terminal
management, eSales management, or close-day/Z-reading authority.

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

## Accountable void and refund flow

POS Settings owns cashier authorization; this is not configured in
SKUpervisor. An authorized administrator may independently grant `pos:void`
and `pos:cash_drawer_adjust` to an active cashier without replacing the
cashier's other permissions.

### Internal void

1. The operator opens a completed transaction from POS History, selects
   **Void**, and enters a reason of at least three characters.
2. A cashier with `pos:void` must own an open shift. An administrator with
   `pos:void` may use the no-shift exception, but still needs an authenticated
   POS session and paired terminal.
3. POS records the void actor and reason, reverses applicable inventory,
   fiscal, and Employee Credit effects, and keeps the original cashier and
   original shift unchanged.
4. History retains the transaction under **Voided**, with a red status label,
   reason, actor, timestamp, adjustment evidence, and financial follow-up.

An internal void is not proof that paid customer money was returned. The server
classifies the required follow-up from persisted tender evidence.

### Paid cash

The cashier physically returning cash must have `pos:cash_drawer_adjust` and
own the acting open shift. A successful cash-refund request atomically records
one `cash_refund` adjustment and one linked `cash_out` drawer event. Retry with
the same idempotency key returns the same evidence; another completed refund is
rejected.

### Merchant-owned digital tender

Walk-in GCash, Maya, card-terminal, and bank-transfer payments do not call
PayMongo. POS first records the store's external reversal reference as
`manual_review_required`; explicit confirmation with the same reference and a
new idempotency key changes the transaction to `refunded`.

### Provider-owned online tender

Only server-classified PayMongo-owned online transactions use the provider
refund endpoint. The backend derives and verifies the payment ID, provider,
method, amount, currency, status, and commerce-session ownership before a
refund can succeed. Walk-in merchant-owned tenders cannot enter this path.

### Split tender

Each successful allocation is reversed separately. Cash creates the linked
drawer event; merchant-owned digital tender uses external evidence; provider
allocations require matching provider refund evidence. The transaction is
`refund_pending` or `partial_refunded` until all successful allocations are
fully reversed.

### Shift close and Z-reading

If the original shift is still open, its live summary includes the void. If it
is closed, the saved close summary and Z-reading remain immutable. Cashier
History reports the later adjustment against the original cashier/shift while
also showing the acting user/shift. Daily reports group adjustments by their
own event timestamp and do not subtract the original void twice.

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

The following is the Phase 171 target contract. It does not claim that the
current runtime already implements the complete flow.

- The DGFY account initially signs in and selects the company and terminal. That
  cookie-backed browser identity remains unchanged during routine operator
  switches.
- Locking an open register preserves its shift, opening float, drawer ledger,
  and resume context.
- The standalone POS shows eligible operators for the active tenant, location,
  terminal, and shift. The selected operator enters only their personal POS PIN;
  the switch does not ask for that operator's DGFY email and password again.
- The server authorizes by capability, not by a hard-coded cashier role. Owners,
  administrators, managers, and invited cashiers are eligible only when they
  have active membership, `pos:transact`, `pos:attendance:operate`, location
  access, valid attendance/no active break, and a configured non-locked POS PIN.
- Selecting the current operator resumes their authority. Selecting a different
  eligible operator performs an auditable takeover and starts attendance only
  under the separately governed lifecycle rules.
- A takeover does not close or replace the register shift. Ordinary switching
  records shared-drawer access; counted custody remains a separate handoff.
- An active cart must be parked or cancelled before switching. In-flight
  payment, refund, void, cash-drawer, or other protected mutations block the
  transition and cannot be interrupted.
- Failed PINs, stale eligibility, concurrent switches, replay, cross-tenant or
  cross-location targets, and version mismatch fail closed with generic user
  errors and auditable server evidence.
- IMS is excluded from this operator-switch feature. Shared-code changes in a
  later implementation phase may require an IMS regression build only.
- After shift close, cashier/operator sign-in is required before the next shift can begin.
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
