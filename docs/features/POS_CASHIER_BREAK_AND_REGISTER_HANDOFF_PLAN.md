---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-08-25
review_by: 2027-02-24
applies_to: pos_cashier_attendance_breaks_and_register_handoff
topic: pos_cashier_break_and_register_handoff_plan
---

# POS Cashier Break and Register Handoff Plan

## Decision Summary

DGFY POS will separate four records that the current terminal-shift model treats as one:

1. **Employee attendance** records when an employee is working.
2. **Break segments** record when an attending employee is on break.
3. **Register shifts** keep one drawer open from opening float through final close.
4. **Operator sessions** record which authenticated cashier is currently using the terminal.

A temporary cashier takeover changes the operator session. It does not create a second register
shift, add a second opening float, close the drawer, or duplicate an existing attendance session.
A scheduled change of cash custodian uses a counted handoff while the same register shift remains
open.

This plan governs Phases 154-163 in
`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`. The phases are intentionally sequential and do not
overlap. A phase may start only after the preceding phase's acceptance gates pass and its ledger
status is `completed`.

All new runtime behavior remains behind one tenant/location-scoped, default-off feature flag until
Phase 160. Earlier phases may deploy their completed slice, but they cannot expose an incomplete
cashier workflow to ordinary users.

Phase 161 adds the tenant-admin configuration surface for that already-proven rollout flag. It does
not weaken Phase 160's canary or rollback gates, and it does not permit a location to change
attendance mode while register, attendance, break, or operator work is active.

## Target Scenario

| Time | Cashier A attendance | Cashier B attendance | Current POS operator | Register and cash custody |
| --- | --- | --- | --- | --- |
| 7:00 AM | Regular duty starts | Off duty | A | A opens one register shift with one opening float |
| 12:00 PM | Break starts | Relief duty starts | B after PIN takeover | Same register remains open; B receives temporary shared-drawer access |
| 1:00 PM | Break ends | Relief duty ends | A after PIN takeover | Same register remains open; no new float or drawer close |
| 3:00 PM | Regular duty ends | Regular duty starts | B after PIN takeover | Counted handoff transfers cash custody from A to B |
| 10:00 PM | Off duty | Regular duty ends | None after close | B closes the original register shift and records final count |

Expected persisted records for this scenario:

- Cashier A: one regular attendance session, 7:00 AM-3:00 PM, with one break segment,
  12:00-1:00 PM.
- Cashier B: one relief attendance session, 12:00-1:00 PM, and one regular attendance session,
  3:00-10:00 PM. The separate relief session prevents the worked hour from disappearing and does
  not pretend B worked continuously from noon to 10:00 PM.
- Register: one register shift, 7:00 AM-10:00 PM, with one opening float and one final close.
- Operator sessions: A 7:00-12:00, B 12:00-1:00, A 1:00-3:00, and B 3:00-10:00.
- Cash custody: A remains primary custodian through the temporary lunch relief; the 12:00-1:00
  interval is explicitly disclosed as shared-drawer access because no cash count occurs. A counted
  handoff at 3:00 PM transfers custody to B.

## Non-Negotiable Functional Rules

1. Many employees may have active attendance at the same location.
2. An employee may have only one active attendance session and one active break segment.
3. An employee on break or without active attendance cannot operate the POS.
4. One terminal has at most one open register shift and one current operator session.
5. One employee has at most one current operator session across terminals.
6. A takeover is atomic: the previous operator session ends before the replacement becomes current.
7. The server, not the browser, derives transaction `cashier_id` from the current authenticated
   operator session. The transaction also keeps its register-shift and terminal references.
8. Starting a break ends that employee's operator session only when no checkout, payment, refund,
   void, or drawer mutation is in flight. The terminal then locks until an eligible cashier takes
   over.
9. Temporary relief does not create an opening float or claim individual cash variance. Without a
   count, the relief interval is reported as shared-drawer access.
10. A formal custodian change requires a cash count, expected-cash snapshot, variance calculation,
    outgoing acknowledgement, and incoming acknowledgement.
11. PIN takeover uses a dedicated, rate-limited cashier authentication flow. It does not expose or
    replace the employee's account password and does not store browser-readable authority tokens.
