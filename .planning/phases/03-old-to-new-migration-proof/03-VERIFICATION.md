---
phase: 03-old-to-new-migration-proof
verified: 2026-07-11T06:26:45Z
status: gaps_found
score: 4/5 must-haves verified
behavior_unverified: 1
overrides_applied: 0
human_verification:
  - test: "Run the gated real-MySQL Phase 03 rehearsal: RUN_PHASE03_INTEGRATION=true npm --prefix apps/dgfy-migration-runner test -- phase03Integration.test.js --watchman=false with disposable-schema MySQL credentials that can create/drop local test databases."
    expected: "The test creates disposable legacy landlord/tenant plus dgfy_core_it_*/dgfy_business_it_* schemas, runs schema migrate, dry-run with zero target mutation, apply, retry without duplicates, and verify with data_migration.ok true."
    why_human: "The sandboxed run was blocked by EPERM on 127.0.0.1:3306. The unsandboxed retry reached MySQL, but root credentials were denied for the current network origin."
---

# Phase 03: Old-to-New Migration Proof Verification Report

**Phase Goal:** Operators can transform legacy/current data into DGFY-owned schemas with dry-run, apply, checkpoint, retry, and verification evidence.  
**Verified:** 2026-07-11T06:26:45Z  
**Status:** gaps_found

## Goal Achievement

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Developer can review source-to-target mapping evidence for account, tenant/business, staff, branch/location, and terminal-like records. | VERIFIED | `docs/database/dgfy-data-migration-map.md` is authoritative, last reviewed 2026-07-11, and defines source fields, target fields, skip/conflict/orphan rules, ID-map keys, exclusions, and verification checks. `mappings.js` implements pure mapper functions; `dataMappings.test.js` passes. |
| 2 | Operator can run a dry-run that reports planned inserts, updates, skips, conflicts, orphan records, and tenant coverage without mutating `dgfy_*` data. | VERIFIED | `runDataDryRun()` requires `DGFY_MIGRATION_TARGET_MANIFEST`, validates it before DB factories, and delegates to `runDryRunTransformations()`. `dataDryRun.test.js` proves manifest scoping, no target mutation, finding persistence, and insert-to-update reclassification. |
| 3 | Operator can run apply mode with durable checkpoints and deterministic legacy-to-DGFY ID maps. | VERIFIED | `runDataApply()` requires `--confirm-destructive`, validates the explicit manifest, writes through `runApplyTransformations()`, and produces sanitized reports. `dataApply.test.js` and `dataCommand.test.js` pass. |
| 4 | Operator can interrupt and retry migration without duplicate records, inconsistent references, or manual cleanup. | VERIFIED | `writeMappedTargetRow()` uses lookup-before-insert and target natural-key reconciliation; `applyTenantEntityBatch()` gates checkpoints after durable processing. Retry tests cover post-target/pre-map, post-map/pre-checkpoint, and already-completed checkpoint paths. |
| 5 | Verification reports compare source and target counts, required relationships, skipped/conflict records, and unresolved data-quality issues. | GAP FOUND | `verifyData.js` implements data-count, required-relationship, open-finding, and projection checks, but map-completeness keys for tenant-local `users` and `tenant_locations` are built with hardcoded `legacy_tenant` instead of `target.legacy_tenant_db_name`. That does not match the apply/mapping contract and can make live verification report missing maps incorrectly. |

**Score:** 4/5 truths verified. Phase 03 is implementation-complete but not phase-complete.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| MIG-01 | SATISFIED | Mapping doc and pure mapper fixtures exist and tests pass. |
| MIG-02 | SATISFIED | Dry-run command and planner pass targeted tests and preserve no-mutation behavior. |
| MIG-03 | SATISFIED | Apply mode writes through deterministic maps and checkpoints; report redaction tests pass. |
| MIG-04 | SATISFIED | Retry/interruption tests pass across three interruption points. |
| MIG-05 | PARTIAL | Data verification exists but has a blocking map-completeness key mismatch. |

## Blocking Gap

### GAP-03-01 — `verifyData.js` map completeness uses a hardcoded tenant source

**File:** `apps/dgfy-migration-runner/src/data/verifyData.js:261`  
**Requirement:** MIG-05  
**Severity:** blocking

Expected tenant-local keys are built as:

```js
legacy_tenant|users|...
legacy_tenant|tenant_locations|...
```

Apply records the actual map rows with `legacy_source = target.legacy_tenant_db_name`, matching `docs/database/dgfy-data-migration-map.md`. For example, a manifest entry with `legacy_tenant_db_name: "sku_tenant_1"` records `sku_tenant_1|users|...`, not `legacy_tenant|users|...`.

**Required fix:** Use `target.legacy_tenant_db_name` when building tenant-local expected keys, add a failing-then-passing test for this case, and rerun Phase 03 verification.

## Checks Run

| Command | Result |
|---------|--------|
| `npm --prefix apps/dgfy-migration-runner test -- dataMappings.test.js dataDryRun.test.js dataApply.test.js dataVerify.test.js dataCommand.test.js verifyCommand.test.js phase03Integration.test.js --watchman=false` | 114 passed, 1 gated skip |
| `npm --prefix apps/dgfy-migration-runner test -- --watchman=false` | 284 passed, 2 gated skips |
| `npm run lint:docs` | Pass |
| `npm run check:architecture` | Pass |
| `RUN_PHASE03_INTEGRATION=true ... phase03Integration.test.js --watchman=false` | Could not complete: sandbox run hit EPERM; unsandboxed run reached MySQL but credentials were denied |

## Architecture Boundary Check

Classification: `within-existing-boundary`. This phase stays in the migration runner and governed database docs. It does not add backend/API transport behavior or cross-boundary runtime behavior.

ADR impact: not needed. The phase implements existing ADR 0003 Strangler Fig migration strategy, ADR 0028 accepted-membership authorization, and ADR 0029 domain exclusions.

Authoritative docs used:

- `docs/START_HERE.md` — authoritative, last reviewed 2026-03-06.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` — authoritative, last reviewed 2026-03-06.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — authoritative, last reviewed 2026-05-21.
- `docs/architecture/adr/0003-migration-facade-strategy.md` — accepted.
- `docs/architecture/adr/0028-dgfy-account-company-switching.md` — authoritative, last reviewed 2026-07-02.
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` — authoritative, last reviewed 2026-06-29.
- `docs/database/dgfy-data-migration-map.md` and `docs/database/dgfy-migration-rehearsal.md` — authoritative, last reviewed 2026-07-11.

No unresolved exception or allowlist dependency is introduced by this verification.

## Next Action

Run gap planning:

```bash
$gsd-plan-phase 3 --gaps
```

Then execute the generated gap-closure plan and rerun verification.
