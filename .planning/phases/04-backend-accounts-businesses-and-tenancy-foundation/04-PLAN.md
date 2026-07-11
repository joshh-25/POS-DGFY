---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
plan: master
type: execute
wave: master
depends_on: ["03-06"]
files_modified: [
  "backend/src/modules/accounts/index.js",
  "backend/src/modules/accounts/routes.js",
  "backend/src/modules/accounts/controllers/accountController.js",
  "backend/src/modules/accounts/usecases/accountUseCases.js",
  "backend/src/modules/accounts/repositories/accountRepository.js",
  "backend/src/models/Landlord/Account.js",
  "backend/src/modules/businesses/index.js",
  "backend/src/modules/businesses/routes.js",
  "backend/src/modules/businesses/controllers/businessController.js",
  "backend/src/modules/businesses/usecases/businessUseCases.js",
  "backend/src/modules/businesses/repositories/businessRepository.js",
  "backend/src/models/Landlord/Business.js",
  "backend/src/models/Landlord/BusinessMembership.js",
  "backend/src/modules/businesses/controllers/tenantSessionController.js",
  "backend/src/modules/businesses/usecases/tenantSessionUseCases.js",
  "backend/src/models/Tenant/Location.js",
  "backend/src/models/Tenant/StaffAccount.js",
  "backend/src/models/Tenant/TerminalIdentity.js",
  "backend/tests/integration/accounts/**",
  "backend/tests/integration/businesses/**",
  "backend/tests/integration/tenancy/**"
]
autonomous: false
requirements: ["API-01", "API-02", "API-03", "API-04", "API-05", "API-06"]
user_setup: []

must_haves:
  truths:
    - "User can register a new DGFY account with email and password; account is immediately created but marked unverified"
    - "User can log in with valid credentials and receive a session token; unverified accounts can still log in"
    - "User with exactly one business receives session automatically bound to that business; user with multiple businesses must select one"
    - "User can update profile (email, password, name, phone) and see changes reflected in account record"
    - "Account lookup endpoint returns account details; restricted to admin access for other accounts, self-access for own account"
    - "Business owner can create a new business and automatically becomes owner in the same request"
    - "Business owner can view business details, list branches, and manage staff"
    - "Staff can be onboarded via email invitation (async) or direct add (sync); both flows persist staff and permission records"
    - "User can activate/switch business context mid-session using separate activation endpoint; new active context is bound to session"
    - "Tenant session creation requires landlord membership AND tenant-local assignment or authorized scope evidence"
    - "Tenant session creation is rejected when requirements are not met"
    - "Logout is stateless; client clears tokens; backend tokens remain valid until natural expiration"
    - "All flows persist correctly to DGFY schema; re-reading data confirms durability"
    - "Controllers are transport-only; business logic in use cases; data access in repositories"
    - "Tests cover success, validation, conflicts, duplicate/replay rejection, logout, and durable persistence"
  
  artifacts:
    - "backend/src/modules/accounts/routes.js — account registration, login, profile, lookup routes"
    - "backend/src/modules/accounts/controllers/accountController.js — transport layer for account operations"
    - "backend/src/modules/accounts/usecases/accountUseCases.js — business logic for registration, login, profile updates"
    - "backend/src/modules/accounts/repositories/accountRepository.js — Sequelize access for accounts, memberships"
    - "backend/src/models/Landlord/Account.js — DGFY Account model matching dgfyCoreContract"
    - "backend/src/modules/businesses/routes.js — business CRUD, branch, staff, activation routes"
    - "backend/src/modules/businesses/controllers/businessController.js — transport layer for business operations"
    - "backend/src/modules/businesses/usecases/businessUseCases.js — business creation, selection, staff management logic"
    - "backend/src/modules/businesses/repositories/businessRepository.js — landlord business/membership access"
    - "backend/src/modules/businesses/controllers/tenantSessionController.js — tenant session activation transport"
    - "backend/src/modules/businesses/usecases/tenantSessionUseCases.js — tenant context resolution and binding"
    - "backend/src/models/Landlord/Business.js, BusinessMembership.js — landlord business/membership models"
    - "backend/src/models/Tenant/Location.js, StaffAccount.js, TerminalIdentity.js — tenant-scoped models"
    - "backend/tests/integration/accounts/{test-suites} — comprehensive account tests"
    - "backend/tests/integration/businesses/{test-suites} — comprehensive business and tenancy tests"
  
  key_links:
    - "Phase 2 Schema Contracts → Phase 4 Models: dgfyCoreContract.js defines landlord tables; Phase 4 models match exactly"
    - "Phase 3 ID Mappings → Phase 4 Account Lookup: migration metadata from Phase 3 informs legacy→DGFY lookups in Phase 4"
    - "ARCHITECTURE_BOUNDARIES.md → Phase 4 Controllers: routes→controllers→usecases→repositories→models enforced per D-05 (architecture proof)"
    - "Decision D-05/D-09 → Phase 4 Session: login returns unbound session + business list; auto-bind single business, explicit select for multiple"
    - "Decision D-14 → Phase 4 Tenancy APIs: tenant session endpoint requires landlord membership + tenant-local evidence"
    - "Phase 4 APIs → Phase 5 Compatibility: Phase 5 translates old POS/Storefront requests to new Phase 4 APIs"
