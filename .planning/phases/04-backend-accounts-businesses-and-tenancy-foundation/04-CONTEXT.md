# Phase 4: Backend Accounts, Businesses, and Tenancy Foundation - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers backend APIs for Accounts, Businesses, and Tenancy using the stable DGFY schema built in Phase 2 and the proven migration scripts from Phase 3. It implements the first user-facing backend scope: account registration/login, business creation/management, staff/branch administration, and tenant session binding. The APIs follow the established modular-monolith pattern (`routes -> controllers -> usecases -> repositories -> models`) and are gated by explicit landlord membership plus tenant-local assignment evidence per API-04.

**In scope:** Account registration/login with optional email verification; account profile management (email, password, name, phone, extensible metadata); operator account lookup; business creation/selection with automatic owner assignment; staff onboarding via email invitations or direct add; branch/location management through business APIs; tenant context resolution and mid-session business switching; comprehensive tests for success, validation, conflicts, replay rejection, logout, and durable persistence.

**Out of scope:** Product/POS/payment/fiscal domain APIs (Phase 5+); frontend implementation (Phase 5+); production cutover or rehearsal (Phase 6+); staff "Link to DGFY" account linking feature (deferred).

</domain>

<decisions>
## Implementation Decisions

### Account Registration and Authentication

- **D-01:** Email Verification — Account registration creates accounts immediately but marks them unverified. Login works, but users are prompted to verify email within a grace window. Balances security against frictionless onboarding (chosen: Optional/configurable verification).

- **D-02:** Password Recovery — Use existing token/OTP pattern from legacy auth infrastructure (if available) rather than building a dedicated forgot-password endpoint. Keeps password recovery mechanism consistent across the platform (chosen: Use existing token/OTP pattern).

- **D-03:** Account Profile Fields — Support email, password, name, phone at the account level plus an extensible metadata object for future custom fields without schema changes. Allows notifications, password recovery, and account ownership tracking while remaining open to future extensions (chosen: Extensible with custom fields).

- **D-04:** Account Lookup — Expose an admin-only endpoint (`/accounts/:id` or similar) that lets operators search and view account details for support/auditing purposes. Self-service users can only view their own account (chosen: Admin lookup endpoint).

### Session Management and Tenant Binding

- **D-05:** Login and Auto-Binding — Login endpoint returns a session plus a business list. If the user has exactly one business, the session is automatically bound to that business. If multiple businesses exist, the client receives the list and must select which one to activate (chosen: Auto-bind single tenant, explicit selection for multiple).

- **D-06:** Tenant Context Header — Tenant/business context is passed via a request header. The specific header name (e.g., `x-business-id` vs `x-company-token`) must match the convention already decided in prior phases (Phase 1-3); this is a dependency on prior architectural decisions, not a new decision (chosen: Header-based, match existing convention).

- **D-07:** Session Lifetime and Refresh — Session token lifetime, refresh token behavior, and automatic expiration follow the same pattern as the existing backend auth (chosen: Match existing backend behavior). This maintains consistency across legacy and new APIs during the migration period.

- **D-08:** Logout Behavior — Logout is stateless: client clears local tokens, and tokens remain valid on the backend until they naturally expire. No backend session revocation or immediate invalidation of other active sessions (chosen: Stateless, client-side cleanup only). This aligns with the architecture's stateless JWT/token model and simplifies session management during migration.

### Business Owner Scope and Permissions

- **D-09:** Role-Based Permissions — Assign roles (owner, manager, staff) with fixed, predefined capabilities. Owner can do everything; manager can manage staff and day-to-day branch operations; staff can execute operations within their assigned branch. Simple and familiar (chosen: Role-based with fixed capabilities).

- **D-10:** Business Creator as Owner — When an account creates a new business, they automatically become the owner in the same request. No separate role-assignment step (chosen: Automatic owner assignment).

- **D-11:** Staff Onboarding — Support both email invitations (async, owner sends invite that staff accepts) and direct add (sync, owner immediately adds staff without sending invite). Owner can choose which approach per staff member (chosen: Both invitations and direct add, owner discretion).

- **D-12:** Branch and Location Management — Branch/location creation and management is exposed through the Businesses APIs (`POST /businesses/:id/branches`, etc.), not as a separate Tenancy module. Business = Tenant, so branch operations are business-scoped (chosen: Branches under Businesses APIs, not separate Tenancy module).

### API Endpoint Organization

