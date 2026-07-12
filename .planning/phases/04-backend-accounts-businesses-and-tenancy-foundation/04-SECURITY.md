---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
audit_type: retroactive
asvs_level: 1
block_on: high
threats_total: 36
threats_closed: 35
threats_open: 0
threats_open_non_blocking: 1
unregistered_flags: 0
audited: 2026-07-12
---

# Phase 04 Security Audit — Accounts, Businesses, and Tenancy Foundation

Verification method: read the actual implementation (not SUMMARY prose) for every
declared threat, classify by disposition (`mitigate` / `accept` / `transfer` /
`deferred`), and grep/trace the cited component to confirm the mitigation is
genuinely present at the correct boundary. Adversarial starting hypothesis:
every mitigation is absent until proven otherwise by direct code evidence.

Context: this audit follows a human UAT session in which the project owner ran
the full DB-backed integration/E2E suite (`businessFlows`, `businessValidation`,
`locationRoutes`, `tenantSessionFlows`, `tenantSessionValidation`,
`phase4FullFlow`) against real MySQL and confirmed all pass. That is strong
corroborating evidence for the tenant-isolation, RBAC, and registry-activation
threats below, but every CLOSED verdict in this document is backed by direct
source-code evidence (file:line), not by the UAT result or by SUMMARY.md claims
alone.

## Threat Verification