---

## Executive Summary

**Phase 4: Backend Accounts, Businesses, and Tenancy Foundation** delivers the first user-facing APIs for the DGFY standalone refactor. Building on the stable schema contracts from Phase 2 and the proven migration scripts from Phase 3, Phase 4 implements:

- **Accounts APIs** (API-01): Registration/login, profile management, account lookup backed by DGFY schema
- **Businesses APIs** (API-02): Business creation/selection, branch registry, staff onboarding, automatic owner assignment
- **Tenancy APIs** (API-03, API-04): Tenant context resolution, session creation with explicit membership + assignment verification
- **Architecture Compliance** (API-05, API-06): All APIs follow `routes → controllers → usecases → repositories → models`; comprehensive tests cover success, validation, conflicts, replay rejection, logout, and persistence

**Key Decisions Locked (from 04-CONTEXT.md D-01 through D-14):**
- Email verification optional; users can log in unverified (D-01, D-02)
- Session auto-binds to single business; explicit selection for multiple (D-05)
- Business creator auto-becomes owner (D-10)
- Staff onboarded via email invitation or direct add; owner chooses (D-11)
- Tenancy folded into Businesses APIs; no separate tenancy module (D-13)
- Tenant session requires landlord membership + tenant-local evidence (D-04, per API-04)
- Stateless logout (D-08)

**Success Criteria (Measurable):**
1. ✓ User registration/login works; unverified users can log in
2. ✓ Account profile updates; admin lookup works
3. ✓ Business creation auto-assigns owner; staff onboarding (invitations + direct add) works
4. ✓ Tenant session creation succeeds with membership + assignment; fails without
5. ✓ All endpoints follow architecture pattern; all flows are tested end-to-end
6. ✓ Phase 4 APIs ready for Phase 5 compatibility seams

---

## Phase 4 Wave Structure

Phase 4 executes in 5 sequential waves plus a final checkpoint. Each wave is a separate executable plan file (04-NN-PLAN.md).

| Wave | Plan File | Goal | Depends On | Status |
|------|-----------|------|-----------|--------|
| **Wave 1** | 04-01-PLAN.md | Account foundation: models, repository, registration/login/profile use cases | Phase 3 Complete | Not Started |
| **Wave 2** | 04-02-PLAN.md | Account & business routes/controllers: HTTP layer for account & business endpoints | Wave 1 Complete | Not Started |
| **Wave 3** | 04-03-PLAN.md | Business foundation: creation, ownership, membership, staff data models & repository (per D-12) | Wave 2 Complete | Not Started |
| **Wave 3.5** | 04-03.5-PLAN.md | Location & branch management: Location model, use cases, endpoints (per D-12) | Wave 3 Complete | Not Started |
| **Wave 4** | 04-04-PLAN.md | Tenant session & context binding: activate endpoint, tenant context resolution use cases | Wave 3.5 Complete | Not Started |
| **Wave 5** | 04-05-PLAN.md | Comprehensive integration & E2E tests: success, validation, conflicts, replay, logout, persistence | Wave 4 Complete | Not Started |
| **Checkpoint** | 04-CHECKPOINT.md | Architecture verification & release gate review (BLOCKED until Wave 5 complete) | Wave 5 Complete | Not Started |

**Wave Dependencies:**
```
Phase 3 ──→ Wave 1 ──→ Wave 2 ──→ Wave 3 ──→ Wave 3.5 ──→ Wave 4 ──→ Wave 5 ──→ Checkpoint
```

**Parallelization:**
- Waves execute sequentially (each depends on previous completion)
- Within each wave, independent tasks can run in parallel (e.g., model creation and route scaffolding)

---

## Wave 1: Account Foundation — Models, Repository, Registration/Login Logic

**Wave 1 Goal:** Implement Account model, repository, and core use cases for registration, login, and profile management. Establishes the foundation that all later waves depend on.

**Wave 1 Success Criteria:**
1. ✓ DgfyAccount model exists; maps to dgfyCoreContract `accounts` table exactly
2. ✓ AccountRepository provides create, findBy*, update operations
3. ✓ Registration use case creates account, marks unverified, returns account + password_hash success
4. ✓ Login use case validates credentials, returns session token + business list
5. ✓ Account profile update use case modifies email, password, name, phone, custom metadata
6. ✓ Account lookup use case returns details; admin-accessible, self-accessible
7. ✓ All use cases return ApplicationResult envelope; DomainError for validation/auth failures
8. ✓ Tests for registration success, duplicate email rejection, login success/failure, profile update