12. Tenant, location, terminal, register shift, attendance, and operator scope are validated on
    every protected mutation.
13. Existing historical transactions and closed shifts remain readable after migration.
14. No phase is marked complete with an unchecked required acceptance gate.

## Current Gap

The current `pos_terminal_shifts.cashier_id` simultaneously represents the open drawer owner and
the cashier allowed to use the terminal. Current terminal decisions therefore block another
cashier until the first shift closes. DGFY does not yet have employee attendance, break, operator
session, or counted handoff records. The target behavior requires an additive model before the
existing ownership checks can safely change.

## Proposed Persistence Boundaries

Names are frozen during Phase 154 before a migration is written. The proposed records are:

| Record | Purpose | Key invariant |
| --- | --- | --- |
| `employee_attendance_sessions` | Regular or relief work intervals | One active session per employee |
| `employee_break_segments` | Break start/end inside attendance | One active break per attendance session |
| `pos_terminal_operator_sessions` | Authenticated terminal-use intervals | One current operator per terminal and per employee |
| `pos_drawer_handoff_events` | Shared access and counted custody transfers | Counted transfer required for individual custody change |
| `pos_transactions.operator_session_id` | Immutable link to the actual checkout operator | Server-assigned; historical rows may remain null |

`pos_transactions.cashier_id` remains the immutable reporting snapshot. `pos_terminal_shifts`
remains the register-level X/Z and cash-reconciliation record. Existing
`pos_terminal_shifts.cashier_id` data is preserved for compatibility and is formally assigned an
opening-cashier meaning by the Phase 154 contract; it is not silently repurposed.

## Phase Isolation Matrix

| Phase | Delivers | Explicitly does not deliver | Exit gate |
| --- | --- | --- | --- |
| 154 | Approved architecture and domain contract | Schema or runtime changes | Governing ADRs accepted and contract test matrix approved |
| 155 | Additive persistence foundation | Attendance UI, takeover flow, or reports | Migrations, rollback, constraints, and repository tests pass |
| 156 | Attendance and break lifecycle | Register takeover or cashier re-attribution | Attendance APIs/UI and lifecycle tests pass |
| 157 | Secure takeover and cash-custody engine | Checkout integration or final reports | Atomic takeover, PIN security, and handoff tests pass |
| 158 | Checkout and complete POS workflow integration | New report surfaces | Every protected POS action uses the active operator correctly |
| 159 | Reporting and reconciliation | New workflow behavior | Cashier, attendance, register, and audit reports reconcile |
| 160 | Release hardening and controlled rollout | New product scope | Full scenario, security, migration, regression, and rollout gates pass |
| 161 | Admin attendance configuration | Attendance lifecycle or reporting changes | Safe per-location activation, audit, UI, and regression gates pass |

## Phase 154 - Governance and Contract Freeze

### Objective

Approve the new ownership model before any schema or application behavior changes.

### Included Work

- Write a new ADR that supersedes in part the affected binding handoff clauses in ADR 0065 and
  obtains the required tech-lead approval.
- Add dated amendments to ADR 0031 and ADR 0044 for operator sessions, scoped PIN takeover, and
  register-shift compatibility semantics.
- Define exact state machines for attendance, breaks, operator sessions, shared relief access,
  counted custody transfer, and register close.
- Freeze entity names, status values, uniqueness rules, audit fields, server-authority rules,
  concurrency behavior, historical compatibility, and the single default-off rollout flag.
- Freeze authorization for sale, payment, refund, void, no-sale/drawer-open, parked-sale handoff,
  online-order cash collection, X report, handoff count, and Z close.
- Approve the scenario and negative-test matrix used by Phases 155-160.

### Excluded Work

- No migration, model, API, frontend, report, feature flag, or production behavior change.

### Acceptance Gates

- New ADR is `accepted`, records its tech-lead approval, and accurately supersedes affected
  binding clauses.
- ADR 0031 and ADR 0044 contain dated amendments; no contradictory active ADR remains.
- Every state transition names its actor, preconditions, persisted event, failure result, and audit
  evidence.