| Threat ID | Category | Severity | Disposition | Status | Evidence |
|-----------|----------|----------|--------------|--------|----------|
| T-04-01 | Tampering (Password Hash) | high | mitigate | CLOSED | `apps/dgfy-api/src/routes/index.js:50` — `hashPassword: (password) => bcrypt.hash(password, 10)` (cost 10 ≥ 10); `accountUseCases.js` never persists plaintext, only `passwordHash`. |
| T-04-02 | Information Disclosure (Account Lookup) | high | mitigate | CLOSED | Authorization gate is in the use-case layer, not the controller as originally phrased, but is enforced *before* any account data returns: `modules/accounts/usecases/accountUseCases.js:404-427` (`buildGetAccountForAuthorizationUseCase` — self-or-admin, else 403) called from `controllers/accountController.js:47-54`, mounted behind `authenticateAccount` in `routes.js:30`. |
| T-04-03 | Elevation of Privilege (Registration) | medium | mitigate | CLOSED | `accountUseCases.js:190` — new accounts hard-coded `status: 'active'`, no role/privilege field accepted from input. |
| T-04-04 | Denial of Service (Email Uniqueness) | medium | mitigate | CLOSED | `models/Landlord/Account.js:86-87` unique indexes on `email`/`phone`; `accountUseCases.js:152-162` pre-check + `mapUniqueConstraintError()` (`:82-87`) maps a race-condition DB-level violation to 409, never 500. |
| T-04-06 (04-02) | Information Disclosure (`GET /accounts/:id`) | medium | mitigate | CLOSED | `middleware/accountAuthMiddleware.js:34-41` `resolveRole()` (env `ACCOUNT_ADMIN_EMAILS` allowlist) feeding `buildGetAccountForAuthorizationUseCase`; non-self/non-admin → 403 (`accountUseCases.js:413-419`). |
| T-04-07 (04-02) | Spoofing (Session Token) | high | mitigate | CLOSED | `middleware/accountAuthMiddleware.js:55-91` requires `Authorization: Bearer`, `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` (pinned algorithm — no `alg:none`/confusion), checks `token_scope==='dgfy_account_session'`, and re-resolves the account (rejects if inactive) before setting `req.account`. |
| T-04-08 (04-02) | Denial of Service (Registration Endpoint) | medium | accept | CLOSED (accepted, logged) | Confirmed no rate limiting is wired to `/accounts/register` or `/businesses`: `grep -rn "rateLimit" apps/dgfy-api/src` only matches the legacy, out-of-scope `modules/dgfyAuth/routes/dgfyAuthRoutes.js`. `express-rate-limit` is a declared dependency but unused by Phase 4 routes. Logged below in Accepted Risks. |
| T-04-09 (04-02) | Tampering (Request Body) | medium | mitigate | CLOSED | Use-case field validation throughout (`accountUseCases.js`, `businessUseCases.js`, `locationUseCases.js`) returning 400 `DomainErrorCode.VALIDATION_FAILED`; `apps/dgfy-api/eslint.config.mjs:19-30` enforces `no-restricted-imports` for `**/models/**` on `src/modules/**/controllers/**/*.js` — confirmed 0 matches: `grep -rln "models/Landlord\|models/Tenant" apps/dgfy-api/src/modules/*/controllers/*.js` → empty. |
| T-04-SC (04-02) | Supply Chain | high | mitigate | CLOSED | `apps/dgfy-api/package.json` deps (`bcryptjs, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken, morgan, mysql2, nodemailer, redis, sequelize`) confirmed pre-existing via `git log --oneline -- apps/dgfy-api/package.json` (no Phase-4-wave commits touch it). |
| threat_flag: token-in-response (04-03) | Information Disclosure | low | accept | CLOSED (accepted, logged) | `businessController.js:63-86` `onboardStaff` returns the raw invitation token in the HTTP response by explicit plan design; token is `crypto.randomUUID()`-derived, single-use (`invitation.status==='accepted'` replay check, `businessUseCases.js:512-514`), 7-day expiry (`businessUseCases.js:11,379`). User accepted at 04-03 checkpoint. |
| T-04-10 | Information Disclosure (Cross-Tenant Data Leakage) | high | mitigate | CLOSED — mechanism differs from mitigation-plan text | **Discrepancy resolved:** `apps/dgfy-api/src/middleware/tenantContextResolver.js` is built but confirmed **not mounted** anywhere (`grep -rn "tenantContextResolver" apps/dgfy-api/src` only self-references + a doc comment). Isolation is actually enforced structurally: every tenant repository (`locationRepository.js:63-89`, `staffOnboardingRepository.js:63-89`, `accountStaffAssignmentRepository.js`) resolves `businessId → database_name` exclusively via `businessDatabaseRegistryRepository.findByBusinessId()` (landlord DB, never client-suppliable), then opens a **physically separate** MySQL connection per `database_name` via `TenantConnector.getConnection()` (`infra/tenantConnector.js:54-83`, one Sequelize instance per database). Every use case gates access with `requireMembership`/`guardBusinessAccess` (`businessUseCases.js:152-161`, `locationUseCases.js:97-123`) *before* the repository is ever called, so a caller cannot reach another tenant's `database_name` without an active membership row for that specific `businessId`. Net effect (no cross-tenant leakage) is achieved; the specific component named in the mitigation text is dead code. |
| T-04-11 | Denial of Service (Concurrent Registration Spam) | medium | accept | CLOSED (accepted, logged) | Same evidence as T-04-08 — no rate limiting on Phase 4 routes. Logged in Accepted Risks. |
| T-04-12 | Tampering (Transaction Rollback) | medium | mitigate | CLOSED | `businessRepository.js:79-110` `createWithOwnerAndRegistry()` wraps Business insert + owner Membership insert + registry insert in one `sequelize.transaction()`; a registry-repository throw propagates and rolls back all three (proven by a fake transaction-aware Sequelize double in `tests/unit/modules/businesses/businessEntity.test.js` per 04-06-SUMMARY.md, and re-confirmed by direct code read here). |
| T-04-13 | Elevation of Privilege (RBAC) | high | mitigate | CLOSED | `businessUseCases.js`: `buildUpdateBusinessUseCase` (`:274-289`), `buildOnboardStaffViaInvitationUseCase` (`:357-360`), `buildOnboardStaffDirectUseCase` (`:441-444`) all require `role: 'owner'` via `requireMembership()`. `locationUseCases.js` mutations require `role: 'owner'` via `guardBusinessAccess()` (`:151,247,310,348`). `tenantSessionUseCases.js:135-159` — staff without a tenant-local assignment get `NO_TENANT_ASSIGNMENT` (403); owners explicitly bypass only the assignment check, not the membership check. |
| T-04-06-01 | Spoofing (`GET /businesses/:id/tenant-registry`) | high | mitigate | CLOSED | `modules/businesses/routes.js:92-96` mounts the route behind `authenticateAccount`; `tenantRegistryUseCases.js:54-83` additionally requires an active `businessRepository.getMembership()` row before returning metadata (403 `NO_MEMBERSHIP` otherwise). |
| T-04-06-02 | Information Disclosure (`toSafeMetadata`) | high | mitigate | CLOSED | `businessDatabaseRegistryRepository.js:147-159` `toSafeMetadata()` returns only `business_id, database_name, stable_opaque_suffix, status, verified_at, created_at, updated_at` — no host/user/password/DSN field exists on the object at all (verified against the full method body, not just a field-name grep). |
| T-04-06-03 | Tampering (tenant database name generation) | high | mitigate | CLOSED | `businessDatabaseRegistryRepository.js:26-30` `generateStableOpaqueSuffix()` = `sha256(businessId:businessHandle).slice(0,20)`, server-computed only; `findOrCreateForBusiness()` (`:99-118`) never accepts a caller-supplied `database_name`. |
| T-04-06-04 | Elevation of Privilege (registry lookup use case) | high | mitigate | CLOSED | `tenantRegistryUseCases.js` denies non-members (`:69-72`) and, confirmed by direct read, never imports/calls `accountStaffAssignmentRepository`, `TenantConnector`, or `buildActivateBusinessSessionUseCase` — activation remains the separate, already-gated `tenantSessionUseCases.js` path. |
| T-04-06-SC | Supply Chain | high | mitigate | CLOSED | No new deps in 04-06 (entity/use-case/controller/route additions only, confirmed via file diff scope in 04-06-SUMMARY.md and package.json history). |
| T-04-07-01 | Tampering (LocationRepository tenant DB resolution) | high | mitigate | CLOSED | `locationRepository.js:63-89` `resolveDatabaseName(businessId)` — the only input is `businessId`; the actual `database_name` always comes from `businessDatabaseRegistryRepository.findByBusinessId()`. No method on `LocationRepository` accepts a raw database/connection string from a caller. |
| T-04-07-02 | Information Disclosure (staff invitations) | high | mitigate | CLOSED | `staffOnboardingRepository.js:30` `hashToken()` (SHA-256) is the only thing persisted to `StaffInvitation.token_hash` (`:134-144`); raw token appears only in the transient success response / outbound email (`businessUseCases.js:397-400`). |
| T-04-07-03 | Repudiation (invitation acceptance) | medium | mitigate | CLOSED | `businessUseCases.js:512-514` rejects replay (`invitation.status === 'accepted'` → 409) before `markInvitationAccepted()` persists `status`+`accepted_at` (`staffOnboardingRepository.js:178-185`). |
| T-04-07-04 | Elevation of Privilege (staff/location writes) | high | mitigate | CLOSED | Owner-role checks execute before any repository write in both `locationUseCases.js` (`guardBusinessAccess(..., {role:'owner'})` at `:151,247,310,348`) and `businessUseCases.js` (`requireMembership(..., {role:'owner'})` at `:358,442`). |
| T-04-07-05 | Denial of Service (TenantConnector fanout) | medium | mitigate | CLOSED | `infra/tenantConnector.js:42,54-83` caches one Sequelize instance per `databaseName` (`this.connections` Map); `locationRepository.js:110-122`/`staffOnboardingRepository.js:114-126` `withModel(s)` catch every non-`TenantDatabaseUnavailableError` and re-wrap as a stable `TenantDatabaseUnavailableError('unreachable', ...)`, mapped by the use-case layer to `ApplicationResult.failure` (404/503) — never an uncaught exception. |
| T-04-07-SC | Supply Chain | high | mitigate | CLOSED | No new deps in 04-07 (confirmed). |
| T-04-08-01 | Tampering (tenant model registry) | medium | mitigate | CLOSED | `infra/tenantConnector.js:115-145` `getModels()` uses a fixed, hard-coded `modelDefiners` map (`Location/StaffAccount/StaffInvitation/AccountStaffAssignment/TerminalIdentity`) — no request-controlled table name is ever accepted. |
| T-04-08-02 | Elevation of Privilege (tenant session verification, owner-bypass fix) | high | mitigate | CLOSED | `tenantSessionUseCases.js:120-133` — Step 2 now requires `registryEntry.status !== 'active' \|\| !registryEntry.verified_at` to fail (503) *before* Step 3's owner-bypass, closing the exact gap described (owner previously could activate a still-provisioning tenant DB and get HTTP 200). Code matches the SUMMARY's described fix exactly. |
| T-04-08-03 | Information Disclosure (test reports/summaries) | medium | mitigate | CLOSED | Spot-checked `04-08-SUMMARY.md`/`04-09-SUMMARY.md`: "User Setup Required" sections use `<host>`/`<user>`/`<password>` placeholders, never real credentials; JSON/summary report payloads in `activateTenant.js:90-99,137-148` carry only `database_name`, `business_id`, `migrations_executed`, `verified_tables`. |
| T-04-09-01 | Tampering/EoP (activate-tenant target selection) | high | mitigate | CLOSED | `apps/dgfy-migration-runner/src/commands/activateTenant.js:39-44` calls both `assertTargetDbNameAllowed()` and `BUSINESS_DB_NAME_PATTERN.test(databaseName)` (pattern: `apps/dgfy-migration-runner/src/config/env.js:12`) before any connection/DDL — rejects `dgfy_core` or any non-`dgfy_business_*` name. |
| T-04-09-02 | Tampering (tenant schema apply) | high | mitigate | CLOSED | `apps/dgfy-migration-runner/src/schema/applyBusinessSchema.js:50-61` computes `pending` migrations and calls `assertDestructiveAllowed()` before `umzug.up()`. |
| T-04-09-03 | Tampering (registry activation write) | high | mitigate | CLOSED | `activateTenant.js:64-75` resolves the row via `SELECT ... WHERE database_name = ?` (fails closed, throws, if none); `:127-135` `UPDATE ... WHERE database_name = ?` only after `applyAndVerifyBusinessSchema()` resolves successfully; never an `INSERT`. Keyed on the column with a real unique constraint (`database_name`), not the non-unique `business_id`. |
| T-04-09-04 | Information Disclosure (command reports) | medium | mitigate | CLOSED | `activateTenant.js:90-99,137-148` report objects contain only `database_name`/`business_id`/`migrations_executed`/`verified_tables`/`activated` — no credential fields exist on the object. |
| T-04-09-05 | Repudiation (activation audit trail) | medium | mitigate | CLOSED | `activateTenant.js:52-58` `recordCommandStart()` before the mutation; `:104-108,153-157` `recordCommandComplete()` on success; `:160-169` catch-block `recordCommandComplete({exitStatus:'failed', ...})` on any failure — audit trail recorded for both outcomes. |
| T-04-09-SC | Supply Chain | high | mitigate | CLOSED | `apps/dgfy-migration-runner/package.json` deps (`commander, dotenv, mysql2, sequelize, umzug`) confirmed pre-existing via `git log` on that package.json; `activateTenant.js`/`applyBusinessSchema.js` only import already-present packages. |
| UNREGISTERED-04-02-DB-TARGET | Tampering (informal) | medium | accept | CLOSED (accepted, logged) | `apps/dgfy-api/src/config/db.js:8` default is `'dgfy_core'` (changed from legacy `sku_inventory_manager`); comment at `:23-27` documents that `infrastructure/docker/.env` sets `DB_NAME` explicitly in every real environment, so this default is inert in production. Accepted by user per 04-02-SUMMARY.md; `dgfyAuth` (the only other consumer of this shared connection) is slated for Phase 5 removal. |
| UNREGISTERED-04-08-DUPLICATE-REGISTRY-ROW | Tampering/data-integrity (informal) | medium | deferred/unresolved | **OPEN — non-blocking** (severity below `block_on: high` threshold) | See "Open Finding" section below for full analysis. |

