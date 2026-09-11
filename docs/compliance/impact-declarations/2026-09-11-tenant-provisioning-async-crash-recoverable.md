---
status: reference
owner: engineering
last_reviewed: 2026-09-11
declaration_id: 2026-09-11-tenant-provisioning-async-crash-recoverable
classification: regulatory
surfaces: tenant-registration,admin,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.09.11
verification_evidence: node --check on every changed apps/dgfy-api .js file (5 files + 1 new),npm run build:skupervisor (succeeded),npm run check:architecture (54 modules / 569 files OK; 95 controller files OK),node scripts/check-app-version-bump.js --floor (dgfy-api 1.12.3->1.12.4, dgfy-ims 1.11.0->1.11.1),apps/dgfy-api/tests/tenantProvisioning.test.js + tenantProvisioningAdminUserId.test.js + approveTenantUseCase.storeTemplateKey.test.js + tenantProvisioning.storefrontBootstrap.test.js + tenantProvisioningStoreProfileProvenance.test.js (30 of 32 passed; the 2 failures are pre-existing and unrelated -- both are in the "atomic cleanup on failure" suite and fail before reaching any changed code, on a real MySQL connection attempt this sandbox has no credentials for, not on anything this PR touches)
rollback_note: Revert this commit set. No migration, no schema change, no new persisted columns -- company_registration_applications.provisioning_status and its supporting CAS columns already existed and are unchanged. approveTenantUseCase.js's control flow reverts to a synchronous await; tenantProvisioningService.js's admin-user INSERT reverts to unconditional (drops the ON DUPLICATE KEY UPDATE clause); tenantModelFactory.js reverts to spreading the tenant clone's indexes/uniqueKeys as before (reintroducing the duplicate-index issue this PR also fixes, but that is pre-existing behavior, not a regression from reverting); the new tenantProvisioningReconciliationScheduler.js and its server.js wiring are removed; TenantManager.jsx's polling effect and widened retry-gate UI are removed. No tenant, application, or admin-user row needs cleanup either way.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-11T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1825-TENANT-PROVISIONING-ASYNC-CRASH-RECOVERABLE
---

# Tenant Provisioning Made Asynchronous and Crash-Recoverable (#1825)

## Compliance Impact Classification

Regulatory. The classification floor comes entirely from `apps/dgfy-ims/Pages/admin/TenantManager.jsx`
matching a blanket `regulatory` rule in `scripts/check-compliance-impact.js`'s
`COMPLIANCE_SENSITIVE_RULES` (surfaces `settings`, `compliance`) that covers the whole file
regardless of what changed within it — not because this specific change introduces a new
regulatory-controlled operation. No fiscal-document, payment, tax-computation, or receipt logic is
touched anywhere in this PR. The backend files this PR also changes
(`approveTenantUseCase.js`, `tenantProvisioningService.js`, `companyRegistrationRepository.js`,
`tenantModelFactory.js`, `server.js`, the new `tenantProvisioningReconciliationScheduler.js`) do not
match any pattern in `COMPLIANCE_SENSITIVE_RULES` — only the frontend file does.

## Affected Surfaces

1. **`apps/dgfy-api/src/modules/tenants/usecases/approveTenantUseCase.js`** — the admin
   approve/retry-provisioning request now returns `202 Accepted` as soon as the existing
   `markProvisioningStarted` compare-and-swap durably claims the work, instead of awaiting the full
   ~88-second provisioning body. That body (provisioning, founder-membership assignment, PayMongo
   child-account creation, approval email, plan sync) is unchanged in content and ordering — it now
   runs detached (`.catch()`, never awaited by the request) rather than inline. Every failure path
   inside it already recorded a terminal outcome via `markProvisioningOutcome` before this change and
   still does. Also widens the entry-point status gate so an explicit retry is accepted when
   `tenant.status === 'active'` (not only `'pending'`) — closing a narrow crash-window gap where a
   process death between `provisionTenant`'s own `status: 'active'` update and this use case
   recording the terminal outcome could otherwise leave a tenant permanently unretryable.
   `markProvisioningStarted`'s own CAS (unchanged) remains the real authority on whether a given
   retry is actually valid; this gate only decides whether the request is shaped like a legitimate
   attempt.
2. **`apps/dgfy-api/src/services/tenantProvisioningService.js`** — the admin-user seed `INSERT`
   gains `ON DUPLICATE KEY UPDATE user_id = user_id`, making a re-run against an already-seeded
   tenant database a no-op instead of throwing `ER_DUP_ENTRY`. No new data is written; no existing
   admin-user row's data changes on a re-run.
3. **`apps/dgfy-api/src/modules/tenants/repositories/companyRegistrationRepository.js`** — adds one
   read-only query method, `findStaleInProgressApplications`, reusing the same 10-minute staleness
   threshold `markProvisioningStarted`'s existing retry CAS already treats as stale.
