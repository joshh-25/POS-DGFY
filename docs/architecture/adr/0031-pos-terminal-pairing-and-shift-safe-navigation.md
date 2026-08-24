---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-06-29
last_reviewed: 2026-08-20
review_by: 2026-12-28
applies_to: architecture_decision
topic: pos_terminal_pairing_and_shift_safe_navigation
---

# ADR 0031: POS Terminal Pairing and Shift-Safe Navigation

## Context

Standalone POS unlock already authenticates a DGFY account or a grace-eligible
legacy tenant user and resolves a tenant-local authorization profile. PR #25
proposed a richer setup and cashier user experience. The original unsafe shape
was a second credential authority outside the existing tenant-user lifecycle.
The valid requirement is richer operator setup and cashier-focused unlock while
preserving DGFY tenant context, tenant-local authorization, terminal registry,
location grants, and shift controls. Physical browser/device possession is no
longer a required security boundary for normal shift opening or checkout.

## Decision

1. Keep DGFY membership as the primary identity and company-access authority.
2. Allow POS setup to create and list cashier profiles only as normal tenant
   users with the existing `cashier` role, existing location grants, and tenant
   database context. Do not create a separate cashier credential table or bypass
   DGFY tenant resolution.
3. Do not create tenant-local cashier credentials from POS setup. POS setup uses
   the DGFY account search/invitation contract from ADR 0028, forces the cashier
   role, and persists active tenant-location grants with the pending invitation.
4. Terminals are logical counters/stations registered by tenant settings and
   bound to an active tenant location. A saved terminal becomes eligible for POS
   use only when it is active and has a valid location assignment.
5. Physical-device pairing is optional compatibility state for hardware-specific
   or legacy device-enrollment flows. It must not block normal shift opening or
   checkout when the operator is otherwise authorized. If pairing endpoints remain
   enabled, use a dedicated `POS_TERMINAL_PAIRING_SECRET` in production and do
   not reuse access-token or refresh-token secrets.
6. Opening a shift from any browser/device requires DGFY authentication or an
   explicitly allowed legacy grace identity, accepted company membership, an
   active tenant-local authorization profile, `pos:transact`, selected active
   terminal, terminal location assignment, and a location grant for that terminal
   location. Email or phone matching must not be used to infer company access.
7. Checkout and terminal mutations must be protected by explicit permissions,
   selected terminal, terminal/location binding, location grants, compliance
   gates, and open-shift rules. A stale, missing, expired, or rotated pairing
   cookie must not block an otherwise authorized shift open or checkout.
8. Administrators may dismiss the open-shift prompt and navigate read-only or
   configuration surfaces. Cashier-role users remain in cashier-focused
   navigation, and no-shift transactional controls stay disabled.
9. POS Settings access PIN may guard configuration surfaces. Store only a hash,
   expose only a configured/not-configured read indicator, and require master
   admin authority to set or clear the PIN.
10. A location may own multiple active terminals/counters. Terminal IDs remain
    unique and exactly one active terminal may be the tenant default.
11. The locked-terminal account picker must provide an explicit account-switch
    boundary. Switching accounts revokes or clears the prior DGFY session,
    companies, selected tenant, tenant session, and password before accepting the
    next identity. The drawer exposes one DGFY sign-in path for admins and
    cashiers; direct tenant-local cashier-password login is not a normal path.
    Eligible historical users retain the separately labelled legacy grace login
    through the ADR 0028 deadline.
11. The company founder/master admin remains an administrator and is treated as
    POS-operator ready without creating a duplicate cashier role or user row.
12. Cashier defaults follow least privilege: catalog view, checkout, shift open
    and shift close, and receipt reprint. Day close, governed reset, void, cash
    drawer adjustment, price override, eSales administration, fiscal-terminal
    administration, and location switching require separately granted authority.

## Boundary Consequences

The Settings module owns terminal registry configuration and any retained
pairing-version compatibility metadata. The POS module owns logical terminal
selection, shift opening, checkout, optional device-enrollment compatibility,
and mutation guards. DGFY owns account invitation and company membership. The
Users service owns tenant-local authorization profiles and location grants
created by accepted DGFY invitations. Tenant-local users remain authorization
profiles inside the selected tenant, not a separate credential authority.

## Validation