- The 7:00 AM-10:00 PM target scenario and all prohibited transitions have approved expected data.
- `npm run check:adr` and `npm run lint:docs` pass.

## Phase 155 - Additive Persistence Foundation

### Objective

Create the database and repository foundation without changing visible POS behavior.

### Included Work

- Add forward and rollback migrations for the approved attendance, break, operator-session,
  handoff, and transaction-link records.
- Add tenant/location/terminal/employee/register-shift foreign keys, timestamps, status checks,
  audit metadata, and database-enforced active-record uniqueness.
- Add models, repositories, serializers, tenant schema registration, schema parity checks, and
  indexes for current-operator and reporting lookups.
- Backfill one compatibility operator-session history row for qualifying legacy open shifts only
  if the Phase 154 contract permits it; never fabricate attendance history.
- Preserve all closed-shift and transaction history and make rollback behavior explicit.

### Excluded Work

- No new endpoints, attendance screen, takeover button, authorization change, or report change.

### Acceptance Gates

- Fresh database migration, populated-database migration, rollback rehearsal, and re-apply pass.
- Concurrency tests prove database constraints reject duplicate active attendance, break, terminal
  operator, and employee operator records.
- Existing shift, checkout, X/Z, and transaction tests pass without behavior changes.
- Runtime schema registry and tenant schema parity checks include every new object and index.
- Migration contains no destructive rewrite of historical cashier or shift ownership.

## Phase 156 - Attendance and Break Lifecycle

### Objective

Deliver accurate regular-duty, relief-duty, and break records independently of register control.

### Included Work

- Add authorized Time In, Time Out, Start Break, End Break, Start Relief Duty, and End Relief Duty
  use cases and APIs.
- Add a minimal POS attendance panel showing current duty type, start time, active break, elapsed
  break, and safe recovery messages, gated by the default-off rollout flag.
- Enforce one active attendance session, one active break, valid transition order, location scope,
  idempotency, and server timestamps.
- Record B's 12:00-1:00 relief duty separately from B's 3:00-10:00 regular duty.
- Provide manager-visible correction audit events without allowing silent record deletion.

### Excluded Work

- No cashier takeover, PIN authentication, register authorization change, transaction attribution,
  payroll calculation, schedule optimizer, or final attendance report.

### Phase 156 Implementation Contract

- Rollout is controlled by the tenant `system_settings` key
  `pos_cashier_attendance_lifecycle_v1`, whose value is `{ "enabled": true, "location_ids": [...] }`.
  Missing, malformed, disabled, or non-listed locations remain unavailable; reads return a disabled
  feature state and mutations fail closed.
- The lifecycle API is exposed at `/pos/attendance/current`, `/pos/attendance/time-in`,
  `/pos/attendance/time-out`, `/pos/attendance/breaks/start`, `/pos/attendance/breaks/end`,
  `/pos/attendance/relief/start`, `/pos/attendance/relief/end`, and manager-only
  `/pos/attendance/corrections`.
- Every mutation requires an idempotency key. Attendance and break start/end keys are persisted
  with tenant-local unique indexes; all timestamps and actor identity are assigned on the server.
- Stable `POS_ATTENDANCE_*` reason codes cover disabled rollout, location denial, invalid order,
  duplicate active state, missing key, and concurrent conflict. Existing register-shift and checkout
  routes are not modified by this phase.

### Acceptance Gates

- API, repository, permission, tenant-isolation, concurrency, and frontend lifecycle tests pass.
- The target scenario creates exactly three attendance sessions and one break segment.
- Duplicate Time In, overlapping relief/regular duty, invalid break order, and cross-location access
  fail with stable error codes and useful UI messages.
- Refresh and retry do not duplicate attendance or break records.
- Existing POS terminal and checkout behavior remains unchanged.

## Phase 157 - Secure Operator Takeover and Cash Custody

### Objective

Allow an eligible cashier to take or return terminal control without closing the register.

### Included Work

- Add dedicated cashier PIN enrollment/reset/verification with strong hashing, rate limiting,
  lockout, audit logs, and generic failure messages.
- Issue server-controlled, HttpOnly, CSRF-protected operator authority scoped to tenant, location,
  terminal, register shift, employee, and operator session.
