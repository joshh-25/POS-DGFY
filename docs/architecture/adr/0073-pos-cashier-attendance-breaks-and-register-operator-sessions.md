---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-24
last_reviewed: 2026-08-26
review_by: 2027-02-24
applies_to: pos, attendance, cash_drawer, cashier_reporting
topic: pos_cashier_attendance_breaks_and_register_operator_sessions
supersedes_in_part: docs/architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md
---

# ADR 0073: POS Cashier Attendance, Breaks, and Register Operator Sessions

## Status

Accepted on 2026-08-24 and amended through 2026-08-26 for automatic cashier
lifecycle orchestration and the standalone POS operator sign-in contract.

## Context

The current POS model uses `pos_terminal_shifts.cashier_id` for both the
continuous register shift and the cashier allowed to operate that terminal.
That is sufficient for one cashier per drawer, but it cannot represent a
cashier taking a break while another already-attending employee provides relief.

The target operating day is:

- Cashier A attends regular duty from 7:00 AM to 3:00 PM and breaks from
  12:00 PM to 1:00 PM.
- Cashier B works a distinct relief-duty interval from 12:00 PM to 1:00 PM,
  then regular duty from 3:00 PM to 10:00 PM.
- One register shift and one opening float remain open from 7:00 AM to
  10:00 PM.
- The authenticated operator changes A -> B -> A -> B at 12:00 PM,
  1:00 PM, and 3:00 PM.

Attendance, breaks, register cash custody, and current terminal operation are
different facts and must not be inferred from one mutable cashier column.

The Phase 157 persistence names are frozen as follows: tenant-local
`employee_attendance_sessions`, `employee_break_segments`,
`pos_terminal_operator_sessions`, and `pos_drawer_handoff_events` tables, plus
an additive nullable `pos_transactions.operator_session_id` reference. These
names are contract identifiers; their exact columns, indexes, foreign keys,
backfill, and rollback behavior are Phase 157 implementation work.

## Decision

1. **Attendance is independent from register operation.** `[binding]`
   Multiple employees may have active attendance sessions at one location.
   Each employee has at most one active attendance session and one active break
   segment. A break pauses attendance activity but does not close the employee's
   register shift because attendance and register shifts are separate records.

2. **Duty intervals are explicit and typed.** `[default]`
   Regular duty and temporary relief duty are separate attendance sessions.
   The target scenario therefore records B's 12:00 PM-1:00 PM relief duty
   separately from B's 3:00 PM-10:00 PM regular duty. The attendance contract
   does not implement payroll, scheduling, overtime, or labor-law calculations.

3. **A register shift represents one continuous drawer lifecycle.** `[binding]`
   One terminal/drawer has at most one open register shift. The shift owns its
   opening float, tender ledger, X/Z lifecycle, final count, and final variance.
   A cashier takeover, break, relief interval, or counted custodian handoff
   never creates a second register shift or a second opening float.

4. **Operator sessions represent current terminal use.** `[binding]`
   One terminal has at most one current authenticated operator session, and an
   employee has at most one current operator session. An operator session is
   scoped to tenant, location, terminal, register shift, and employee, has
   explicit start/end timestamps, and is auditable. The session changes when a
   cashier takes over; the register shift does not.

5. **Transactions use the current operator and preserve the register.** `[binding]`
   For new POS actions, the server derives the cashier identity from the current
   authenticated operator session. The transaction keeps its immutable cashier
   snapshot, register-shift reference, terminal, location, and operator-session
   reference. A client-supplied cashier identifier cannot override the server
   decision. Historical transactions without an operator-session reference
   remain readable and are reported as legacy attribution.

6. **Temporary relief and counted custody are different events.** `[binding]`
   A temporary relief takeover changes the operator session and records shared
   drawer access; without a cash count it must not claim individual cash
   variance for the relief cashier. A formal custodian change requires an
   expected-cash snapshot, actual count, variance, outgoing acknowledgement,
   incoming acknowledgement, and an immutable handoff event while the same
   register shift remains open.

7. **Break and takeover transitions fail closed around active operations.** `[binding]`
   Starting a break, ending attendance, taking over, returning control, or
   handing over custody must not interrupt an in-flight payment, refund, void,
   drawer mutation, or other protected operation. The server either completes
   the existing operation and then transitions, or rejects the transition with
   no partial state.

8. **Cashier authentication is scoped and does not replace DGFY identity.** `[binding]`
   A takeover requires an active, location-authorized employee and a dedicated
   cashier authentication step governed by ADR 0026 and ADR 0044. Any PIN is
   write-only, rate-limited, lockable, tenant-scoped, and never a browser-readable
   session token. Terminal pairing proves device binding only; it never proves
   cashier identity or grants operator authority.

9. **Existing register and parked-sale history remains compatible.** `[default]`
   `pos_terminal_shifts.cashier_id` remains the opening-cashier/legacy shift
   owner compatibility field until a later migration contract defines any
   additive replacement. ADR 0065's parked-sale origin and current operational
   ownership remain valid for parked carts. Parked-sale handoff does not itself
   reassign the register, drawer custody, or current operator.

10. **Scope and authorization are checked on every protected mutation.** `[binding]`
    Tenant, location, terminal, register-shift, attendance, employee, and
    operator-session scope must be revalidated server-side for checkout, tender,
    refund, void, no-sale/drawer-open, parked-sale actions, online cash
    collection, X report, custody handoff, and Z close. No browser state or
    terminal selection alone may grant authority.