1. Logical terminal shift-open and checkout tests proving no pairing cookie is
   required for authorized operators.
2. POS terminal identity, unlock, admin-navigation, shell, and settings tests.
3. POS and SKUpervisor production builds.
4. Rendered desktop, tablet, and mobile terminal evidence before merge approval.
5. Docs, architecture, compliance, merge-adoption, and reviewed-batch gates.

## Addendum (2026-07-02): POS Item Creation And Starter-Item Setup

1. POS terminal onboarding includes a starter-item step that reuses the tenant onboarding bulk item API and the ADR 0013 mode-aware starter-item taxonomy.
2. POS > Items > Add POS Item is a staged mutation. The durable item create must complete before optional images, barcode generation, Storefront visibility, POS Always Available, POS visibility, and catalog readback run.
3. Optional image upload failure must be reported as recoverable post-create work, not as item creation failure. The UI must preserve the created item ID and retry unfinished post-create stages without creating a duplicate item.
4. Runtime schema health and tenant schema report mode must verify the POS Always Available contract columns: `pos_catalog_overrides.pos_always_available`, `pos_transaction_lines.stock_effect_type`, and `pos_transaction_lines.stock_exempt_reason`.
5. Tenant repair for these columns is additive and declared-column-only. Full tenant `sync({ alter: true })` is not the default repair path for this contract.

## Addendum (2026-07-24): Durable Shift Ownership And Recovery

1. A POS shift is owned by the authenticated tenant user stored in
   `pos_terminal_shifts.cashier_id`. The value is the permanent `users.user_id`
   for both cashier-role users and administrators. It is not a login-session,
   browser, terminal, or per-shift identity.
2. A tenant user may own at most one open shift at a time. The database enforces
   this invariant in addition to application validation. Reopening the same
   terminal while the same shift is still open resumes that shift and returns
   its existing `pos_terminal_shift_id`; it does not create a replacement row.
3. Each completed open/close cycle keeps its own immutable shift row and
   `pos_terminal_shift_id`. Reusing `users.user_id` as the owner does not reuse
   or overwrite historical shift IDs.
4. Normal shift mutations, including close, cash-drawer events, and location
   switching, require the authenticated actor to own the open shift. Merely
   selecting an occupied terminal never grants drawer ownership.
5. A company master administrator may perform an explicit recovery override
   only through a guarded action that requires a reason and records the original
   operator, override actor, terminal, location, timestamps, expected cash,
   closing cash, and variance. Recovery closes history; it never deletes or
   silently reassigns an open shift.
6. Shift open, close, switch, cash-drawer, audit, and idempotency records must be
   committed atomically. External effects run only after the database commit and
   must be safe to retry.
7. Storefront ordering availability is independent of POS shift state. Opening
   or closing a POS shift must not directly open or close Storefront ordering.
   Storefront availability continues to use its own location, manual-open,
   schedule, fulfillment, and inventory policies.
8. An elapsed-time threshold may mark an open shift as stale for recovery
   visibility, but elapsed time alone must never auto-close financial history.
9. Admin branch monitoring remains read-only unless the actor invokes an
   explicit permitted shift mutation or recovery action. Cashier-role users may
   access and resume only their own open shift.

## Shift Ownership Validation

1. Concurrent opens for one operator must produce one durable open shift and an
   idempotent resume response, never two open rows.
2. An operator can resume the same open shift after refresh, relogin, or device
   change when company, location grant, and terminal policy remain valid.
3. A different cashier cannot close, switch, or mutate another operator's cash
   drawer even when they can see the terminal in an administrative read model.
4. A master-admin recovery requires a reason and produces complete audit and
   cash-reconciliation evidence.
5. Closing the final POS shift does not change Storefront ordering availability.

## Amendments

### 2026-08-08: Per-Operator Day-Close Confirmation PIN

1. A tenant user who already has `pos:close_day` may be assigned a personal, write-only Day Close PIN for confirming a Z-reading. This PIN is a step-up confirmation for the already authenticated DGFY tenant user; it must not unlock the POS, establish a session, open a shift, or replace DGFY membership and authorization.
2. The PIN is stored only as a password hash and never returned by an API. The master administrator may configure or clear it only for an active user who already holds `pos:close_day`.
3. The close-day operation verifies the current authenticated user against their own PIN, records the operator and terminal on the immutable Z-reading snapshot, and must reject closure while any shift remains open at that location.