- Add atomic Take Over Register, Return Register, Shared Relief Access, Counted Handoff, and End
  Operator Session use cases.
- Require active attendance and no active break for takeover; revoke operator authority on break,
  Time Out, terminal unpair, register close, account disable, or explicit takeover.
- Add counted 3:00 PM custody handoff with expected-cash snapshot, actual count, variance, notes,
  and two-party acknowledgement. Record 12:00-1:00 as shared access without inventing a count.
- Replace only the server authorization rules approved in Phase 154; keep the user-facing checkout
  workflow unchanged until Phase 158. New takeover behavior remains inaccessible while the rollout
  flag is disabled, and the legacy single-cashier path remains unchanged.

### Excluded Work

- No checkout UI integration, broad transaction-flow changes, cashier summary, attendance report,
  or production rollout.

### Acceptance Gates

- Simultaneous takeover attempts produce exactly one current operator and one complete audit trail.
- Invalid, expired, replayed, locked, off-duty, on-break, cross-tenant, cross-location, and
  cross-terminal attempts fail closed.
- A takeover never creates or closes a register shift and never changes the opening float.
- Counted handoff calculations reconcile to the register ledger at one database transaction
  boundary.
- Security, CSRF, cookie, rate-limit, revocation, and authorization tests pass.

## Phase 158 - Checkout and POS Workflow Integration

### Objective

Make the active operator authoritative for every cashier-sensitive POS action and expose a clear,
safe terminal workflow.

### Included Work

- Add the current-cashier banner, locked-terminal screen, Take Over Register flow, PIN prompt,
  Return Register flow, break transition handling, shared-relief disclosure, and counted-handoff
  screen behind the same default-off rollout flag.
- Require a current operator for checkout, payments, refunds, voids, discounts/overrides where
  cashier identity matters, no-sale/drawer-open, parked-sale resume, and online-order cash
  collection.
- Derive and persist `cashier_id` and `operator_session_id` server-side for new transactions and
  relevant immutable audit events.
- Keep X/Z reports and register totals attached to the one register shift while displaying the
  current custodian and shared-access warnings.
- Block break, Time Out, takeover, handoff, or close while an incompatible payment or drawer
  mutation is in flight; provide deterministic recovery after refresh or network failure.
- Make UI behavior accessible and responsive on supported desktop, tablet, and mobile layouts.

### Excluded Work

- No new reporting module, payroll engine, staff scheduling, biometric login, or multi-drawer
  redesign.

### Acceptance Gates

- Target scenario records sales under A, B, A, B in the correct time windows while retaining one
  register shift.
- No client-supplied cashier identifier can override the server-selected operator.
- Parked sales, refunds, voids, online cash collection, and no-sale actions retain both original
  ownership context and actual acting-operator audit evidence.
- In-flight-operation, offline/retry, refresh, duplicate-click, and terminal-unpair tests pass.
- Focused backend/frontend suites and all three production builds pass.

## Phase 159 - Reporting and Reconciliation

### Objective

Expose separate, reconcilable attendance, cashier-sales, register, and custody views.

### Included Work

- Add attendance output for regular duty, relief duty, breaks, and worked minutes without silently
  converting it into payroll.
- Add Cashier Summary based on immutable transaction cashier/operator attribution.
- Keep X/Z and tender reconciliation register-based, not cashier-based.
- Add register timeline and handoff audit showing operator intervals, shared-drawer access, counted
  custody transfers, expected cash, actual cash, and variances.
- Label historical rows without operator-session links and prevent false precision.
- Add export and timezone/business-date behavior defined by Phase 154.

### Excluded Work

- No workflow-state changes, payroll calculation, schedule enforcement, or unrelated analytics.

### Acceptance Gates

- Cashier subtotals equal register transaction totals for the same filters, excluding documented
  non-sale ledger movements.
- Tender totals and handoff snapshots reconcile to the final Z close with documented rounding.
- A's and B's target-scenario attendance, breaks, sales, shared access, custody, and totals are
  correct and independently auditable.
- Historical data is readable and clearly labeled where operator detail does not exist.
- Permission, tenant/location, timezone, pagination, export, and performance tests pass.