**Wave 1 Deliverables:**
- backend/src/models/Landlord/Account.js
- backend/src/modules/accounts/repositories/accountRepository.js
- backend/src/modules/accounts/usecases/accountUseCases.js
- backend/tests/unit/modules/accounts/accountUseCases.test.js
- backend/tests/integration/accounts/accountRepository.test.js

**Estimated Effort:** ~10-15% context (models are straightforward; use case logic is moderate complexity)

---

## Wave 2: Account & Business Routes & Controllers — HTTP Transport Layer

**Wave 2 Goal:** Expose Wave 1 use cases through HTTP endpoints. Implement account registration, login, profile management routes and controllers. Scaffold business routes/controllers structure (no business logic yet).

**Wave 2 Success Criteria:**
1. ✓ POST /accounts/register endpoint accepts {email, password, name, phone}; returns account + unverified status
2. ✓ POST /accounts/login endpoint accepts {email, password}; returns session token + business list (empty if new user)
3. ✓ GET /accounts/me endpoint returns authenticated user's account details
4. ✓ PATCH /accounts/me endpoint updates profile (email, password, name, phone, metadata)
5. ✓ GET /accounts/:id endpoint returns account details; admin-only for other accounts
6. ✓ Endpoints reject duplicate email, invalid credentials, missing fields
7. ✓ Controllers use useCaseResponder to format ApplicationResult responses
8. ✓ Controllers do NOT import models directly; use repositories via use cases
9. ✓ Business routes scaffolded (empty controllers, ready for Wave 3 logic)
10. ✓ Integration tests verify endpoint behavior, error responses

**Wave 2 Deliverables:**
- backend/src/modules/accounts/routes.js
- backend/src/modules/accounts/controllers/accountController.js
- backend/src/modules/accounts/index.js (exports)
- backend/src/modules/businesses/routes.js (scaffold)
- backend/src/modules/businesses/controllers/businessController.js (scaffold)
- backend/src/modules/businesses/index.js (scaffold exports)
- backend/tests/integration/accounts/accountRoutes.test.js

**Estimated Effort:** ~10-12% context (HTTP layer is transport-only; mostly glue code)

---

## Wave 3: Business Foundation — Creation, Ownership, Staff Onboarding

**Wave 3 Goal:** Implement Business model, membership management, staff onboarding use cases. Business creator auto-becomes owner (D-10). Staff can be onboarded via invitation or direct add (D-11).

**Wave 3 Success Criteria:**
1. ✓ DgfyBusiness model exists; maps to dgfyCoreContract `businesses` table exactly
2. ✓ DgfyBusinessMembership model exists; tracks account-to-business membership + roles
3. ✓ Business repository provides create, findBy*, update, membership operations
4. ✓ Create business use case: accepts {legal_name, display_name, business_handle}; creates business + auto-assigns creator as owner + creates membership record
5. ✓ List user's businesses use case: returns all businesses user has membership in (with role)
6. ✓ Onboard staff use case: invitation path (creates staff_account, sends email, awaits acceptance); direct add path (creates staff_account immediately, creates assignment)
7. ✓ Accept invitation use case: validates invitation, creates assignment, marks invitation accepted
8. ✓ Update business use case: modifies display_name, business_handle, status
9. ✓ Get business use case: returns business details + member list
10. ✓ All use cases return ApplicationResult; reject duplicate business_handle, invalid role, non-existent business
11. ✓ Tests for create success, duplicate handle rejection, membership creation, staff onboarding both paths

**Wave 3 Deliverables:**
- backend/src/models/Landlord/Business.js
- backend/src/models/Landlord/BusinessMembership.js
- backend/src/modules/businesses/repositories/businessRepository.js
- backend/src/modules/businesses/usecases/businessUseCases.js
- backend/src/modules/businesses/controllers/businessController.js (filled in)
- backend/src/modules/businesses/routes.js (filled in)
- backend/tests/unit/modules/businesses/businessUseCases.test.js
- backend/tests/integration/businesses/businessRepository.test.js

**Wave 3 Integration Points:**
- D-10 (creator as owner): hardcoded in create business use case
- D-11 (invitation + direct add): branching logic in onboard staff use case
- Phase 2 schema: business_memberships table per dgfyCoreContract

**Estimated Effort:** ~12-15% context (more complex; membership relationships, dual paths for staff onboarding)

---

## Wave 4: Tenant Session & Context Binding — Activation, Context Resolution

**Wave 4 Goal:** Implement tenant context resolution and mid-session business switching (D-14). Tenant session endpoint requires landlord membership + tenant-local assignment evidence (D-04, API-04).

