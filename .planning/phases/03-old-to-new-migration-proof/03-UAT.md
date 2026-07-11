---
status: diagnosed
phase: 03-old-to-new-migration-proof
source:
  - .planning/phases/03-old-to-new-migration-proof/03-01-SUMMARY.md
  - .planning/phases/03-old-to-new-migration-proof/03-02-SUMMARY.md
  - .planning/phases/03-old-to-new-migration-proof/03-03-SUMMARY.md
  - .planning/phases/03-old-to-new-migration-proof/03-04-SUMMARY.md
  - .planning/phases/03-old-to-new-migration-proof/03-05-SUMMARY.md
started: 2026-07-11T06:56:46Z
updated: 2026-07-11T06:56:46Z
---

## Current Test

[testing complete]

## Tests

### 1. Phase 03 structured coverage
expected: All Phase 03 non-live deliverables are covered by passing automated tests: manifest validation, metadata state, pure mapping, dry-run planning, checkpointed apply, retry safety, report redaction, and verification pure-function checks.
result: pass
source: automated
coverage_ids: [03-01:D1, 03-01:D2, 03-01:D3, 03-01:D4, 03-02:D1, 03-02:D2, 03-02:D3, 03-02:D4, 03-02:D5, 03-03:D1, 03-03:D2, 03-03:D3, 03-03:D4, 03-04:D1, 03-04:D2, 03-04:D3, 03-04:D4, 03-04:D5, 03-04:D6, 03-05:D1, 03-05:D2]

### 2. Live MySQL dry-run/apply/retry/verify rehearsal
expected: The gated real-MySQL `phase03Integration.test.js` creates disposable legacy landlord/tenant and `dgfy_core_it_*`/`dgfy_business_it_*` schemas, runs schema migrate, proves dry-run does not mutate targets, applies data with `--confirm-destructive`, reruns apply without duplicates, and verifies `data_migration.ok === true`.
result: issue
reported: "RUN_PHASE03_INTEGRATION=true PHASE03_IT_DB_HOST=127.0.0.1 PHASE03_IT_DB_PORT=3306 PHASE03_IT_DB_USER=root PHASE03_IT_DB_PASSWORD=localtest_root_pw npm --prefix apps/dgfy-migration-runner test -- phase03Integration.test.js --watchman=false reached MySQL but failed while seeding `dgfy_accounts` in beforeAll at tests/phase03Integration.test.js:138."
severity: blocker

### 3. Canonical verification status
expected: Phase 03 canonical verification status is `passed` before the phase can advance.
result: issue
reported: "verification.status returned status=gaps_found with next_command=/gsd:plan-phase 03 --gaps. GAP-03-01: verifyData.js builds tenant-local map-completeness keys with hardcoded `legacy_tenant` instead of manifest `legacy_tenant_db_name`."
severity: blocker

## Summary

total: 3
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "The gated real-MySQL phase03Integration.test.js completes the full dry-run -> apply -> retry -> verify loop against disposable schemas."
  status: failed
  reason: "Live UAT reported: phase03Integration.test.js reached MySQL but failed while seeding `dgfy_accounts` in beforeAll at tests/phase03Integration.test.js:138."
  severity: blocker
  test: 2
  root_cause: "The integration test creates a reduced disposable `dgfy_accounts` table but seeds it with `legacyDgfyAccountFixture()`, whose full legacy-shaped payload includes fields not created in that disposable table, such as `middle_name`, `username`, `business_step_up_verified_at`, `provisioning_status`, `temporary_password_active`, `email_verification_source`, `merchant_terms_acknowledged_at`, `deleted_by`, and `deletion_reason`. MySQL rejects the bulk insert before the actual dry-run/apply/retry/verify rehearsal starts."
  artifacts:
    - path: "apps/dgfy-migration-runner/tests/phase03Integration.test.js"
      issue: "Disposable `dgfy_accounts` table schema is narrower than the fixture payload inserted at line 138."
    - path: "apps/dgfy-migration-runner/tests/fixtures/phase03/legacyRecords.js"
      issue: "`legacyDgfyAccountFixture()` returns the full legacy account shape, including deferred fields not present in the integration test's reduced table."
  missing:
    - "Align the disposable integration-table schema with the fixture payload, or seed only the exact columns created by the test."
    - "Rerun the gated real-MySQL Phase 03 rehearsal after fixing the seed/schema mismatch."
  debug_session: ""

- truth: "Phase 03 canonical verification status is `passed` before the phase can advance."
  status: failed
  reason: "Verification report shows GAP-03-01: tenant-local map-completeness keys use hardcoded `legacy_tenant` instead of manifest `legacy_tenant_db_name`."
  severity: blocker
  test: 3
  root_cause: "`apps/dgfy-migration-runner/src/data/verifyData.js` builds expected map-completeness keys for tenant-local `users` and `tenant_locations` with a hardcoded legacy source, while apply records `legacy_id_map.legacy_source` from the manifest's actual `legacy_tenant_db_name`."
  artifacts:
    - path: "apps/dgfy-migration-runner/src/data/verifyData.js"
      issue: "Tenant-local expected map keys use `legacy_tenant` instead of the manifest tenant database name."
    - path: ".planning/phases/03-old-to-new-migration-proof/03-VERIFICATION.md"
      issue: "Canonical verification status is `gaps_found`."
  missing:
    - "Use `target.legacy_tenant_db_name` when building tenant-local map-completeness keys."
    - "Add a failing-then-passing regression test for a manifest tenant database such as `sku_tenant_1`."
    - "Rerun Phase 03 verification."
  debug_session: ""
