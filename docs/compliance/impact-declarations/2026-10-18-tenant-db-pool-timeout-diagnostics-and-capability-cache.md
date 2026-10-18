---
status: reference
owner: engineering
last_reviewed: 2026-10-18
declaration_id: 2026-10-18-tenant-db-pool-timeout-diagnostics-and-capability-cache
classification: major
surfaces: pos,settings
reason_codes_impacted: TENANT_CAPABILITY_DISABLED
policy_version: 2026.10.18
verification_evidence: Focused API Jest validation (9 suites, 96 tests); node --check on changed JavaScript; npm run check:architecture; npm run check:compliance; npm run lint:docs; node scripts/check-app-version-bump.js; git diff --check
rollback_note: Revert the capability-setting cache and its invalidation hooks to restore per-request reads. Revert the timeout recorder, Sentry tenant tag, pool snapshot, and runbook note to remove the added diagnostics. No database migration or environment change is involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-18T09:08:43.947Z
preflight_request_ref: PREFLIGHT-39113795566-2026-10-18-TENANT-DB-POOL-TIMEOUT-DIAGNOSTICS-AND-CAPABILITY-CACHE
---

# Tenant DB Pool Timeout Diagnostics and Capability Cache

## Compliance Impact Classification

Major. The changed auth middleware and settings writers are classified under the `pos` and
`settings` surfaces by `scripts/check-compliance-impact.js`. The change caches tenant POS capability
settings to reduce repeated tenant database reads and adds diagnostics for tenant database pool
acquire timeouts. It does not change the capability response contract, database schema, payment
processing, fiscal calculations, or compliance decisions.

## Affected Surfaces

- POS polling authorization reads the `tenant_pos_enabled` setting through a 15-second in-process
  cache. The API instance that writes a capability invalidates its local cache immediately. Other
  API instances can retain the previous setting value for up to 15 seconds.
- Settings writes invalidate cached capability settings alongside the existing workflow-setting
  cache invalidation.
- Tenant database acquire-timeout logs and Sentry context include tenant ID, request route/method,
  request ID, and tenant/global pool statistics. A Sentry `tenant_id` tag supports event filtering.

## Compliance Preconditions

1. Missing `tenant_pos_enabled` and `tenant_ims_enabled` settings continue to default to enabled.
2. Cache loader failures propagate through the existing error path and are never converted to an
   allow decision.
3. Same-process capability writes invalidate immediately; cross-instance staleness is bounded by
   the 15-second cache TTL.
4. Existing authorization response codes and bodies remain unchanged.
5. Pool diagnostics do not change request status, response body, headers, or error propagation.
6. No live compliance preflight was executed in this local session. The required `no_breach` fields
   above are the guardrail's PR-open placeholder shape; `NOT-EXECUTED-2560-2026-10-18` is pending
   the repository's automatic preflight sweep after merge.

## Verification Evidence

- Focused API validation passed 9 Jest suites and 96 tests.
- `node --check` passed for changed and new JavaScript files.
- `npm run check:architecture`, `npm run check:compliance`, `npm run lint:docs`,
  `node scripts/check-app-version-bump.js`, and `git diff --check` passed.

## Rollback

Revert the capability-setting cache and invalidation hooks to restore per-request reads. Revert the
timeout recorder, Sentry tenant tag, pool snapshot, and runbook note to remove the added diagnostics.
No database migration or environment change is involved.