## Open Finding: UNREGISTERED-04-08-DUPLICATE-REGISTRY-ROW

**Verified current status:** still present and unfixed in
`apps/dgfy-api/tests/integration/businesses/businessRoutes.test.js:164-176`
(`provisionTenantForBusiness()` still calls
`businessDatabaseRegistryRepository.create({...status:'active'})` directly,
after `POST /businesses` has already auto-created a `provisioning` row for the
same `businessId` via `findOrCreateForBusiness()`). Confirmed via `git grep` —
this is the exact, single remaining instance; all 6 other affected gated
suites were fixed in 04-08 (per `deferred-items.md`).

**Confirmed schema gap:** `business_database_registry` has a unique index on
`stable_opaque_suffix` and on `database_name`
(`models/Landlord/BusinessDatabaseRegistry.js:74-86`,
`dgfyCoreContract.js:100-103`) but **no unique constraint on `business_id`**
(only a non-unique `idx_business_database_registry_business_id`). This is
real and matches the register's description.

**Production-reachability analysis (this is the part the register asked me to
resolve):** I grepped every call site of
`businessDatabaseRegistryRepository.create(...)` and
`.findOrCreateForBusiness(...)` under `apps/dgfy-api/src` (not tests):

```
apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js:97
    tenantRegistry = await registryRepository.findOrCreateForBusiness({...})
```

