# 7/28/2026 - DGFY Switch Account Plan

**Implementation status:** Phases 1-7 completed and validated locally on July 28, 2026.

## Objective

Allow one DGFY identity to access multiple companies while keeping its role, permissions, terminal access, and shift activity isolated per company.

Example:

| DGFY identity | Company | Workflow | Company role |
| --- | --- | --- | --- |
| `user@gmail.com` | ABC Retail | MSME | `msme_admin` |
| `user@gmail.com` | Masu Cafe | F&B | `fnb_cashier` |

The user does not manually toggle between Admin and Cashier. Selecting a company establishes a new company-scoped session, and the backend resolves the role assigned in that company.

## Critical Assessment

- A DGFY account is the global identity, not the authorization record.
- Each company tenant owns its local user, role preset, permissions, location grants, terminal access, and shifts.
- Reusing a role from the previously selected company would create a cross-tenant privilege escalation.
- Company switching must invalidate stale tenant context before protected data is loaded.
- An active cashier shift must never silently move to another company or user context.

## Phase 0 - Data Integrity

**Priority / affected area:** P0, DGFY accounts, tenant memberships, tenant users.

**Root cause:** Global identity and tenant authorization can be confused when records are matched only by email.

**Recommended implementation:** Treat `dgfy_account_id + tenant_id` as the membership identity and bind each membership to one permanent tenant `user_id`. Audit duplicate or mismatched memberships before enabling role switching.

**Dependencies:** Tenant schema health and membership inventory.

**Validation:** Confirm one DGFY account can map to different tenant user roles without sharing permissions.

**Completion criteria:** Every accepted membership has one valid tenant user belonging to the same company.

## Phase 1 - Invitation Assignment

**Priority / affected area:** P0, company invitations and role assignment.

**Root cause:** A generic invitation role or same-email fallback can activate the wrong tenant authorization record.

**Recommended implementation:** Validate `role_preset_key` against the target company's workflow mode. Persist the preset's canonical role and permissions in that tenant only. On acceptance, activate the exact `tenant_user_id` created by the invitation and reject stale or mismatched bindings.

**Dependencies:** Phase 0 data model and the mode-aware role catalogs.

**Validation:** Invite the same DGFY identity as an MSME Admin in one company and an F&B Cashier in another. Reject cross-mode presets, mismatched role/preset pairs, and missing invited tenant users.

**Completion criteria:** Accepting an invitation cannot create, overwrite, or elevate the user's role in another company.

## Phase 2 - Secure Company Switching

**Priority / affected area:** P0, authentication and session authority.

**Root cause:** Reusing the previous tenant session can expose stale permissions and data.

**Recommended implementation:** Switch through the backend membership endpoint, rotate the HttpOnly session, clear the previous tenant context, and return the selected company's local role and permissions.

**Dependencies:** Phase 1.

**Validation:** Direct API calls with an old company context must fail after switching.

**Completion criteria:** Exactly one company context is authoritative in the browser session.

**Implemented:** A successful switch revokes the previous tenant refresh/access credentials, clears the old tenant cookies before setting the new session, and rejects protected browser requests when their company header conflicts with the active HttpOnly company cookie.

## Phase 3 - Company Selector UI

**Priority / affected area:** P1, Admin profile and company cards.

**Root cause:** Company labels do not clearly communicate the user's role in each company.

**Recommended implementation:** Show the company-specific role label on every company entry and switch directly through the secure backend flow without requesting credentials again.

**Dependencies:** Phase 2 response contract.

**Validation:** The selector displays `Business Owner`, `Admin`, `Manager`, or `Cashier` from the selected tenant membership.

**Completion criteria:** The selected company and effective role are unambiguous before entering POS.

**Implemented:** The account profile selector now shows the effective company-specific role for every membership, including `Business Owner`, mode-aware Admin/Manager/Cashier roles, and safe fallback labels. Any authenticated account can load and select its authorized companies through the secure backend switch flow; the active-shift guard and backend membership authorization remain authoritative.

