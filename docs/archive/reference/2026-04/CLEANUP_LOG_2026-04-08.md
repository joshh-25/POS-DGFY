---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-04-09
applies_to: workspace_cleanup
topic: cleanup_log
---

# Cleanup Log - 2026-04-08

## Summary
Documentation was updated to match current compliance hardening/test flows. Stale references were corrected and a small set of unreferenced ad-hoc scripts was removed.

## Documentation Updates
1. Updated `docs/testing/README.md` with compliance activation readiness E2E commands and matrix usage.
2. Updated `docs/guides/SCRIPTS_GUIDE.md` to document `seed_compliance_activation_data.js` usage and safety flags.
3. Rewrote receive-token verification report (now archived at `docs/archive/testing/2026-02/receive-token-fix-evaluation.md`) to remove a stale missing-script reference and normalize text encoding.

## Workspace Cleanup Performed
Removed unreferenced and outdated ad-hoc scripts from `backend/scripts`:
1. `manual-auth-test.js`
2. `manual-tenant-migration.js`
3. `reproduce-uom-mismatch_draft.js`
4. `reproduce_debug.js`
5. `reproduce_login.js`
6. `reproduce_login_tenant_a.js`

Rationale:
1. Not referenced by npm scripts, docs, tests, or runtime paths.
2. Debug/reproduction-only files with hardcoded local credentials/tokens.
3. Not part of governed deployment or readiness flows.

## Consolidated Deep-Cleanup Passes (Same Date)
Additional deep-cleanup work from earlier split pass logs has been consolidated here for continuity:
1. Removed stale debug/manual script artifacts from `backend/scripts` and `backend/tests` that were unreferenced by governed docs, npm scripts, runtime paths, and `*.test.js` suites.
2. Consolidated duplicate script variants where a canonical equivalent already existed (naming/extension duplicates).
3. Removed tenant-specific one-off recovery scripts with hardcoded tenant tokens/databases that were no longer part of governed operational workflows.
4. Re-ran docs/script reference scans to ensure removed file names were no longer referenced by governed docs and package scripts.

## Validation
1. `npm run lint:docs`
2. Reference scan for removed script names under `docs/`, `backend/tests/`, and `package.json` surfaces.
