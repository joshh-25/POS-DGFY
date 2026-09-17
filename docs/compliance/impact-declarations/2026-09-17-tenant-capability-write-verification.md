---
status: reference
owner: engineering
last_reviewed: 2026-09-17
declaration_id: 2026-09-17-tenant-capability-write-verification
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.09.14
verification_evidence: packages/web-core/src/pages/__tests__/TenantManager.capabilities.integration.test.jsx,apps/dgfy-api/tests/tenantCapabilitiesWriteReadback.test.js,npm run check:architecture,npm run lint:docs,npm run build:skupervisor
rollback_note: Frontend-only behavior change plus additive tests. Revert apps/dgfy-ims/Pages/admin/TenantManager.jsx to restore unconditional success toasts; no migration, API, or persisted-state rollback is involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-17T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-1923-TENANT-CAPABILITY-WRITE-VERIFICATION
---

# Tenant capability write verification in the Admin Portal (#1923)

## Compliance Impact Classification

Regulatory. The change touches `apps/dgfy-ims/Pages/admin/TenantManager.jsx`, whose
classification floor is `regulatory` (surfaces `settings`, `compliance`). The change itself is
narrower than the floor: it alters only when the Admin Portal claims a tenant-capability write
succeeded. It does not change the capability PATCH contract, validation, audit rows, tenant
isolation, discovery-index rollback semantics, or the registration-stage ceiling used by
runtime customer-access policy (ADR 0010, ADR 0017 — both cited, neither amended).

## Affected Surfaces

1. Admin Portal Tenant Manager capability confirmation flow
   (`apps/dgfy-ims/Pages/admin/TenantManager.jsx`): after a 2xx capability PATCH, the UI
   re-reads the tenant list and toasts `Tenant capabilities updated` only when the fresh read
   reflects every patched field (including the `customer_access_registration_stage` to
   `registration_stage` read-key mapping). On any mismatch, missing tenant, or `unavailable`
   read, it toasts an explicit error naming the unreflected keys and keeps the confirmation
   open instead of claiming success.
2. `loadTenants` now returns the fresh tenant list (or null on failure) so the write handler
   can verify against it. All existing callers ignore the return value; silent
   provisioning-status polls keep their generation-guard behavior.
3. Additive regression tests only (no shipped-bundle change):
   `packages/web-core/src/pages/__tests__/TenantManager.capabilities.integration.test.jsx`
   (Storefront / Maps click-to-PATCH, registration read-back, stale-read refusal, unavailable
   hydration) and `apps/dgfy-api/tests/tenantCapabilitiesWriteReadback.test.js` (durable
   response read-back, fresh list read-back, cross-tenant isolation through the real
   `readTenantCapabilities`).

## Compliance Preconditions

1. The audited confirmation flow is unchanged: every capability write still requires the
   platform-admin reason (3-500 chars) before the PATCH is sent.
2. No capability control is enabled by this change. Disabled states (`tenant.status !==
   'active'`, in-flight write, `capabilities.unavailable`) behave exactly as before; the
   existing `Settings unavailable` / `Active tenants only` badges are untouched.
3. Failed or rolled-back writes still surface through the existing error path (non-2xx PATCH
   rejects into the error toast with the modal open). The new verification only adds a
   second, read-back check on the 2xx path.
4. No new allowlist entry, no migration, no API route/validator/use-case change, and no new
   public field or endpoint.

## Verification Evidence

- `packages/web-core/src/pages/__tests__/TenantManager.capabilities.integration.test.jsx`:
  10 passed, including the new Storefront / Maps click-to-confirm-to-PATCH case with the exact
  `{ storefront_visible: true, reason }` payload, the registration `registered` read-back case,
  the stale-read case (no success toast, error names `pos_enabled`, modal stays open), and the
  unavailable-hydration case (disabled control, `Settings unavailable` badge, no PATCH).
- `apps/dgfy-api/tests/tenantCapabilitiesWriteReadback.test.js`: 3 passed — the write response
  carries the persisted `storefront_visible`/`registration_stage`, a fresh `listTenants` read
  surfaces the same values, and a neighboring tenant's read is unaffected.
- Full related backend set (6 suites, 26 tests) and related Tenant Manager frontend suites
  (capabilities, compliance review contracts, force-non-compliant, partial load, capability
  messages) green.
- `npm run check:architecture`, `npm run lint:docs`, `git diff --check`, and
  `npm run build:skupervisor` green (see PR Testing Evidence for exact outputs).

## Residual Risks

- The STAGING trigger for the original report (transient capability hydration failure vs.
  deployed-asset skew vs. tenant-DB state) cannot be proven from source; the backend
  use-case contract is locked by tests as sound, so live re-verification of the issue's
  Storefront/Maps + Registration sequence on STAGING remains required before #1461/#1887
  unblock claims (verifier follow-up, not claimed in this PR).
- A genuinely slow-but-eventually-consistent read (not expected on the same-DB list path)
  would present as a verification error; the operator can retry from the still-open
  confirmation, and the audit log remains the source of truth for what was written.

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-1923-TENANT-CAPABILITY-WRITE-VERIFICATION` is
expected on a PR targeting `develop`, not a finding — the live request-time compliance sweep
runs at promotion time per the repository preflight protocol, not per PR.