**Wave 4 Success Criteria:**
1. ✓ DgfyBusinessDatabaseRegistry model exists; maps to dgfyCoreContract `business_database_registry` table
2. ✓ Tenant models exist: Location, StaffAccount, TerminalIdentity, AccountStaffAssignment (per dgfyBusinessContract)
3. ✓ Tenant session use case accepts {businessId}; validates membership, resolves tenant DB, creates/returns session context
4. ✓ Tenant session use case rejects: user without membership, user without tenant-local assignment, invalid business ID
5. ✓ Activate business endpoint (POST /businesses/:businessId/activate-session) switches active context mid-session
6. ✓ Tenant context resolver middleware: extracts business context from header; validates membership; binds tenant models to request
7. ✓ Session includes: access_token, tenant_id, business_id, active_business_context, active_staff_assignment (if staff)
8. ✓ Tests for success, membership rejection, assignment rejection, context isolation

**Wave 4 Deliverables:**
- backend/src/models/Landlord/BusinessDatabaseRegistry.js
- backend/src/models/Tenant/Location.js
- backend/src/models/Tenant/StaffAccount.js
- backend/src/models/Tenant/AccountStaffAssignment.js
- backend/src/models/Tenant/TerminalIdentity.js
- backend/src/modules/businesses/usecases/tenantSessionUseCases.js
- backend/src/modules/businesses/controllers/tenantSessionController.js
- backend/src/middleware/tenantContextResolver.js (updates/extends)
- backend/tests/integration/tenancy/tenantSessionUseCases.test.js

**Wave 4 Integration Points:**
- D-04 (membership + assignment requirement): enforced in tenantSessionUseCase
- D-14 (activation endpoint): separate POST endpoint, not part of login
- Phase 2 schema: business_database_registry table per dgfyCoreContract; location, staff_accounts, account_staff_assignments tables per dgfyBusinessContract

**Estimated Effort:** ~12-15% context (tenant resolution is complex; multi-database awareness, assignment validation)

---

## Wave 5: Comprehensive Integration & E2E Tests

**Wave 5 Goal:** Build comprehensive test suite covering all success paths, validation failures, conflicts, replay rejection, logout behavior, and durable persistence. Validate architecture compliance (`npm run check:architecture`).

**Wave 5 Success Criteria:**
1. ✓ Account tests: registration (success, duplicate email, validation), login (success, wrong password), profile update (success, invalid), logout (stateless behavior), persistence (re-read confirms durability)
2. ✓ Business tests: creation (success, duplicate handle, validation), membership (auto-owner, add staff, list members), staff onboarding (invitation path, direct add, accept invitation), business selection (single business auto-bind, multiple explicit select)
3. ✓ Tenancy tests: session creation (success, no membership, no assignment, tenant isolation), business activation mid-session (success, invalid business, permission check), logout (session token remains valid)
4. ✓ E2E flow tests: new user registration → create business → create staff → create branch → activate session → logout
5. ✓ Conflict tests: duplicate registration during concurrent requests, staff onboarding race conditions, business creation conflicts
6. ✓ Replay rejection tests: re-sending registration request fails; accept-invitation idempotency
7. ✓ Persistence tests: transaction rollback scenarios, data consistency across landlord/tenant databases
8. ✓ Architecture compliance: `npm run check:architecture` passes; `npm run check:controller-boundaries` passes; no direct model imports in controllers
9. ✓ Coverage: >80% coverage for account, business, tenancy modules

**Wave 5 Deliverables:**
- backend/tests/integration/accounts/accountFlows.test.js (end-to-end flows)
- backend/tests/integration/accounts/accountValidation.test.js (validation, conflicts)
- backend/tests/integration/accounts/accountPersistence.test.js (durability, replay)
- backend/tests/integration/businesses/businessFlows.test.js (business creation, staff onboarding)
- backend/tests/integration/businesses/businessValidation.test.js (conflicts, duplicates)
- backend/tests/integration/tenancy/tenantSessionFlows.test.js (activation, isolation)
- backend/tests/integration/tenancy/tenantSessionValidation.test.js (permission checks, rejection)
- backend/tests/e2e/phase4FullFlow.test.js (complete user journey)

**Wave 5 Verification:**
- `npm run test -- --path=backend/tests/integration/accounts backend/tests/integration/businesses backend/tests/integration/tenancy` passes
- `npm run check:architecture` passes; controller allowlist not expanded
- Coverage report shows >80% for accounts, businesses, tenancy modules

**Estimated Effort:** ~15-18% context (comprehensive testing is thorough; many scenarios, edge cases)

---

## Architecture Integration & Layering

### Strict Boundary Enforcement (API-05)

**Phase 4 APIs MUST follow:**
```
HTTP Request
    ↓
Routes (Express route definitions)
    ↓
Controllers (Transport layer; parse request, call use cases, format response)
    ↓
Use Cases (Business logic; orchestrate repositories, validate rules, return ApplicationResult)
    ↓
Repositories (Data access layer; all Sequelize queries happen here)
    ↓
Models (Sequelize ORM; table definitions matching schema contracts)
    ↓
Database (dgfy_core landlord, dgfy_business_* tenants)
```