## Phase 4 - Role-Based POS Access

**Priority / affected area:** P0, POS navigation and protected actions.

**Root cause:** Hiding UI alone does not enforce company-specific permissions.

**Recommended implementation:** Authorize every protected endpoint using the selected company's local user, permissions, locations, terminal, and shift state. Render navigation from the same server-provided permissions.

**Dependencies:** Phases 1-3.

**Validation:** A cashier cannot call admin APIs directly, while the same DGFY identity can use admin APIs only in companies where it is assigned an admin role.

**Completion criteria:** UI and API authorization agree for every company role.

**Implemented (2026-07-28):**

- Backend authorization now resolves effective permissions from the selected company's tenant-local user. Explicit permission assignments are authoritative; legacy role defaults are used only when an account has no explicit permissions.
- Category management, affiliate actions, location monitoring, location grants, checkout actions, settings, and user administration use capability checks rather than an `admin` role label.
- The POS receives a restricted operational settings bootstrap for users without `settings:view`; cashiers no longer call the full administrative settings endpoint during login, refresh, or company switching.
- POS navigation uses the same company-local permissions as the backend. Selecting another company rotates the tenant session before the new permissions and UI are loaded.
- Master administration remains an explicit platform-level bypass. A tenant `admin` label alone does not bypass an explicit restricted permission set.

**Validation evidence (2026-07-28):**

- Backend permission, middleware, terminal readiness, and safe-bootstrap contracts: 18/18 passed.
- Backend tenant isolation, DGFY session, and company-switch transport contracts: 60/60 passed.
- Frontend permission/navigation contracts: 56/56 passed.
- Frontend terminal lock and company-switch contracts: 11/11 passed.
- Architecture guardrails: passed across 37 modules and 370 code files.
- Controller boundary check: passed across 75 controllers.
- Backend and frontend lint: 0 errors. Existing non-blocking warnings remain tracked as general cleanup debt.
- POS production build: passed.

## Phase 5 - Shift Safety

**Priority / affected area:** P0, terminal and shift workflows.

**Root cause:** A role or company switch during an active shift can break cashier accountability.

**Recommended implementation:** Bind shifts to permanent tenant `user_id`, terminal, location, and company. Block company switching when the current operator owns an active shift unless the shift is closed through the governed flow.

**Dependencies:** Phase 4.

**Validation:** Test admin and cashier shifts, lock/unlock, company switching, and stale-session attempts.

**Completion criteria:** Every shift remains attributable to one tenant user and cannot cross companies.

**Implemented (2026-07-28):**

- The permanent tenant `user_id` remains the authoritative shift owner. Existing shift records retain their terminal and location bindings inside the company tenant schema.
- Company switching now performs a backend open-shift check for the authenticated tenant operator before creating the target company session.
- A tenant operator who owns an open shift receives a `409 Conflict` with the governed instruction to close the active shift first. The target tenant session is not created and membership selection is not changed.
- Pure DGFY account discovery remains available before a tenant operator context exists, while protected company switching from an active POS session is shift-safe.
- The existing POS company selector remains disabled while the current operator has an active shift, matching the authoritative backend rule.
- No database migration was required because the existing shift schema already stores the permanent tenant user, terminal, and location identifiers and is isolated by tenant/company schema.

**Validation evidence (2026-07-28):**

- DGFY authentication and company-switch use cases: 49/49 passed.
- Shift authorization, recovery, terminal readiness, and session transport contracts: 27/27 passed.
- Frontend company selector, terminal lock, and shift ownership contracts: 14/14 passed.
- Architecture guardrails: passed across 37 modules and 370 code files.
- Controller boundary check: passed across 75 controllers.
- Backend and frontend lint: 0 errors. Existing non-blocking warnings remain tracked as general cleanup debt.