4. **`apps/dgfy-api/src/schedulers/tenantProvisioningReconciliationScheduler.js` (new)** — a boot +
   periodic scheduler, mirroring the existing `storefrontDiscoveryIndexService.js` reconciliation
   pattern, that marks a stale `in_progress` application `failed` via the existing, CAS-guarded
   `markProvisioningOutcome`. It never resumes or retries provisioning itself, never touches a
   tenant database, and never marks anything `succeeded` — it only surfaces a stuck row as an
   actionable `failed` state for a human admin to retry. Wired into `server.js`'s existing
   startup/shutdown scheduler lifecycle.
5. **`apps/dgfy-api/src/utils/tenantModelFactory.js`** — strips the tenant clone's inherited
   `indexes`/`uniqueKeys` options (already-synthesized duplicates of the same `unique: true`
   columns still present in `rawAttributes`) so newly provisioned tenants no longer get duplicate
   unique indexes (e.g. `username`/`username_2`) on every clone. Affects only newly provisioned
   tenant databases going forward; does not touch any already-provisioned tenant's schema.
6. **`apps/dgfy-ims/Pages/admin/TenantManager.jsx` (compliance-sensitive)** — adds a silent
   polling effect (only while a loaded tenant's `provisioning_status` is `in_progress`, calling the
   existing `getTenants` list endpoint on a 3-second interval) so the admin sees provisioning
   progress and outcome instead of a response that used to imply completion. Updates confirm/toast
   copy to describe the async behavior accurately. Widens the "Retry setup" button's visibility to
   also cover the crash-window case above (`tenant.status === 'active'` with
   `provisioning_status === 'failed'`), so that state is visibly actionable instead of falling
   through to the generic active-tenant management view with no repair affordance. No new admin
   capability, no new API call, no new field read from any response payload that wasn't already
   present on the tenant list.

## Compliance Preconditions

1. `markProvisioningStarted`'s existing compare-and-swap remains the sole concurrency guard for
   who may start or retry provisioning — unchanged by this PR. No new write path bypasses it.
2. `markProvisioningOutcome`'s existing compare-and-swap (`WHERE ... provisioning_status =
   'in_progress'`) remains the sole gate on recording a terminal outcome — unchanged. The new
   reconciliation scheduler calls this same guarded method; it introduces no new, unguarded write
   path to `company_registration_applications`.
3. No admin capability is added, removed, or re-scoped. `approveTenant`/`retryTenantProvisioning`
   remain gated by the same existing admin authentication/authorization the routes already enforce
   (`apps/dgfy-api/src/routes/adminTenants.js`, unchanged by this PR).
4. No new field is exposed to the admin frontend that the existing `getTenants` list response
   didn't already carry (`registrationApplication.provisioning_status` was already selected by
   `tenantAdminRepository.js` and already rendered in `TenantManager.jsx` before this PR).
5. Widening the retry gate to `tenant.status === 'active'` never allows an *initial* (non-retry)
   approve to bypass the `'pending'` requirement — only an explicit `retry: true` request is
   affected, and it still only succeeds if `markProvisioningStarted`'s own CAS accepts it.
6. The duplicate-index fix in `tenantModelFactory.js` is additive/corrective for newly provisioned
   tenants only; it performs no DDL or write against any existing tenant database.

## Verification Evidence

The commands in front matter were run directly in this session: `node --check` passed on every
changed/new `apps/dgfy-api` `.js` file; `npm run build:skupervisor` produced a clean production
build (confirms the changed `.jsx` file has no syntax/import errors); `npm run check:architecture`
passed with no new violations; `node scripts/check-app-version-bump.js` confirms both changed apps
(`dgfy-api`, `dgfy-ims`) received an appropriate version bump; the existing tenant-provisioning
Jest suites passed 30/32, with the 2 failures being pre-existing and environment-dependent (a real
MySQL connection this sandbox has no credentials for), not caused by this change — both failures
occur in code paths (`sequelize.query('CREATE DATABASE ...')` against the real landlord
connection) that this PR does not touch.

Outstanding before merge, none of which is reachable from this sandbox (no live MySQL, no Redis,
no running backend):

- `POST /api/v1/compliance/preflight` has **not** been executed against a live tenant environment.
  The front-matter preflight fields record this change's classification decision — `settings`/
  `compliance` surfaces from a blanket file-level rule, no compliance-controlled *operation*
  actually changed, therefore `no_breach`/`ALLOWED` — and a reviewer or the continuous
  compliance-preflight sweep (`compliance-preflight-sweep.yml`) must run the endpoint and reconcile
  `preflight_run_at`/`preflight_request_ref` before this candidate reaches `main`, per
  `docs/compliance/request-time-preflight-protocol.md`.
- The duplicate-unique-index fix (`tenantModelFactory.js`) is a plausible, code-read-derived fix
  (confirmed against Sequelize's `define()`/model-options flow) but has not been empirically
  verified against a real freshly-provisioned tenant database (no MySQL available in this
  sandbox). A reviewer with a live environment should provision a scratch tenant and confirm
  `SHOW INDEX FROM users` no longer shows `username_2`/`email_2`/`invitation_token_2` duplicates.
- The crash-and-resume scenario (acceptance criterion 4: re-running provisioning against a
  partially-built tenant database converges) is exercised by the existing Jest suites' mocked
  paths but not against a real MySQL instance mid-`sync()`. A reviewer with a live environment
  should simulate this directly (see the PR body's testing notes).
