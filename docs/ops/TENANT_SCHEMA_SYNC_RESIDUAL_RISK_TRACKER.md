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
5. Status: Closed (2026-04-18)

## Current Risk
1. Baseline signatures were fully cleared in `backend/config/deploy/tenant-schema-sync-failure-baseline.json` (`failures=[]`).
2. Deploy now enforces strict closure defaults:
- `DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1`
- `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=1`
3. Residual risk is now operational monitoring only; no accepted unresolved schema-sync debt remains.

## Latest Audit Snapshot (Production Closure 2026-04-18)
1. Initial strict-gate deploy audit (blocked release):
- `/var/www/skupervisor/logs/deploy/deploy_20260418_032545.tenant_index_headroom.json`
- Result: `status=warning`, `redundant_groups=133`.
2. Remediation execution:
- `/var/www/skupervisor/logs/deploy/tenant-index-remediation-after-strict-gate.json`
- Result: `dropped_count=203`.
3. Post-remediation strict audit:
- `/var/www/skupervisor/logs/deploy/tenant-index-headroom-after-strict-remediation.json`
- Result: `status=healthy`, `redundant_groups_total=0`.
4. Final strict deploy evidence:
- `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.tenant_schema_sync.json` (`failed=0`)
- `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.tenant_index_headroom.json` (`status=healthy`).

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
- keep baseline empty unless a new approved exception is explicitly documented
- keep strict deploy defaults enabled and fail-closed on new schema/index drift

## Exit Criteria
1. Baseline failure list is empty. (Completed)
2. Tenant schema sync regression gate passes with `--require-zero`. (Completed)
3. Deploy runs with `DEPLOY_TENANT_SCHEMA_SYNC_MODE=report`, no unresolved tenant schema failures, and clean headroom audit. (Completed)