### 2026-08-10: Cashier-Owned Day-Close PIN Setup

1. An active tenant user with `pos:close_day` may create or replace only their own Day Close PIN from the current company's authenticated account profile after verifying their current account password. This action remains tenant-scoped and must not be placed on a global DGFY account as a cross-company PIN.
2. Master Admin can view the eligible operator's safe identity fields and PIN configured status, and may reset a PIN when recovery is needed. Master Admin must not set or view a cashier's personal Day Close PIN.
3. PIN creation and reset must write tenant audit evidence without storing or returning the PIN or account password. The existing Z-reading confirmation remains the final per-operator accountability event.

### 2026-08-10: DGFY Business To POS Cashier Handoff

1. When DGFY Business opens the standalone POS for a selected company, POS may consume a short-lived, credential-free browser-session marker only to discard prior tenant terminal-lock and terminal-identity state before it validates the newly issued tenant session.
2. The marker is valid only for the selected tenant and never establishes authentication, replaces API session verification, enables cookie refresh, or bypasses a normal terminal lock when absent, expired, malformed, or tenant-mismatched.
3. POS must clear its browser session and restore the full-auth lock if the validated tenant does not match the handoff tenant, preventing cross-company terminal state from being used after a handoff.
4. A Storefront-initiated POS launch must fail closed when it cannot mint a non-empty single-use handoff token. It must keep Storefront open (and close any blank provisional POS tab) rather than navigate to POS with only a tenant hint.
5. Consuming a verified handoff must clear both persistent and already-in-memory terminal and operating-location state before POS checks the selected tenant's registry. The former tenant's terminal must never cause a newly authenticated tenant session to re-lock.

### 2026-08-11: Day-Close PIN Credential Authority

- Clause amended: 2026-08-10 Cashier-Owned Day-Close PIN Setup, clause 1 (`default`).
- When PIN setup starts from authenticated DGFY Business, the current-password step verifies the landlord-scoped DGFY account credential. The backend must then resolve the selected company's accepted membership and linked tenant user before writing that user's company-scoped PIN.
- Direct tenant/POS self-service may continue to verify the tenant-local staff credential. The two credential authorities must not be synchronized, copied, or inferred from matching email alone.
- Both paths retain the same tenant-local `pos:close_day` authorization, write-only PIN hash, and audit requirements. A DGFY password check does not grant access to a company without an accepted membership.
- Reason: DGFY password changes and tenant-local password changes have independent lifecycles. Treating a DGFY-authenticated Business form as a tenant-password form rejects valid DGFY credentials and misstates which account is being verified.

### 2026-08-11: Z-Reading POS Void And Provider Refund Boundary

- Financially recognized Z-reading sales continue to include completed POS transactions only. A transaction later marked `voided` is excluded from recognized sales and is reported in separate `void_transaction_count`, `void_amount`, and `voided_item_count` fields using its `voided_at` business date.
- POS void amounts are disclosure metrics and must not be subtracted a second time from the already void-exclusive recognized sales total.
- Payment-provider refunds are not POS voids. Their settlement and reconciliation remain in the commerce/provider ledger governed by ADR 0042 and ADR 0052; close reports must explicitly state that provider refunds are reconciled separately.
- Existing immutable Z-reading snapshots remain readable. Missing newly introduced disclosure fields normalize to zero/false and do not rewrite historical snapshots.

### 2026-08-20: Administrator Void Without Shift Reassignment

- An administrator with `pos:void` may void a completed POS transaction without opening an administrator shift. The authenticated POS session, paired-terminal policy, reason validation, and duplicate-void guard still apply.
- The original transaction cashier and shift are immutable. The administrator is recorded as the void actor, with a null actor shift when the no-shift exception is used.
- A cashier with `pos:void` must still own an open shift. Physical cash refunds additionally require `pos:cash_drawer_adjust` and the actual refunding cashier's open shift.
- A void or refund after shift close is append-only. It never rewrites the saved close summary or Z-reading; cashier history and daily reporting disclose the later adjustment with original and acting attribution.
- Provider-owned, merchant-owned, cash, Employee Credit, and split-tender reversals remain server-classified workflows. A client cannot turn an internal void into evidence that customer money was refunded.