**Enforcement Mechanisms:**
1. ESLint rule: `no-restricted-imports` blocks direct model imports in controllers
2. Allowlist (temporary): `backend/src/config/controllerModelImportAllowlist.js` — Phase 4 MUST NOT add entries
3. Script gate: `npm run check:architecture` — verifies pattern compliance
4. Script gate: `npm run check:controller-boundaries` — confirms controllers are transport-only
5. Architecture review (Wave 5): verify no controller→model shortcuts

### Schema Contracts (Phase 2 Integration)

**Landlord Schema (dgfy_core):**
Phase 4 models map exactly to dgfyCoreContract:
- `accounts` → DgfyAccount model
- `businesses` → DgfyBusiness model
- `business_memberships` → DgfyBusinessMembership model
- `business_database_registry` → DgfyBusinessDatabaseRegistry model
- `business_audit_logs` → read-only (Phase 4 logs business creation/membership changes)

**Tenant Schema (dgfy_business_<suffix>):**
Phase 4 models map exactly to dgfyBusinessContract:
- `locations` → Location model
- `staff_accounts` → StaffAccount model
- `account_staff_assignments` → AccountStaffAssignment model
- `roles` → Role model (pre-populated seeds)
- `role_permissions` → RolePermission model (read-only)
- `terminal_identities` → TerminalIdentity model

**Verification Approach:**
- Wave 1: Seed test databases with schema contracts; verify models load correctly
- Wave 5: Final verification command (see Testing Strategy)

### Legacy Compatibility & Reuse

**Reusable from existing DGFY module:**
- `ApplicationResult` envelope pattern from `backend/src/modules/shared/contracts/applicationResult.js`
- `DomainError` for domain-level failures from `backend/src/modules/shared/contracts/domainErrors.js`
- `useCaseResponder` for formatting responses from `backend/src/modules/shared/controllers/useCaseResponder.js`
- `TenantConnector` for per-tenant Sequelize connections from `backend/src/utils/TenantConnector.js`
- `tenantHandler` middleware for tenant context resolution from `backend/src/middleware/tenantHandler.js`

**Extensions Needed:**
- tenantHandler expanded to handle business context (not just account context)
- New repositories follow established repository pattern (see `backend/src/modules/dgfy/repositories/` for examples)

### Phase 3 Migration Reference

**Phase 4 APIs read Phase 3 artifacts:**
- Migration metadata in `dgfy_migration_meta` database: account/business/staff mapping records
- Legacy-to-DGFY ID mappings: used during account lookup and legacy data linking
- Tenant coverage reports: inform which businesses have been migrated

**Phase 4 Does NOT:**
- Execute or trigger Phase 3 migrations (separate migration runner)
- Rely on legacy schema structures (only reads migration metadata)
- Perform data transformation (Phase 3 responsibility)

### Phase 5 Compatibility Handoff

**Phase 5 will call Phase 4 APIs:**
- Legacy POS login → new POST /accounts/login API
- Legacy business/tenant context → new POST /businesses/:id/activate-session API
- Legacy staff lookup → new business staff list endpoints
- Legacy branch info → new business branches endpoints

**Phase 4 Design Ensures:**
- APIs are stateless (no server-side session state beyond JWT)
- Response contracts are stable and documented
- Tenant context is explicit (header-based, per D-06)
- Error responses are consistent (ApplicationResult.toJSON())

---

## Testing Strategy

### Unit Tests (Per Wave)

**Wave 1:**
- AccountRepository CRUD operations
- Registration use case (success, duplicate, validation)
- Login use case (success, failure, session building)
- Profile update use case (success, validation)

**Wave 3:**
- BusinessRepository operations
- Business creation use case (auto-owner, duplicate handle)
- Staff onboarding use cases (invitation, direct add, acceptance)

**Wave 4:**
- Tenant session use case (membership check, assignment validation)
- Tenant context resolver (extraction, validation)

### Integration Tests (Per Wave)

**Wave 2:**
- Account registration endpoint (HTTP 201, HTTP 400, HTTP 409)
- Login endpoint (HTTP 200 with token, HTTP 401)
- Profile endpoint (PATCH HTTP 200, PATCH HTTP 400)
- Account lookup endpoint (HTTP 200 self, HTTP 200 admin, HTTP 403 unauthorized)

**Wave 3:**
- Business creation endpoint (HTTP 201, HTTP 409)
- Business list endpoint (HTTP 200 with memberships)
- Staff onboarding endpoints (HTTP 202 for invitation, HTTP 201 for direct add)

**Wave 4:**
- Tenant session activation endpoint (HTTP 200, HTTP 403, HTTP 404)

**Wave 5:**
- End-to-end flows (new user → business → staff → tenant session)
- Conflict scenarios (concurrent registrations, race conditions)
- Replay rejection (idempotent operations, duplicate rejection)
- Persistence validation (commit to DB, re-read confirms)

### E2E Tests (Wave 5)

**User Journey 1: Business Owner Registration → Business Creation**
1. POST /accounts/register {email, password, name, phone} → HTTP 201 + account
2. POST /accounts/login {email, password} → HTTP 200 + session (no businesses yet)
3. POST /businesses {legal_name, display_name, business_handle} → HTTP 201 + business
4. POST /accounts/login again → HTTP 200 + session auto-bound to business (single business)

