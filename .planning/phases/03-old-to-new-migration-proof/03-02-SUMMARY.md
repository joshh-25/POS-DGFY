---
phase: 03-old-to-new-migration-proof
plan: 02
subsystem: database
tags: [migration-runner, mapping, mig-01, adr-0028, adr-0029]

# Dependency graph
requires:
  - phase: 03-old-to-new-migration-proof
    provides: "03-01's DGFY_MIGRATION_TARGET_MANIFEST contract, dgfy_migration_meta legacy_id_map/data_checkpoints/data_quality_findings tables, and createLegacyTenantSourceConnection() legacy connection factory"
provides:
  - "docs/database/dgfy-data-migration-map.md — authoritative MIG-01 source-to-target mapping evidence (accounts, tenants/businesses, memberships, staff, assignments, locations, terminal identities, ownership metadata, explicit exclusions)"
  - "apps/dgfy-migration-runner/src/data/mappings.js — pure, zero-import mapper functions shared by dry-run (03-03) and apply (03-04)"
  - "classifyMappingConflict()/classifyOutOfScopeRecord() structured finding builders and MAPPING_REASON_CODES/OUT_OF_SCOPE_LEGACY_TABLES constants"
  - "apps/dgfy-migration-runner/tests/fixtures/phase03/legacyRecords.js reusable legacy-shaped fixture builders for later Phase 03 test suites"