## Phase 160 - End-to-End Hardening and Controlled Rollout

### Objective

Prove the complete feature is safe to release and provide a reversible activation path.

### Included Work

- Run the complete 7:00 AM-10:00 PM scenario plus negative, concurrency, retry, offline/recovery,
  security, accessibility, responsive, and cross-app regressions.
- Rehearse forward migration and rollback against production-shaped data and record durations,
  locks, compatibility, and recovery evidence.
- Validate legacy single-cashier behavior with the feature disabled and new behavior behind a
  tenant/location feature flag.
- Add operational metrics and alerts for failed takeovers, duplicate-session constraint failures,
  PIN lockouts, unreconciled handoffs, and reporting mismatches.
- Complete support documentation, user instructions, release inventory, canary activation,
  rollback steps, and post-release verification.

### Excluded Work

- No new product behavior. Any newly discovered enhancement returns to planning instead of being
  hidden inside hardening.

### Acceptance Gates

- The deterministic end-to-end target scenario passes repeatedly with database assertions for all
  attendance, break, operator, transaction, handoff, and register records.
- Security, architecture, compliance, migration, rollback, full regression, production builds,
  Playwright, accessibility, and performance gates pass.
- No critical/high defect, unresolved data mismatch, or unchecked required gate remains.
- Canary enablement and rollback are proven in a non-production environment before production
  activation is requested.
- Ledger evidence links to test output, screenshots/traces, migration rehearsal, and rollout proof.

## Phase 161 - Tenant-Admin Attendance Configuration

### Objective

Let an authorized tenant settings administrator enable or disable Cashier Attendance & Breaks per
active location from POS Setup without editing `system_settings` manually.

### Included Work

- Add a dedicated, tenant-scoped attendance-configuration read/write API that persists the existing
  `pos_cashier_attendance_lifecycle_v1` contract.
- Validate active tenant locations and reject duplicate, invalid, inactive, or cross-tenant IDs.
- Reject activation, deactivation, or location removal while an affected location has an open
  register shift, attendance session, break, or operator session.
- Add a separate Cashier Attendance & Breaks card under Settings > POS Setup with an enable switch,
  location checklist, explicit workflow warning, and its own save boundary.
- Refresh the attendance panel immediately after a successful configuration change.
- Record immutable audit evidence containing actor, prior configuration, resulting configuration,
  affected locations, and request identity.

### Excluded Work

- No payroll, scheduling, biometric authentication, new attendance states, report changes, or
  automatic closure of active shifts, attendance, breaks, or operator sessions.
- No direct browser write to `system_settings` and no cashier permission to mutate rollout state.

### Acceptance Gates

- Authorized settings administrators can enable one or more active tenant locations; cashiers and
  unauthorized users receive a stable denial.
- Missing or malformed configuration remains disabled, and enabling without a location fails
  validation.
- Cross-tenant, inactive, duplicate, and invalid location IDs fail without a partial setting write.
- Mid-shift or active-attendance configuration changes fail closed with actionable conflict details.
- Saving unrelated POS metadata cannot change the attendance rollout setting.
- The attendance panel appears or disappears after save without database editing or application
  restart.
- Backend permission, tenant-isolation, validation, concurrency, audit, and route tests pass.
- Frontend behavior, accessibility, desktop/tablet/mobile rendered checks, all three frontend
  production builds, architecture, compliance, and docs gates pass.

## Phase 163 - Locked-Terminal Cashier Takeover Entry Point

### Objective

Expose the existing server-side operator takeover from the locked terminal so a second cashier can
continue the open register without pretending to resume the opening cashier's shift.

### Included Work

- Keep **Resume Shift** restricted to the cashier who opened the current register shift.
- Add an **Another cashier taking over?** action to the locked-terminal modal.
- Authenticate the incoming cashier through their DGFY account and selected company POS session,
  then submit their dedicated POS PIN to the existing `/pos/terminal/operator/takeover` route.
- Keep the original register shift, opening float, and drawer lifecycle unchanged.
- Explain that the incoming cashier must already have active attendance and no active break; the
  server remains authoritative for that precondition.
- Leave counted custody transfer as a separate handoff flow so an uncounted relief takeover does
  not fabricate cash variance ownership.