## Consequences

- Attendance reporting can show simultaneous active employees and their breaks.
- Cashier Summary can attribute sales to the authenticated operator session while
  register reports remain drawer-based.
- The 12:00 PM-1:00 PM relief interval is visible and accountable without
  fabricating an individual cash variance.
- The 3:00 PM handoff can transfer counted cash custody without closing the
  7:00 AM register shift.
- Existing single-cashier behavior remains unchanged until a later implementation
  phase activates the contract behind the approved rollout flag.
- The contract requires additive persistence and authorization work in later
  phases; this ADR itself does not authorize migrations or runtime changes.

## Non-Goals

- Payroll, overtime, scheduling optimization, biometric attendance, or biometric
  cashier authentication.
- Multiple physical drawers sharing one terminal simultaneously.
- Cloning undocumented UTAK controls or asserting that UTAK exposes a literal
  “resume existing shift” button.
- Individual cash-variance attribution during an uncounted shared-drawer period.

## Validation Contract

Phase 157-162 implementations must prove at minimum:

1. The target 7:00 AM-10:00 PM scenario creates the exact attendance, break,
   operator, transaction, handoff, and register records described above.
2. Concurrent takeovers leave exactly one current operator session and no partial
   handoff or duplicate register shift.
3. Break, Time Out, stale PIN, replay, cross-tenant, cross-location,
   cross-terminal, and unauthorized drawer mutations fail closed.
4. Cashier sales, register totals, custody snapshots, and final Z close reconcile
   with documented treatment of shared access and legacy rows.
5. Migration, rollback, tenant schema parity, security, accessibility,
   performance, and end-to-end gates pass before rollout activation.

## Approval Record

- Tech-lead approval: **accepted by the user in this task on 2026-08-24**.
- Phase 156 may complete after its remaining documentation and validation gates
  are checked in the implementation phase ledger.

## Amendments

### 2026-08-25: Automatic Cashier Shift Lifecycle (Phase 164)

- Opening a register shift may orchestrate regular attendance and the initial
  operator session in the same database transaction when the location has the
  attendance lifecycle enabled. Authentication alone still does not create
  attendance.
- The normal cashier action is `Break & Lock`: the server records the break,
  ends the current operator authority, and only then does the client lock. It
  never closes the continuous register shift or changes opening cash custody.
- Same-cashier authentication after a Break & Lock atomically ends the active
  break and restores operator authority for the existing shift. Relief takeover
  remains an explicit scoped handoff and cannot be silently stolen.
- Closing a shift ends any active break, closes regular attendance, revokes the
  operator session, and closes the register in one transaction. Security or
  inactivity lock alone does not create a break.

### 2026-08-25: Automatic Attendance on Cashier Takeover (Phase 166)

- After the incoming cashier passes DGFY authentication, location scope,
  dedicated POS PIN, and no-active-break checks, takeover automatically creates
  that cashier's regular attendance session when none exists at the register's
  location. The attendance row and operator session are committed in the same
  transaction.
- An existing open attendance session at the same location is reused. An open
  attendance session at another location fails closed instead of creating a
  second active session for the cashier.
- Takeover still changes only the current operator session. The continuous
  register shift, opening float, drawer custody, and counted-handoff rules are
  unchanged.

### 2026-08-26: Standalone POS Operator Sign-In Contract (Phase 170)

This amendment replaces only the default takeover orchestration that required
the incoming operator to create a second DGFY browser login. The binding
identity, authorization, attendance, operator-session, and cash-custody clauses
above remain unchanged.

- The existing DGFY browser session continues to establish the tenant, company,
  and terminal context. A routine operator switch does not replace that browser
  identity and does not require the target operator's DGFY password.
- The incoming operator selects their eligible tenant-local profile and proves
  possession of their personal, write-only POS PIN. The server revalidates
  active membership, `pos:transact`, `pos:attendance:operate`, location scope,
  attendance/break rules, PIN state, terminal/shift scope, and transition
  eligibility before issuing operator authority.
- Eligibility is capability-based, not tied to `role === cashier`. An owner,
  founder, administrator, manager, or invited cashier may operate the standalone
  POS when the same server-side permission, location, attendance, and PIN
  requirements pass.
- Same-operator resume and different-operator takeover use the same target
  eligibility policy but remain distinct auditable transitions. Generic
  authentication failures, rate limits, lockout, idempotency, stale-session
  rejection, and single-current-operator concurrency guarantees continue to
  fail closed.
- A routine switch preserves the open register shift, opening float, drawer
  ledger, and shared-drawer disclosure. Counted custody transfer remains a
  separate acknowledged handoff.
- A cart must be parked or cancelled before the operator changes, and any
  payment, refund, void, drawer mutation, or other protected operation blocks
  the transition until it completes or is safely rejected.
- This product contract applies only to the standalone POS. It adds no IMS
  operator-switch UI, feature behavior, or rollout obligation. A later runtime
  change to shared `packages/web-core` code may still require an IMS build as a
  regression gate, not as an IMS deliverable.
- Phase 170 freezes documentation and implementation boundaries only. Runtime
  delivery, hardening, end-to-end proof, rollout, and deployment require later
  separately approved phases.

## References

- `docs/architecture/adr/0026-browser-session-cookie-authority.md`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- `docs/architecture/adr/0044-pos-terminal-device-pairing.md`
- `docs/architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md`
- `docs/architecture/adr/0039-adr-lifecycle-strictness-tiers-and-amendment-path.md`
- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