- **D-13:** Module Structure — Business and tenant are the same entity (one business = one tenant database). Therefore, fold tenant session management into the Businesses APIs rather than creating a separate `/tenancy` route module. Three route modules: `/accounts` (auth/profile), `/businesses` (CRUD/staff/branches/tenant-session), and no separate tenancy module (chosen: Fold tenancy into businesses).

- **D-14:** Tenant/Business Activation Pattern — Use a separate endpoint to activate/switch which business a user is working in during a session. Login returns unbound session + business list. `POST /businesses/:businessId/activate-session` (or similar) switches the active tenant context. Allows mid-session business switching without re-login (chosen: Option 3 - Separate business activation endpoint).

### Claude's Discretion

No open implementation discretion beyond the locked decisions above. All areas were user-guided to specific choices.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/PROJECT.md` — database-first DGFY standalone refactor scope, Phase 2/3 completion notes, business context.
- `.planning/REQUIREMENTS.md` — API-01 through API-06 requirements for Phase 4 and milestone definition of done.
- `.planning/ROADMAP.md` — Phase 4 goal and success criteria.
- `.planning/STATE.md` — current phase state and carried-forward concerns.

### Domain and Account Model
- `refactor/DGFY_Domain_01_Accounts.md` — Foundational account hierarchy, business structure, staff assignment model, landlord/tenant database architecture. **Critical reading.** Defines the distinction: DGFY Account (landlord-scoped) vs. Staff Account (tenant-scoped), and Business = Tenant.
- `refactor/DGFY_Implementation_Phases.md` — High-level implementation sequencing and decision rationale.

### Architecture Governance
- `docs/START_HERE.md` — canonical documentation lookup order; authoritative, last reviewed 2026-03-06.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — backend boundaries and architecture guardrails; requires `routes -> controllers -> usecases -> repositories -> models`; authoritative, last reviewed 2026-03-06.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — ADR requirements, architecture proof, hardening contract for account/tenant/session work; authoritative, last reviewed 2026-05-21.
- `docs/architecture/adr/0026-browser-session-cookie-authority.md` — Browser session/token/CSRF authority; defines access-token-in-memory vs. refresh-cookie model. Informs D-07 and D-08 (session lifetime and logout behavior).
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` — Standalone DGFY API service architecture; `apps/dgfy-api` is already a bounded auth-only deployment. Phase 4 APIs may coexist with or eventually migrate to this service.

### Prior Phase Evidence (locked decisions this phase builds on)
- `.planning/phases/01-architecture-and-migration-runner-contract/01-CONTEXT.md` — D-03 locked environment variable contracts (`SOURCE_DB_*`, `TARGET_DB_*`); D-10 defined destructive-operation gating via `--confirm-destructive`. Session decisions in Phase 4 should be consistent with any bearer/token patterns already established.
- `.planning/phases/02-dgfy-database-foundation/02-CONTEXT.md` — D-01/D-02 database naming (`dgfy_core`, `dgfy_business_*`); D-06 through D-15 define exactly which landlord/tenant tables exist (accounts, businesses, business_memberships, business_database_registry, staff_accounts, account_staff_assignments, roles/role_permissions, etc.).
- `.planning/phases/02-dgfy-database-foundation/02-VERIFICATION.md` — Confirms target schema contracts and migration metadata this phase's APIs will read/write.
- `.planning/phases/03-old-to-new-migration-proof/03-CONTEXT.md` — D-01 locked migration-target selection as explicit operator-supplied list (mirrors the pattern for business/tenant selection this phase will use).