**User Journey 2: Staff Onboarding → Tenant Session**
1. Owner creates staff via email invitation: POST /businesses/:id/staff {email, name} → HTTP 202 (invitation sent)
2. Staff receives email with acceptance link; clicks link → POST /invitations/:token/accept → HTTP 200
3. Owner creates branch: POST /businesses/:id/branches {name, address} → HTTP 201
4. Owner assigns staff to branch: PATCH /businesses/:id/staff/:staffId {branch_id} → HTTP 200
5. Staff logs in: POST /accounts/login {email, password} → HTTP 200 + unbound session (staff account)
6. Staff activates business: POST /businesses/:id/activate-session → HTTP 200 + tenant context
7. Staff can now access tenant-scoped endpoints (with x-business-id header)

**User Journey 3: Business Switching Mid-Session**
1. Owner with 2 businesses logs in → HTTP 200 + session + business list (unbound)
2. Owner activates Business A: POST /businesses/A/activate-session → HTTP 200 + active context = A
3. Owner activates Business B: POST /businesses/B/activate-session → HTTP 200 + active context = B (same session)
4. Owner logs out: stateless; tokens remain valid until expiry

### Architecture Verification (Wave 5)

```bash
# Controller boundary check
npm run check:controller-boundaries
# Expected: PASS (no models imported in controllers)

# Architecture guardrails check
npm run check:architecture
# Expected: PASS (all use cases follow pattern, repositories own data access)

# Test coverage
npm run test -- --coverage backend/tests/integration/accounts backend/tests/integration/businesses backend/tests/integration/tenancy
# Expected: >80% coverage for all three modules

# Lint pass (no ESLint violations)
npm run lint
# Expected: PASS
```

---

## Verification Checklist

### Phase 4 Completion Gate

**Architecture Compliance:**
- [ ] Controller imports audit: no direct model imports (ESLint passes)
- [ ] Repository pattern: all data access through repositories
- [ ] Use case pattern: all business logic in use cases, return ApplicationResult
- [ ] `npm run check:architecture` passes
- [ ] `npm run check:controller-boundaries` passes
- [ ] No exceptions added to controllerModelImportAllowlist.js

**API-01 Verification (Accounts):**
- [ ] Registration endpoint exists; creates unverified account; rejects duplicate email
- [ ] Login endpoint exists; returns session + business list; rejects invalid credentials
- [ ] Profile endpoint exists; updates email/password/name/phone; enforces email uniqueness
- [ ] Lookup endpoint exists; admin-accessible; self-accessible
- [ ] All return ApplicationResult; errors are DomainError

**API-02 Verification (Businesses):**
- [ ] Business creation endpoint exists; auto-assigns creator as owner
- [ ] Business selection endpoint exists; returns user's businesses + roles
- [ ] Staff onboarding endpoints exist; both invitation and direct-add paths work
- [ ] Business updates (legal_name, display_name, status) work correctly

**API-03 Verification (Tenancy):**
- [ ] Tenant registry lookup endpoint exists; returns business metadata + database pointer
- [ ] Tenant provisioning metadata is available (locations, staff assignments)
- [ ] Tenant context selection (business activation) endpoint exists

**API-04 Verification (Security):**
- [ ] Tenant session creation validates landlord membership
- [ ] Tenant session creation validates tenant-local assignment or authorized scope
- [ ] Session creation is rejected when requirements are not met
- [ ] Tenant context is isolated (no cross-tenant data leakage in tests)

**API-05 Verification (Architecture):**
- [ ] Routes → Controllers (HTTP parsing only)
- [ ] Controllers → Use Cases (call, error handling, response formatting)
- [ ] Use Cases → Repositories (data layer calls, validation)
- [ ] Repositories → Models (Sequelize queries)
- [ ] No shortcuts (controllers do not call repositories directly; repositories do not call use cases)

**API-06 Verification (Testing):**
- [ ] Success path tests: registration, login, business creation, staff onboarding, session activation
- [ ] Validation tests: duplicate email, invalid credentials, invalid role, non-existent business
- [ ] Conflict tests: concurrent registrations, race condition scenarios
- [ ] Replay rejection tests: duplicate registration fails; accept invitation is idempotent
- [ ] Logout tests: stateless; token remains valid until expiry
- [ ] Persistence tests: end-to-end flow confirms DB state durability
- [ ] Coverage >80% for accounts, businesses, tenancy modules

**Phase 2 Schema Contract Alignment:**
- [ ] DgfyAccount model matches dgfyCoreContract.accounts (all columns, indexes, constraints)
- [ ] DgfyBusiness model matches dgfyCoreContract.businesses
- [ ] DgfyBusinessMembership model matches dgfyCoreContract.business_memberships
- [ ] DgfyBusinessDatabaseRegistry model matches dgfyCoreContract.business_database_registry
- [ ] Tenant models match dgfyBusinessContract (Location, StaffAccount, AccountStaffAssignment, TerminalIdentity)
- [ ] Verification command (final Wave 5 task) confirms schema match