### Excluded Work

- No automatic attendance creation for the incoming cashier.
- No counted cash custody transfer in the Break & Lock modal.
- No new database tables, PIN storage, or operator-authority transport.

### Acceptance Gates

- The locked terminal visibly offers owner-only Resume Shift and the separate incoming-cashier
  takeover path.
- Missing credentials, malformed PINs, offline state, inactive attendance, active break, invalid
  PIN, cross-location scope, and concurrent/in-flight operations fail closed without unlocking the
  terminal.
- A successful takeover changes only the current operator session; the register shift and opening
  float remain continuous and all subsequent protected actions are attributed to the incoming
  cashier by the server.
- Focused/shared frontend tests, existing operator-authority API tests, all three frontend builds,
  architecture checks, and a rendered verification path pass before tenant activation.

## Feature-Wide Acceptance Contract

The feature is complete only when all of the following are true:

- A can work 7:00 AM-3:00 PM and take a 12:00-1:00 PM break without closing the register.
- B can work a distinct 12:00-1:00 PM relief session, leave, then start regular duty at 3:00 PM.
- The register has exactly one 7:00 AM-10:00 PM shift and exactly one opening float.
- Only one authenticated cashier operates the terminal at a time.
- Every sale is attributed to the actual operator and remains tied to the same register shift.
- Lunch relief is disclosed as shared-drawer access; no individual variance is fabricated.
- The 3:00 PM counted handoff transfers custody without closing the register.
- Reports independently show attendance, breaks, cashier sales, operator history, register totals,
  handoffs, and final cash reconciliation.
- Unauthorized, concurrent, stale, replayed, cross-tenant, and cross-location operations fail
  safely without partial records.
- Historical data remains readable and rollback is rehearsed.

## Out of Scope

- Payroll computation, overtime rules, and labor-law policy decisions.
- Workforce scheduling or automatic enforcement of planned schedules.
- Biometric attendance or biometric cashier authentication.
- Cloning UTAK's interface or claiming undocumented UTAK behavior.
- Multiple physical drawers on one terminal or one drawer shared simultaneously by terminals.
- Individual cash-variance attribution during an uncounted shared-drawer interval.

## Governing Sources

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0026-browser-session-cookie-authority.md`
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- `docs/architecture/adr/0044-pos-terminal-device-pairing.md`
- `docs/architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md`
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`

ADR 0065 contains affected binding handoff clauses, so Phase 154 requires a new
superseding-in-part ADR and tech-lead approval. ADR 0031 and ADR 0044 contain affected default or
untagged behavior and require dated amendments. ADR 0026 continues to govern cookie and CSRF
authority. No implementation phase may bypass these governance gates.

## Current State and Next Move

- Current repository phase: Phase 163, `completed` on 2026-08-25.
- Planned initiative: Phases 154-163; Phases 154-162 are `completed` and Phase 163 is the
  approved locked-terminal cashier takeover entry point.
- Current phase: Phase 163, Locked-Terminal Cashier Takeover Entry Point, completed after focused
  and full shared-web-core tests, operator-authority API tests, all three production builds, and
  architecture checks passed. A signed-in two-cashier browser run remains an operational
  verification before tenant activation because the local browser had no authenticated second
  cashier session.
- Phase 155 evidence includes the additive migration, tenant schema registry, model associations,
  repository/serializer foundation, and focused persistence tests. Phase 156 evidence now includes
  the lifecycle implementation, migration rollback/re-apply, focused backend/frontend tests, and
  governance/build gates; operator takeover and reporting remain deferred.
- Phase 157 implementation adds dedicated cashier PIN security state, revocable operator authority,
  atomic takeover/return/shared-relief/counted-handoff use cases, CSRF-protected HttpOnly cookie
  transport, and revocation hooks for breaks, time out, terminal unpair, register close, and account
  disable. Phase 158 now makes that active operator authoritative across checkout, payments,
  parked sales, refunds, voids, online cash collection, and drawer mutations while retaining one
  register shift. The A/B/A/B database scenario, focused regressions, governance gates, and all
  three production builds passed on 2026-08-25. Reporting remains deferred to Phase 159.
