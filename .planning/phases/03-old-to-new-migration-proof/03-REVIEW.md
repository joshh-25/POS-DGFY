---
phase: 03-old-to-new-migration-proof
reviewed: 2026-07-11T06:26:45Z
status: issues_found
depth: standard
files_reviewed: 28
findings:
  critical: 0
  warning: 1
  info: 0
---

# Phase 03 Code Review

## Findings

### 1. Warning — data verification uses the wrong legacy source key for tenant-local map completeness

**File:** `apps/dgfy-migration-runner/src/data/verifyData.js:261`

`buildTargetDataVerification()` builds `expectedLegacyKeys` with the literal source prefix `legacy_tenant`:

```js
`legacy_tenant|users|${user.user_id}`
`legacy_tenant|tenant_locations|${location.location_id}`
```

That does not match the Phase 03 ID-map contract used by the mapper/apply path. Tenant-local rows are recorded with `legacy_source = target.legacy_tenant_db_name`, for example `sku_tenant_1|users|9001` and `sku_tenant_1|tenant_locations|701`. As written, a real `verify` run can report `map_completeness.ok:false` even when `data apply` wrote the correct durable `legacy_id_map` rows.

**Impact:** This blocks reliable MIG-05 verification. The gated live rehearsal test is the only test that would exercise the real apply->verify contract, but it remains environment-gated and could not run to completion in this session due local MySQL access denial.

**Recommended fix:** Build expected tenant-local keys with `target.legacy_tenant_db_name` and add an orchestration unit test where mapped rows use the actual manifest legacy tenant DB name. Re-run `phase03Integration.test.js` with working disposable MySQL credentials.

## Checks Run

| Check | Result |
|-------|--------|
| `npm --prefix apps/dgfy-migration-runner test -- dataMappings.test.js dataDryRun.test.js dataApply.test.js dataVerify.test.js dataCommand.test.js verifyCommand.test.js phase03Integration.test.js --watchman=false` | 114 passed, 1 gated skip |
| `npm --prefix apps/dgfy-migration-runner test -- --watchman=false` | 284 passed, 2 gated skips |
| `RUN_PHASE03_INTEGRATION=true ... phase03Integration.test.js --watchman=false` | Failed to connect with sandbox `EPERM`; rerun outside sandbox reached MySQL but credentials were denied for `root` |
| `npm run lint:docs` | Pass |
| `npm run check:architecture` | Pass |

## Summary

Phase 03 source changes are largely coherent and the unit-level coverage is strong, but the review found one warning-level verification defect that directly affects the phase completion gate. Do not mark Phase 03 complete until this gap is fixed and verification is rerun.