**Phase 3 Migration Alignment:**
- [ ] Migration metadata is readable by Phase 4 (Phase 4 does not modify it)
- [ ] Legacy-to-DGFY ID mappings are used in account lookup (if applicable)
- [ ] Tenant coverage from Phase 3 rehearsal is reflected in business registry

**Phase 5 Readiness:**
- [ ] API response contracts are documented (json-schema or OpenAPI)
- [ ] Error responses follow ApplicationResult.toJSON() format
- [ ] Tenant context header convention matches existing phase 1-3 convention (per D-06)
- [ ] Session token format and lifetime match backend auth (per D-07)

---

## Must-Haves (Goal-Backward Verification)

### Observable Truths (From User's Perspective)

1. **Registration works:**
   - New user fills in email/password/name/phone → account created → marked unverified → user can log in
   - Duplicate email rejected with HTTP 409 error

2. **Login works:**
   - Correct credentials → session token + business list returned
   - No business yet → empty list; user can now create one
   - One business → session auto-bound; user is ready to operate
   - Multiple businesses → list returned; user must select which one to activate
   - Wrong credentials → HTTP 401 + error message

3. **Profile management works:**
   - Logged-in user updates email/password/name/phone → changes persisted
   - Email update must be unique; duplicate rejected
   - Password update takes effect immediately; next login uses new password
   - Name/phone updates reflected in account record

4. **Business creation works:**
   - Owner fills in legal_name, display_name, business_handle → business created → owner auto-assigned
   - Owner can view business details
   - Duplicate business_handle rejected
   - Business handle must be unique per landlord

5. **Staff onboarding works (Invitation Path):**
   - Owner sends staff invitation: email + name → invitation created → email sent → HTTP 202
   - Staff receives email with acceptance link
   - Staff clicks link → account created → assignment ready
   - Owner can see staff in business staff list

6. **Staff onboarding works (Direct Add Path):**
   - Owner directly adds staff: email + name → staff account created immediately → HTTP 201
   - No email sent; owner is responsible for communicating credentials
   - Staff can log in immediately with provided credentials

7. **Business switching works:**
   - Owner has 2 businesses
   - After login, session is unbound + business list returned
   - Owner calls activate-session for Business A → context is now Business A
   - Owner calls activate-session for Business B → context is now Business B (same session)
   - No re-login required; activation uses same session token

8. **Tenant session security works:**
   - User without membership tries to activate session → rejected HTTP 403
   - User with membership but no tenant-local assignment tries to activate → rejected HTTP 403
   - User with membership + assignment activates successfully → tenant context bound
   - Tenant-scoped requests after activation can access tenant-local data

9. **Logout is stateless:**
   - User calls logout endpoint → session token cleared on client side
   - Token remains valid on server until natural expiration
   - User can continue to make requests with the token (if they somehow still have it)
   - This is intentional (stateless design per D-08)

10. **Persistence is durable:**
    - After registration, re-reading account record confirms all fields saved
    - After business creation, re-reading business record confirms all fields saved
    - After staff assignment, re-reading assignment record confirms binding persisted
    - Cross-database consistency: landlord and tenant data both committed

### Required Artifacts (Files That Must Exist)

**Landlord Models:**
- backend/src/models/Landlord/Account.js — DgfyAccount model
- backend/src/models/Landlord/Business.js — DgfyBusiness model
- backend/src/models/Landlord/BusinessMembership.js — DgfyBusinessMembership model
- backend/src/models/Landlord/BusinessDatabaseRegistry.js — DgfyBusinessDatabaseRegistry model

**Tenant Models:**
- backend/src/models/Tenant/Location.js — Location model
- backend/src/models/Tenant/StaffAccount.js — StaffAccount model
- backend/src/models/Tenant/AccountStaffAssignment.js — AccountStaffAssignment model
- backend/src/models/Tenant/TerminalIdentity.js — TerminalIdentity model

**Accounts Module:**
- backend/src/modules/accounts/routes.js — account endpoints
- backend/src/modules/accounts/controllers/accountController.js — transport layer
- backend/src/modules/accounts/usecases/accountUseCases.js — business logic
- backend/src/modules/accounts/repositories/accountRepository.js — data access
- backend/src/modules/accounts/index.js — exports (builder pattern)

**Businesses Module:**
- backend/src/modules/businesses/routes.js — business endpoints
- backend/src/modules/businesses/controllers/businessController.js — transport layer
- backend/src/modules/businesses/usecases/businessUseCases.js — business logic
- backend/src/modules/businesses/repositories/businessRepository.js — landlord data access
- backend/src/modules/businesses/controllers/tenantSessionController.js — tenant session transport
- backend/src/modules/businesses/usecases/tenantSessionUseCases.js — tenant context logic
- backend/src/modules/businesses/index.js — exports (builder pattern)