**This is the only production call site**, and it is idempotent by
construction (`findOrCreateForBusiness()` does a `findOne({where:{business_id}})`
before ever creating a row, `businessDatabaseRegistryRepository.js:104-105`).
`.create()` itself is never called from any `src/` file — only from the one
remaining unfixed test helper. The `activate-tenant` CLI command
(`apps/dgfy-migration-runner/src/commands/activateTenant.js`) resolves and
updates rows keyed on the **unique** `database_name` column, which
structurally cannot misroute even if a duplicate `business_id` row existed.

**Verdict:** this is a **test-helper hygiene bug**, not an exploitable
production defect — there is no HTTP endpoint, use case, or CLI path in
`apps/dgfy-api/src` or `apps/dgfy-migration-runner/src` that can create a
second `business_database_registry` row for the same business today. It is,
however, a genuine **latent defense-in-depth gap**: the database schema
itself does not forbid a duplicate row, so any *future* code path that calls
`.create()` directly (bypassing `findOrCreateForBusiness()`) would silently
create ambiguity for `findByBusinessId()`'s `findOne()` (no `ORDER BY`) —
which is exactly the resolver `locationRepository.js`/`staffOnboardingRepository.js`/
`tenantSessionUseCases.js` all depend on for tenant isolation (T-04-07-01,
T-04-10). Because no current code path triggers it, I assessed severity as
**medium** (not high) — it does not meet `block_on: high` and does not block
ship, but it should not be left permanently unaddressed given how much of
Phase 4's tenant-isolation argument rests on `findByBusinessId()` resolving
unambiguously.