### Database and Legacy Integration
- `.planning/codebase/ARCHITECTURE.md` — Legacy backend structure, modular-monolith pattern, tenant resolution via `tenantHandler.js` and `TenantConnector.js`; Phase 4 uses these same patterns.
- `.planning/codebase/CONVENTIONS.md` — Coding conventions (camelCase functions, module composition via `index.js`, error handling via `ApplicationResult` and `DomainError`, repository contracts, etc.). Phase 4 code must follow these.
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js` and `dgfyBusinessContract.js` — Authoritative target-schema contracts (table/column/index/constraint shape) that Phase 4 APIs will read/write.
- `backend/src/modules/dgfy/index.js` — Existing DGFY module structure (auth, company switching, membership, tenant-session). Phase 4 extends or replaces this with the new Accounts/Businesses APIs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/modules/dgfy/usecases/dgfyAuthUseCases.js` — Existing account/company/session use cases from legacy DGFY module. Phase 4 may reuse or replace portions depending on how closely they map to new requirements.
- `backend/src/middleware/tenantHandler.js` — Tenant context resolution from headers, cookies, invite tokens. Phase 4 will reuse this pattern for binding business context to requests.
- `backend/src/utils/TenantConnector.js` — Per-tenant Sequelize connection cache. Phase 4 APIs use this to access tenant-scoped models.
- `backend/src/models/Landlord/*` — Existing landlord-scoped models (DgfyAccount, DgfyAccountTenantMembership, DgfyBusiness, etc.). Phase 4 will add/extend models for the new account/business/staff schema contracts.
- `backend/src/modules/shared/contracts/applicationResult.js` and `domainErrors.js` — Established error handling pattern. Phase 4 use cases MUST return ApplicationResult envelopes and use DomainError for domain-level failures.
- `backend/src/modules/shared/controllers/useCaseResponder.js` — Standard response formatter for use case results. Phase 4 controllers use `sendUseCaseResult` to format API responses consistently.

### Established Patterns
- **Module composition via index.js** — Each domain module exports use-case builders and controllers through its `index.js`. Phase 4's Accounts/Businesses modules follow this pattern.
- **Transport-only controllers** — Controllers translate HTTP request/response; business logic lives in use cases. Phase 4 controllers must not import models directly (enforced by eslint `no-restricted-imports`).
- **Repository-owned Sequelize access** — All model queries happen through repositories. Phase 4 repositories own `create`, `findBy*`, `update`, `delete` logic.
- **Tenant context in requests** — Middleware binds tenant context before route handlers. Phase 4 endpoints access tenanted models through the request context, not by manually resolving which database to use.
- **Error handling via DomainError and ApplicationResult** — Use cases fail with structured errors; controllers respond with JSON via `sendUseCaseResult`. No raw promise rejections in route handlers.

### Integration Points
- Phase 2's schema contracts define the write-side shape (which tables/columns Phase 4 APIs can create/update).
- Phase 3's migration scripts define the legacy-to-DGFY ID mapping that Phase 4 APIs will reference when resolving old accounts to new DGFY accounts during migration.
- Phase 4's backend APIs will be called by Phase 5's compatibility seams (translating old POS/Storefront requests to new API calls).
- Phase 6's release evidence will verify that Phase 4's account/business/tenancy flows satisfy architecture and hardening requirements.

</code_context>

<specifics>
## Specific Ideas

- Account header convention: Use the existing convention from Phase 1-3 (likely `x-company-token` or `x-business-id`). Researcher must verify which was locked and ensure consistency.
- Business activation endpoint signature: Consider `POST /businesses/:businessId/activate-session` or `POST /businesses/:businessId/switch-context` — exact naming deferred to planner based on API design consistency.
- Staff onboarding flow: Email invitations may require an `invitations` table or collection. Direct add should immediately create a staff account and send a notification (distinct from an invitation).
- Admin account lookup: Consider whether to expose a separate `/admin/accounts` endpoint or fold into `/accounts` with role-gated access. Planner decides based on access control strategy.
- Metadata extensibility: Account profile metadata object should be a JSON column in the database, not a separate table. Allows schema-free extensions without migrations.

</specifics>

<deferred>
## Deferred Ideas

- **Staff "Link to DGFY" feature** — Deferred from Phase 4. Staff can log into POS without a full DGFY Account. Linking their POS credential to a full DGFY Account is a future feature (noted in `refactor/DGFY_Domain_01_Accounts.md` §6 as "Still open" and deferrable). Revisit when there's a concrete use case (e.g., staff shopping as consumers, or staff registering their own business). Belongs in a dedicated "Account Linking" phase after Phase 4 stabilizes.
- **Co-ownership for businesses** — Noted in `refactor/DGFY_Domain_01_Accounts.md` §8 as a planned future feature. The data model supports it; MVP has single owner per business. Phase 4 locks single-owner model. Co-ownership design and implementation belongs to a future phase.
- **Branch Manager role (scoped DGFY Account)** — Mentioned in account hierarchy. MVP focuses on Business Owner and Staff roles. Branch Manager (a DGFY Account with branch-scoped permissions) is deferred.

---

*Phase: 4-Backend Accounts, Businesses, and Tenancy Foundation*
*Context gathered: 2026-07-11*