**Tests:**
- backend/tests/integration/accounts/accountFlows.test.js
- backend/tests/integration/accounts/accountValidation.test.js
- backend/tests/integration/accounts/accountPersistence.test.js
- backend/tests/integration/businesses/businessFlows.test.js
- backend/tests/integration/businesses/businessValidation.test.js
- backend/tests/integration/tenancy/tenantSessionFlows.test.js
- backend/tests/integration/tenancy/tenantSessionValidation.test.js
- backend/tests/e2e/phase4FullFlow.test.js

### Key Links (Critical Connections)

1. **Phase 2 Schema → Phase 4 Models**
   - dgfyCoreContract.js (landlord tables) → Account, Business, BusinessMembership models
   - dgfyBusinessContract.js (tenant tables) → Location, StaffAccount, AccountStaffAssignment models
   - Verification: Wave 1 seeds test DB with contracts; models load and map correctly

2. **Decision D-10 → Business Creation**
   - User creates business → use case automatically assigns creator as owner
   - Membership record created with role='owner' in same request
   - No separate ownership assignment step

3. **Decision D-05 → Session Binding**
   - Login returns unbound session + business list
   - Single business → auto-bind in login response
   - Multiple businesses → client must call activate-session to bind
   - Verify in Wave 2 login controller test

4. **Decision D-14 → Tenant Session Security**
   - activate-session endpoint validates membership (account in business_memberships)
   - activate-session endpoint validates tenant-local assignment (account_staff_assignments if staff)
   - Rejection happens before tenant context is bound
   - Verify in Wave 4 tenantSessionUseCase tests

5. **Architecture Pattern → All Modules**
   - Routes file exports Express router with all endpoints
   - Controllers import use cases (via index.js), not models
   - Use cases import repositories (via index.js), not models
   - Repositories query models directly
   - Verify via ESLint + check:architecture script

6. **Phase 3 Migrations → Phase 4 ID Mapping**
   - Phase 4 reads migration metadata (legacy account ID → DGFY account ID)
   - Used in account lookup flow (if old system is providing legacy IDs)
   - Does not trigger Phase 3 migrations; Phase 3 runner is independent

7. **Phase 5 Compatibility → Phase 4 APIs**
   - Phase 5 will translate old POS/Storefront requests to new Phase 4 endpoints
   - Phase 4 API contracts must be stable before Phase 5 starts
   - Tenant context header convention (D-06) must match legacy convention
   - Session token format (D-07) must match backend auth

---

## Individual Wave Plans

Each wave is executed as a separate plan file:

- **04-01-PLAN.md** — Account Foundation (models, repository, registration/login/profile use cases)
- **04-02-PLAN.md** — Account & Business Routes/Controllers (HTTP transport layer)
- **04-03-PLAN.md** — Business Foundation (creation, ownership, staff onboarding per D-10, D-11)
- **04-03.5-PLAN.md** — Location & Branch Management (Location model, repository, endpoints per D-12)
- **04-04-PLAN.md** — Tenant Session & Context Binding (activation, tenant resolution per D-04, D-14)
- **04-05-PLAN.md** — Comprehensive Testing & Architecture Verification

**To Execute Phase 4:**
1. Read this master plan (04-PLAN.md) for context and overview
2. Execute 04-01-PLAN.md to completion
3. Execute 04-02-PLAN.md to completion
4. Execute 04-03-PLAN.md to completion
5. Execute 04-03.5-PLAN.md to completion (NEW — Location & branch management)
6. Execute 04-04-PLAN.md to completion
7. Execute 04-05-PLAN.md to completion
8. Review Phase 4 completion checklist above
9. Archive SUMMARY file: `.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-SUMMARY.md`
10. Await Phase 5 planning

---

## Appendix: Phase 4 Requirement Traceability

| Requirement | Wave | Plan | Key Artifact | Decision(s) |
|-------------|------|------|--------------|-----------|
| API-01: Accounts | 1-2 | 04-01, 04-02 | accountUseCases.js, accountController.js | D-01, D-02, D-03, D-04 |
| API-02: Businesses | 3 | 04-03 | businessUseCases.js, businessController.js | D-10, D-11 |
| API-02 (Branches): Locations | 3.5 | 04-03.5 | locationUseCases.js, locationController.js, Location model | D-12 |
| API-03: Tenancy | 4 | 04-04 | tenantSessionUseCases.js | D-06, D-13, D-14 |
| API-04: Tenant Security | 4 | 04-04 | tenantSessionUseCase verification | D-04, D-14 |
| API-05: Architecture | 1-5 | all | routes.js, *Controller.js, *UseCase.js, *Repository.js | D-05 (pattern enforcement) |
| API-06: Testing | 5 | 04-05 | integration/e2e test suites | All decisions validated via tests |

---

**End of Master Plan**
*Last Updated: 2026-07-11*
*Status: Ready for Wave 1 Execution*
