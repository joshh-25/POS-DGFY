---
status: reference
owner: compliance
last_reviewed: 2026-04-07
topic: warning_noise_remediation_plan
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Warning Noise Remediation Plan (Evidence-Driven)

## Current Implementation Status
As of `master` commit `2c3a8a23c713abef01055899a1d4e2c72f4aec93` (CI run `24062846216`, succeeded):
1. Plan status: `open` (not yet fully implemented end-to-end).
2. Known warning sources remain observable in backend test output:
   - tenant optional-route token warnings,
   - compliance audit-log FK warning paths,
   - FIFO drift repair warnings.
3. No compliance fail-closed behavior was relaxed as part of CI stabilization or schema-alignment fixes.

## Scope
Reduce high-volume warning noise while preserving true risk signals in compliance, tenant resolution, and stock movement flows.

## Evidence Baseline (Current)
1. Tenant header warning flood:
- Source: `backend/src/middleware/tenantHandler.js:67`
- Message: `[TenantHandler] No company token provided in request headers`
- Observed impact: repeated warning logs for known token-optional paths during tests and some public flows.

2. Compliance audit-log FK warning:
- Source: `backend/src/modules/compliance/usecases/complianceUseCases.js:220`
- Message: `[Compliance] Failed to persist blocked operation audit log: Cannot add or update a child row...`
- Observed impact: warn noise during policy-blocked flows when tenant audit-log write path cannot satisfy FK consistency.

3. FIFO stock-drift auto-heal warning:
- Source: `backend/src/services/stockMovementService.js:292`
- Message: `[StockMovement] Repairing FIFO stock drift...`
- Observed impact: noisy warnings in integration tests and operations with legacy stock/batch mismatch.

## Root Cause Map and Affected Areas

### WN-01 Tenant token warning flood
- Root causes:
1. Warning emitted for every no-token request regardless of endpoint intent (`tenantHandler.js:67`).
2. Token-optional paths are not formally classified in middleware policy.
3. Test suite traffic intentionally uses unauthenticated requests and inflates warning volume.
- Affected areas:
1. middleware: tenant resolution entrypoint
2. auth/public/store/webhook endpoints
3. test logs and CI readability

### WN-02 Compliance blocked-operation audit FK warning
- Root causes:
1. Compliance enforcement attempts to write landlord audit logs on every blocked operation (`complianceUseCases.js:210-220`).
2. When tenant identity cannot be resolved to a valid landlord tenant row at write time, FK enforcement fails.
3. Failure path logs `warn` per occurrence without dedupe/rate control.
- Affected areas:
1. compliance use-case blocked-operation path
2. landlord compliance audit log persistence (`tenant_compliance_audit_logs` FK)
3. integration test output signal quality

### WN-03 FIFO drift warning volume
- Root causes:
1. Drift repair logic logs every repair event (`stockMovementService.js:292`).
2. Legacy stock-vs-batch inconsistencies are repaired lazily at runtime, creating repeated warnings.
3. No pre-run reconciliation job and no warn dedupe by item/interval.
- Affected areas:
1. stock movement creation for FIFO items
2. POS/production/dispatch flows that consume stock
3. operational log quality and incident triage

## Phased Implementation Plan

## Phase 0: Instrumentation and Baseline Capture
1. Add warning counters with structured dimensions:
- `tenant_no_token_warning_total{path,method,env}`
- `compliance_audit_fk_failure_total{operation,reason_code}`
- `fifo_drift_repair_total{item_id}`
2. Capture 7-day baseline from CI and staging logs.
3. Define target thresholds:
- tenant no-token warn reduction >= 80%
- compliance audit FK warn reduction >= 90%
- fifo drift warn reduction >= 70%

## Phase 1: Tenant Warning Reclassification (WN-01)
1. Add explicit token-policy map in tenant middleware:
- `required`, `optional`, `not_applicable` by route pattern.
2. For `optional` routes, downgrade no-token logs from `warn` to `debug`.
3. Keep `warn` only for `required` routes with missing token.
4. In `NODE_ENV=test`, aggregate no-token events and emit periodic summary instead of per-request warn spam.
5. Add tests covering path classification and log-level behavior.

## Phase 2: Compliance Audit FK Hardening (WN-02)
1. Before writing blocked-operation audit logs, assert valid tenant identity:
- if tenant context is missing/non-landlord, skip write and emit structured `debug` with reason code.
2. Add repository/use-case guard for `tenant_id` validity and optional existence check in landlord tenant table.
3. Add one-time error dedupe (same tenant_id + operation + reason_code within short TTL).
4. Preserve fail-closed compliance decision behavior; only harden telemetry side effects.
5. Add integration tests:
- valid tenant logs persisted,
- invalid tenant context does not produce repeated warns,
- policy denial response contract unchanged.

## Phase 3: FIFO Drift Noise Reduction + Data Repair (WN-03)
1. Add scheduled reconciliation job (or command) to pre-repair `current_stock` vs open FIFO batch drift.
2. Change runtime drift logging to structured, rate-limited warning keyed by `item_id`.
3. Emit high-severity warn only when shortfall remains after repair; otherwise emit `info`/metric increment.
4. Update fixtures in stock-related integration tests to avoid intentional drift unless drift behavior is under test.
5. Add tests:
- reconciliation correctness,
- rate-limit behavior,
- no regression in stock deduction guarantees.

## Phase 4: Guardrails and CI Policy
1. Add `warning-noise budget` checks to CI for backend test runs (threshold-based, non-flaky).
2. Add log contract tests for middleware/compliance/stock warnings.
3. Add release checklist item: warning baseline must be under threshold before merge to master.

## Phase 5: Governance and Rollout
1. Document warning policy and severity semantics in `docs/testing` + `docs/ops`.
2. Rollout order:
1. staging,
2. canary tenant cohort,
3. full production.
3. Add rollback toggles for:
- route-token warn classification,
- compliance audit dedupe,
- FIFO warning rate limit.

## Acceptance Criteria
1. No loss of true compliance denials or stock integrity errors.
2. Warning volume reduced to agreed thresholds from Phase 0 baseline.
3. `npm run check:architecture`, backend tests, and compliance checks remain green.
4. Logs become actionable: repeated expected paths no longer dominate warning channel.

## Architecture and Governance Checks
1. Change classification: `within-existing-boundary` for Phase 1/2/3 code paths; `cross-boundary` only if schema/ADR changes are introduced.
2. If new persistence objects/jobs are introduced, evaluate ADR update requirement under `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
3. No new allowlist exceptions without linked task and removal date.