**Recommended remediation (future wave, non-blocking):**
1. Fix `businessRoutes.test.js`'s `provisionTenantForBusiness()` to resolve
   the existing `provisioning` row via `findByBusinessId()` and call
   `updateStatus()` on it, exactly as done for the other 6 suites in 04-08
   (already documented in `deferred-items.md`).
2. Add a unique constraint/index on `business_database_registry.business_id`
   at the schema level (defense-in-depth — makes this class of bug
   structurally impossible regardless of future call sites).

## Accepted Risks Log

The following threats carry an `accept` disposition. Per the audit's
verification rule for `accept`, presence of an entry in this log (rather than
a code-level mitigation) is the required evidence.

| Threat ID | Risk | Accepted rationale | Accepted by |
|-----------|------|---------------------|-------------|
| T-04-08 / T-04-11 | No rate limiting on `/accounts/register`, `/accounts/login`, `/businesses`, or any Phase 4 endpoint — a scripted client can spam registration/login/business-creation requests. | Deferred to the infrastructure layer / a later phase per 04-02-PLAN.md and 04-05-PLAN.md's explicit dispositions. `express-rate-limit` is already a project dependency (used by the legacy `dgfyAuth` module) and is a low-effort follow-up if this is revisited. | Project plan authors (04-02, 04-05); carried forward unchanged through Phase 4. |
| threat_flag: token-in-response (04-03) | `POST /businesses/:id/staff` (invitation path) returns the raw invitation token directly in the HTTP response body. | Token is `crypto.randomUUID()`-derived (not guessable), single-use (replay rejected), and expires in 7 days. Reviewed and explicitly accepted by the user at the 04-03 checkpoint. | User, at 04-03 `checkpoint:human-verify` gate. |
| UNREGISTERED-04-02-DB-TARGET | `apps/dgfy-api/src/config/db.js`'s non-test default database changed to `dgfy_core`; the same shared connection is also used by the out-of-scope legacy `dgfyAuth` module, which would target the wrong database if `DB_NAME` were ever left unset in a real environment. | `infrastructure/docker/.env` always sets `DB_NAME=sku_inventory_manager` explicitly in every real deployment (env wins over the code default), and `dgfyAuth` is slated for removal in Phase 5. | User, per 04-02-SUMMARY.md. |

## Unregistered Flags

None beyond the two already carried in the register
(`UNREGISTERED-04-02-DB-TARGET`, `UNREGISTERED-04-08-DUPLICATE-REGISTRY-ROW`).
No new attack surface was found during this audit that lacks a threat mapping.
`04-03-SUMMARY.md`'s `## Threat Flags` section (`token-in-response`) is the
only SUMMARY-level flag in the phase and is already mapped/accepted above.

## Severity-Filtered Gate Computation

- `block_on: high` → only `high`/`critical` severity **open** threats count
  toward `threats_open`.
- 35/36 threats are CLOSED (verified mitigated or properly accepted/logged).
- 1/36 threats (`UNREGISTERED-04-08-DUPLICATE-REGISTRY-ROW`) is OPEN but
  assessed at `medium` severity (below the `high` block threshold) — tracked
  here, does **not** count toward `threats_open`.
- **`threats_open: 0`** — nothing blocks ship under this phase's `block_on:
  high` configuration.