affects: [03-03-dry-run-transformations, 03-04-checkpointed-apply, 03-05-verification-retry-evidence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure mapper contract: every src/data/mappings.js function has zero imports (no Sequelize/mysql2/fs/backend) and returns a uniform { operation, entity_type, target_table, target_database, target_payload, legacy_id_map_key, related_targets, findings } shape, so dry-run and apply can share identical transform logic without drift"
    - "Batch-aware duplicate detection via caller-supplied seenEmails Set parameter (not internal state) — keeps mapLegacyUserToStaffAccount() pure while still enabling cross-record duplicate-email conflict detection"
    - "related_targets array on mapLegacyTenantToBusiness() for derived writes (business_database_registry, tenant_ownership_metadata) that share the parent entity's legacy_id_map key instead of requiring a separate pure mapper function per derived table"
    - "Two distinct role-mapping tables (mapBusinessMembershipRole -> owner/manager/member vs mapAssignmentRole -> owner/manager/staff) because dgfy_core.business_memberships.role and dgfy_business_*.account_staff_assignments.role use different target enums for the same source field"

key-files:
  created:
    - docs/database/dgfy-data-migration-map.md
    - apps/dgfy-migration-runner/src/data/mappings.js
    - apps/dgfy-migration-runner/tests/dataMappings.test.js
    - apps/dgfy-migration-runner/tests/fixtures/phase03/legacyRecords.js
  modified: []

key-decisions:
  - "Kept exactly the 8 mapper/helper function symbols the plan named as public API; tenant_ownership_metadata has no separate pure mapper because it is a 1:1 derived write of mapLegacyTenantToBusiness()'s own inputs (manifest expected_business_id/expected_owner_account_id + tenants.owner_dgfy_account_id), exposed via that function's related_targets array instead"
  - "Added classifyOutOfScopeRecord() and OUT_OF_SCOPE_LEGACY_TABLES (mirroring dgfyCoreContract.js/dgfyBusinessContract.js's rejectedTables) beyond the plan's literal symbol list — needed to make the acceptance criterion 'excluded POS/product/fiscal records are rejected or ignored' testable and reusable by 03-03/03-04, and is a direct, minimal implementation of the plan's own ADR 0029 must-have, not scope creep (Rule 2)"
  - "business_memberships.role (owner/manager/member) and account_staff_assignments.role (owner/manager/staff) get two separate internal role-mapping tables rather than one shared function, because the two target tables use different enums for structurally the same source role field"
  - "mapLegacyTenantToBusiness()'s target business ID always comes from the migration target manifest's expected_business_id, never from legacy tenants.id — decouples the new DGFY ID space from legacy tenant IDs while legacy_id_map still records the link"

requirements-completed: [MIG-01]

coverage:
  - id: D1
    description: "Authoritative docs/database/dgfy-data-migration-map.md documents source fields, target fields, transform rules, skip/conflict/orphan reason codes, legacy_id_map key shapes, and verification checks for accounts, tenants/businesses, memberships, staff, assignments, locations, terminal identities, ownership metadata, optional storefront discovery projection, and explicit ADR 0029 exclusions"
    requirement: "MIG-01"
    verification:
      - kind: other
        ref: "npm run lint:docs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pure mapper functions in mappings.js transform every in-scope legacy entity to its DGFY target shape with zero DB/filesystem/backend imports, sharing identical logic dry-run and apply will both call"
    requirement: "MIG-01"
    verification:
      - kind: unit
        ref: "tests/dataMappings.test.js#mappings.js purity contract (zero imports)"
        status: pass
      - kind: unit
        ref: "tests/dataMappings.test.js#mapLegacyAccountToDgfyAccount / mapLegacyTenantToBusiness / mapLegacyMembershipToBusinessMembership / mapLegacyUserToStaffAccount / mapLegacyAccountStaffAssignment / mapLegacyLocationToLocation / mapTerminalRegistryEntryToTerminalIdentity happy-path suites"
        status: pass
    human_judgment: false
  - id: D3
    description: "Membership and account-staff assignment mappers gate creation only on an explicit accepted legacy membership row, never on matching account/tenant-user email or phone (ADR 0028), proven with fixtures whose account and tenant user intentionally share an email"
    requirement: "MIG-01"
    verification:
      - kind: unit
        ref: "tests/dataMappings.test.js#'non-accepted membership (pending) -> skip ... never inferred from matching email/phone' and #'non-accepted membership -> skip, never inferred from matching account/user email'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Terminal identity mapper's target_payload is built from an explicit field allow-list so terminal_password_hash, pairing_version, cashier_email, and is_default can never leak into migrated data regardless of what the source registry entry contains"
    requirement: "MIG-01"
    verification:
      - kind: unit
        ref: "tests/dataMappings.test.js#'never includes terminal_password_hash, pairing_version, cashier_email, or is_default in target_payload'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Out-of-scope legacy domains (products, POS transactions, fiscal receipts, and the rest of ADR 0029's rejected-table list) are structurally rejected: no mapper function exists for them, and classifyOutOfScopeRecord()/isInScopeLegacyTable() give dry-run/apply a testable, evidence-producing way to ignore them instead of silently dropping them"
    requirement: "MIG-01"
    verification:
      - kind: unit
        ref: "tests/dataMappings.test.js#'isInScopeLegacyTable / classifyOutOfScopeRecord (ADR 0029)' suite"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-11
status: complete
---

# Phase 03 Plan 02: Source-to-Target Mapping Doc and Mapper Fixtures Summary

**Authoritative `docs/database/dgfy-data-migration-map.md` MIG-01 evidence plus 7 pure legacy-to-DGFY mapper functions (`mappings.js`, zero imports) with 42 passing tests proving happy paths, ADR 0028 non-inference, and ADR 0029 secret/scope exclusion.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-11
- **Completed:** 2026-07-11
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- `docs/database/dgfy-data-migration-map.md` (authoritative, owner `database`) documents 9 mapped entities plus explicit exclusions: for each, source table/fields, target table/fields, transform rule, `legacy_id_map` key shape, skip/conflict/orphan reason codes, and the MIG-05 verification check — the single source of truth 03-03 (dry-run) and 03-04 (apply) both implement against, closing Pitfall 2 (dry-run/apply drift) from `03-RESEARCH.md` before either exists.
- `apps/dgfy-migration-runner/src/data/mappings.js` implements the 7 pure mapper functions named in the plan (`mapLegacyAccountToDgfyAccount`, `mapLegacyTenantToBusiness`, `mapLegacyMembershipToBusinessMembership`, `mapLegacyUserToStaffAccount`, `mapLegacyAccountStaffAssignment`, `mapLegacyLocationToLocation`, `mapTerminalRegistryEntryToTerminalIdentity`) plus `classifyMappingConflict()` — all with **zero imports**, verified by a source-scanning test so the "no DB/filesystem/backend access" contract can never silently regress.
- Membership and assignment mappers gate creation on `status === 'accepted'` alone; tests use fixtures where the DGFY account and tenant-local user share the exact same normalized email and still assert the mapper skips, proving ADR 0028's "email/phone is never authorization" rule structurally rather than by convention.
- Terminal identity mapper builds `target_payload` from a hard-coded 4-key allow-list (`terminal_code`, `label`, `location_id`, `status`); a test asserts the serialized result never contains `terminal_password_hash`, `pairing_version`, `cashier_email`, or `is_default` even when the source fixture includes all of them.
- `OUT_OF_SCOPE_LEGACY_TABLES` (mirrors `dgfyCoreContract.js`/`dgfyBusinessContract.js` `rejectedTables`) plus `isInScopeLegacyTable()`/`classifyOutOfScopeRecord()` give dry-run/apply a concrete, tested way to record "ignored, not silently dropped" evidence for POS transactions, products, and fiscal receipts (ADR 0029) — verified by both a fixture-driven runtime test and a static export-name scan.
- `apps/dgfy-migration-runner/tests/fixtures/phase03/legacyRecords.js` provides 20 reusable builder-function fixtures (positive + negative: missing membership, duplicate email, missing location name/address, invalid terminal ID, excluded POS/product/fiscal records) matching the exact legacy Sequelize model shapes read during planning, ready for 03-03/03-04 test suites to reuse.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write authoritative data migration map document** - `69831b2d` (docs)
2. **Task 2: Add mapper fixtures and pure source-to-target functions** - `484ffb0a` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `docs/database/dgfy-data-migration-map.md` - MIG-01 authoritative mapping doc (9 entities + exclusions + reason-code taxonomy)
- `apps/dgfy-migration-runner/src/data/mappings.js` - 7 pure mapper functions + `classifyMappingConflict()`/`classifyOutOfScopeRecord()`/`isInScopeLegacyTable()` + `MAPPING_REASON_CODES`/`OUT_OF_SCOPE_LEGACY_TABLES` constants
- `apps/dgfy-migration-runner/tests/dataMappings.test.js` - 42 tests: purity contract, happy paths, skip/conflict/orphan paths, secret-stripping, out-of-scope guard
- `apps/dgfy-migration-runner/tests/fixtures/phase03/legacyRecords.js` - 20 reusable positive/negative fixture builder functions

## Decisions Made

- Kept exactly the 8 named symbols from the plan's `<execution_context>` "Symbols" list as the module's public mapper API; `tenant_ownership_metadata` is produced as a `related_targets` entry of `mapLegacyTenantToBusiness()` rather than a ninth standalone mapper, since it is a direct 1:1 derived write from that function's own inputs (manifest `expected_business_id`/`expected_owner_account_id` + `tenants.owner_dgfy_account_id`), not an independent transformation of a distinct source entity.
- Added `classifyOutOfScopeRecord()`/`isInScopeLegacyTable()`/`OUT_OF_SCOPE_LEGACY_TABLES` beyond the plan's literal symbol list (Rule 2 — auto-add missing critical functionality) because the acceptance criterion "tests prove excluded POS/product/fiscal records are rejected or ignored" needed a concrete, testable mechanism; the mirror of `dgfyCoreContract.js`/`dgfyBusinessContract.js`'s existing `rejectedTables` pattern keeps this consistent with Phase 02's established convention rather than inventing a new one.
- Used two separate internal role-mapping tables (`mapBusinessMembershipRole` -> `owner`/`manager`/`member`, `mapAssignmentRole` -> `owner`/`manager`/`staff`) instead of one shared function, because `dgfy_core.business_memberships.role` and `dgfy_business_*.account_staff_assignments.role` use different target enums for the same legacy `role` source field (`docs/database/dgfy-foundation.md` D-07 vs D-14).
- `mapLegacyTenantToBusiness()`'s target `businesses.id` always comes from the migration target manifest's `expected_business_id`, never from legacy `tenants.id` directly — this keeps the new DGFY ID space fully operator-controlled per D-01/D-02 while `legacy_id_map` still records the legacy-to-target link for retry/verification.
- Duplicate-email conflict detection in `mapLegacyUserToStaffAccount()` uses a caller-supplied `seenEmails` Set parameter rather than internal module state, keeping the function pure (deterministic given its arguments) while still letting 03-03/03-04's batch orchestration detect cross-record collisions within a single run.

## Deviations from Plan

None beyond the documented additive helper functions above (already covered under "Decisions Made" per Rule 2 — auto-add missing critical functionality). No architectural changes, no scope expansion beyond `docs/database/dgfy-data-migration-map.md` and `apps/dgfy-migration-runner/src/data/mappings.js` plus their tests/fixtures.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-03 (dry-run transformations) can now call these exact pure mapper functions to classify inserts/updates/skips/conflicts without mutating `dgfy_*` data, and must reuse `MAPPING_REASON_CODES` for its report findings rather than inventing new reason codes.
- Plan 03-04 (checkpointed apply) must call the same mapper functions, resolve each mapper's `legacy_id_map_key` through `metadata/dataState.js`'s `findLegacyIdMap`/`recordLegacyIdMap` helpers (03-01), and honor the documented entity write order (`accounts -> businesses/registry -> locations -> staff -> assignments -> terminals`) since `mapLegacyAccountStaffAssignment()` and `mapTerminalRegistryEntryToTerminalIdentity()` require caller-resolved `staffAccountId`/`locationId` inputs.
- Plan 03-05 (verification/retry evidence) should use the "Verification Checks Summary" table in `docs/database/dgfy-data-migration-map.md` directly as its MIG-05 section list.
- No blockers identified for subsequent Phase 03 plans.

## Self-Check: PASSED

All created files and task commit hashes verified present in the working tree and git history:
- `docs/database/dgfy-data-migration-map.md` - FOUND
- `apps/dgfy-migration-runner/src/data/mappings.js` - FOUND
- `apps/dgfy-migration-runner/tests/dataMappings.test.js` - FOUND
- `apps/dgfy-migration-runner/tests/fixtures/phase03/legacyRecords.js` - FOUND
- `.planning/phases/03-old-to-new-migration-proof/03-02-SUMMARY.md` - FOUND
- `69831b2d`, `484ffb0a` - FOUND in git log

---
*Phase: 03-old-to-new-migration-proof*
*Completed: 2026-07-11*