## Phase 6 - Auditing

**Priority / affected area:** P1, security and operations.

**Root cause:** Role assignment and company switching need traceable evidence.

**Recommended implementation:** Audit invitation creation, selected preset, acceptance, rejection, company switch, session rotation, denied access, and shift-related switch blocks.

**Dependencies:** Phases 1-5.

**Validation:** Correlate each switch and role assignment with actor, company, tenant user, timestamp, and request ID.

**Completion criteria:** Operators can reconstruct who accessed which company under which role.

**Implementation evidence (2026-07-28):**

- Invitation creation, role preset selection, acceptance, rejection, denied access, and shift-related switch blocks record structured audit evidence.
- Company-switch success is recorded only after the previous tenant session is revoked and the new company-scoped session cookies are issued.
- Session-rotation failures record a failed company-switch outcome with `SESSION_ROTATION_FAILED`; they are never recorded as successful switches.
- Audit records correlate the actor account, company, tenant membership and user, assigned role and preset, request ID, IP address, user agent, and outcome.
- Focused DGFY authentication and tenant-session transport suites passed 57/57 tests, including successful and failed session rotation.
- Source lint, architecture guardrails, and controller boundary validation passed.

## Phase 7 - Validation And Release Gate

**Priority / affected area:** P0, release readiness.

**Root cause:** Unit tests alone do not prove cross-company isolation.

**Recommended implementation:** Add backend role/preset tests, cross-tenant authorization tests, browser company-switch tests, shift safety tests, and migration/schema checks.

**Dependencies:** Phases 0-6.

**Validation:** Run architecture guardrails, controller boundaries, tenant schema checks, backend tests, frontend tests, and responsive browser tests.

**Completion criteria:** No role, permission, location, terminal, shift, or cached data leaks between companies.

**Implementation evidence (2026-07-28):**

- Architecture guardrails passed across 37 modules and 370 code files.
- Controller boundary validation passed across 75 controllers.
- Tenant schema health passed for all 11 active tenant schemas.
- Focused POS backend validation passed 12 suites and 101 tests.
- Focused POS frontend validation passed 13 files and 137 tests.
- The legacy generated-barcode promotion migration has an executable contract suite covering forward migration, rollback, tenant-database deduplication, missing-table handling, restrictive row selection, and unsafe database identifiers; 3/3 tests passed.
- The POS production build passed after transforming 3,944 modules.
- Runtime health checks passed for the POS frontend, backend API, device bridge, MySQL dependency, and supporting local applications.
- Browser smoke checks passed at desktop (1440x900), tablet (1024x768), and iPhone (390x844) viewports with HTTP 200, no error boundary, no page exceptions, no failed requests, and no HTTP 5xx responses.
- Documentation lint, compliance checks, migration syntax checks, and Git diff safety checks passed.

**Residual non-blocking risks:**

- Existing lint cleanup remains: 43 targeted frontend warnings and 2 unrelated backend warnings, with no lint errors.
- The POS build still reports stale Browserslist metadata and large JavaScript bundles. These are performance cleanup items and do not block the validated role-switching workflow.
- Authenticated browser company switching remains covered by focused component and backend integration contracts; the responsive browser smoke intentionally avoids mutating live shift or payment state.

## Authoritative References

- [START_HERE.md](./START_HERE.md)
- [ARCHITECTURE_BOUNDARIES.md](./architecture/ARCHITECTURE_BOUNDARIES.md)
- [ARCHITECTURE_GOVERNANCE.md](./architecture/ARCHITECTURE_GOVERNANCE.md)
- [ADR 0020 - Mode-Aware RBAC](./architecture/adr/0020-mode-aware-rbac-and-role-presets.md)
- [ADR 0026 - Browser Session Cookie Authority](./architecture/adr/0026-browser-session-cookie-authority.md)
- [ADR 0031 - POS Identity, Terminal, And Shift Binding](./architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md)
