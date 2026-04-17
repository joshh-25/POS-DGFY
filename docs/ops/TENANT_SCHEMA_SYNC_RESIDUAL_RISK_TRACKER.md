---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-04-18
applies_to: deploy_operations
topic: tenant_schema_sync_residual_risk
---

# Tenant Schema Sync Residual Risk Tracker

## Ticket
1. Ticket ID: `OPS-TSYNC-001`
2. Title: Eliminate `mysql_too_many_keys` residual failures and move tenant schema sync gate to zero-failure mode.
3. Owner: Engineering + Ops
4. Priority: P1-techdebt
5. Status: In Progress

## Current Risk
1. Known baseline signatures exist in `backend/config/deploy/tenant-schema-sync-failure-baseline.json`.
2. Deploy regression gate blocks new/mutated signatures but does not yet enforce zero unresolved failures.
3. Root cause area: index bloat/redundant indexes pushing tables toward MySQL 64-key limit.

## Latest Audit Snapshot (Local Validation 2026-04-18)
1. Command: `npm run audit:tenant-index-headroom`
2. Result: `status=degraded` with warning/critical tables and redundant-index groups detected.
3. Primary high-risk local tables observed:
- `tenants` reached critical index count (64)
- `users` warning-level headroom (60 indexes)
- multiple repeated unique/index suffix families (`*_2 ... *_18`)

## Execution Checklist
1. Run root-cause audit:
- `npm run audit:tenant-index-headroom`
2. Generate remediation plan:
- `npm run remediate:tenant-redundant-indexes -- --report-file ../logs/deploy/tenant_index_remediation.json --sql-file ../logs/deploy/tenant_index_remediation.sql`
3. Apply remediation in controlled waves:
- `npm run remediate:tenant-redundant-indexes -- --apply --yes --tenant-db <tenant_db>`
4. Validate post-change:
- `node backend/scripts/sync-tenant-schemas.js --mode alter --report-file <path>`
- `node backend/scripts/check-tenant-schema-sync-regressions.js --report-file <path> --baseline-file backend/config/deploy/tenant-schema-sync-failure-baseline.json`
5. Close debt:
- remove resolved entries from baseline
- set deploy gate strict mode for zero unresolved failures (`DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1`)

## Exit Criteria
1. Baseline failure list is empty.
2. Tenant schema sync regression gate passes with `--require-zero`.
3. Deploy runs with `DEPLOY_TENANT_SCHEMA_SYNC_MODE=report`, no unresolved tenant schema failures, and clean headroom audit.
