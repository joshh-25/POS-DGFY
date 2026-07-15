---
phase: 03-old-to-new-migration-proof
audited: 2026-07-11T06:26:45Z
status: blocked
asvs_level: 1
threats_open: 1
block_on: high
register_authored_at_plan_time: true
---

# Phase 03 Security Verification

## Scope

Phase 03 has formal threat models in all five plans. This audit checks the declared ASVS L1 mitigations for the migration runner data path: explicit target manifests, validated database names, secret-safe reports, accepted-membership authorization, retry safety, and release evidence integrity.

## Threat Register

| Threat | Severity | Status | Evidence |
|--------|----------|--------|----------|
| Target-list tampering migrates unintended tenant | high | CLOSED | `targetManifest.js` rejects empty, malformed, duplicate, and `dgfy_*` legacy source names before connection; `targetManifest.test.js` passes. |
| SQL injection / unsafe DB names | high | CLOSED | Manifest and env database names are pattern-validated; data-state helpers use replacements for values; `dataState.test.js` and apply structural tests pass. |
| Secret leakage in reports/metadata | high | CLOSED | Apply reports omit raw `target_payload`; command tests assert no password hashes, terminal secrets, or `company_token` in report/args JSON. |
| Privilege escalation through inferred memberships | high | CLOSED | Mapping/apply/verify logic requires accepted membership evidence; tests cover pending/non-accepted membership skip paths and relationship violations. |
| Duplicate writes on retry | high | CLOSED | Apply uses legacy ID-map lookup, natural-key reconciliation, and checkpoints; retry interruption-point tests pass. |
| Repudiation / release evidence gap | high | OPEN | `verifyData.js` constructs tenant-local expected map keys with `legacy_tenant` instead of `target.legacy_tenant_db_name`, so MIG-05 data verification evidence can be false-negative and is not trustworthy for phase completion until fixed. |

## Open Threats

### SEC-03-01 — Data verification map-completeness evidence can be wrong

**Severity:** high  
**Component:** `apps/dgfy-migration-runner/src/data/verifyData.js`  
**Disposition:** mitigate before advancing

The release evidence boundary must fail or pass based on the same ID-map key contract used by apply. Apply records tenant-local maps under the actual manifest `legacy_tenant_db_name`; verification currently expects a hardcoded `legacy_tenant` source. This creates an evidence-integrity gap at the exact MIG-05 gate.

**Required mitigation:** Fix expected map key construction to use `target.legacy_tenant_db_name`, add coverage that would fail with the current hardcoded prefix, and rerun verification.

## Audit Trail

| Date | Result | Notes |
|------|--------|-------|
| 2026-07-11 | blocked | Automated tests pass at unit level, but inline security review found one high-severity evidence-integrity gap. |
