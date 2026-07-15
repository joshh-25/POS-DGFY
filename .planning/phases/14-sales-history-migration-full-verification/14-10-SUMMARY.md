---
phase: 14-sales-history-migration-full-verification
plan: 10
subsystem: migration-rehearsal-evidence
tags: [sales-history, rehearsal, evidence, validator, VER-03]

requires:
  - phase: 14-sales-history-migration-full-verification
    plan: 09
    provides: "Operator authorization for the dgfy-temp production-parity rehearsal"
provides:
  - "Executed real-volume six-entity rehearsal on the authorized dgfy-temp EC2"
  - "Sanitized, machine-checkable 14-REHEARSAL-EVIDENCE.json (final_verdict=pass)"
  - "Shared evidence-contract validator reused unchanged by Plan 11"
affects: [14-11, production-parity-rehearsal]

tech-stack:
  added: []
  patterns:
    - "Zero-dependency ESM evidence-contract validator with a documented source-zero exemption."

key-files:
  created:
    - apps/dgfy-migration-runner/scripts/validate-phase14-rehearsal-evidence.js
    - apps/dgfy-migration-runner/tests/validatePhase14RehearsalEvidence.test.js
  modified:
    - .planning/phases/14-sales-history-migration-full-verification/14-REHEARSAL-EVIDENCE.json

key-decisions:
  - "D-14-10-01 (operator, 2026-07-15, 'empty is truthful'): a legitimately source-zero entity is accepted as truthfully migrated (0 -> 0) under a documented `exemptions[]` record, rather than blocking phase completion. Applied to `product_embedding` (zero `item_embeddings` across all 26 tenants; EMB-01 is v2.x-deferred and non-central to the v2.1 fidelity goal)."
  - "The committed validator checks report hash FORMAT (64-char lowercase hex) and safe relative paths, NOT recomputed digests: raw reports remain on the approved EC2 by disclosure policy (they contain credential-hash material) and are not committed."
  - "The authorized rehearsal ran on `dgfy-temp` (context `dgfy-temp-local-docker`), which differs from the `dataMilestoneRehearsal.test.js` hardcoded `APPROVED_DOCKER_CONTEXT = 'lima-dgfy-dev'` constant. The evidence-of-record is the sanitized JSON; the runner test constant was not retrofitted in this plan."

requirements-completed: [VER-01, VER-02, VER-03]

coverage:
  - id: T1
    description: "Authorized real-volume sequence (schema:migrate, dry-run, apply, retry, verify) ran once on dgfy-temp and produced sanitized six-entity evidence."
    requirement: VER-03
    verification:
      - kind: human
        ref: "14-REHEARSAL-EVIDENCE.json commands + report hashes preserved on EC2"
        status: pass
  - id: T2
    description: "Shared validator enforces schema/counts/totals/findings/redaction and the documented source-zero exemption; real evidence and 30 fixtures pass."
    requirement: VER-03
    verification:
      - kind: automated
        ref: "npm --prefix apps/dgfy-migration-runner test -- validatePhase14RehearsalEvidence && node scripts/validate-phase14-rehearsal-evidence.js <evidence>"
        status: pass

duration: 20min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 10: Rehearsal Execution & Evidence Summary

**The authorized production-parity rehearsal ran end-to-end on the `dgfy-temp` EC2, migrated five of six entities with exact source=target fidelity and zero retry writes, and the one source-zero entity (`product_embedding`) is accepted under a documented "empty is truthful" exemption — evidence now validates green.**

## What ran

The full sequence (`schema:migrate` → `data:dry-run` → `data:apply` → `data:apply:retry` → `verify`) executed once against the 26 authorized disposable `dgfy_business_r0001..r0026` targets. Results:

| Entity | Source | Target | First write | Retry |
|--------|-------:|-------:|------------:|------:|
| product_folder | 266 | 266 | 266 | 0 |
| product | 609 | 609 | 609 | 0 |
| inventory_movement | 1053 | 1053 | 1053 | 0 |
| product_embedding | 0 | 0 | 0 | 0 |
| availment | 42 | 42 | 42 | 0 |
| availment_item | 55 | 55 | 55 | 0 |

- Exact sales totals by status: finalized `6734.7400` = `6734.7400`; voided `414.1000` = `414.1000`.
- `data_migration_ok=true`, `blocking_findings=0`, retry wrote **0** new rows, connections closed.
- Non-blocking findings only: `STAFF_CREDENTIAL_RESET_REQUIRED` (1), `MISSING_ACCEPTED_MEMBERSHIP` (2), `SALE_TERMINAL_NOT_MAPPED` (31) — all governed non-blocking.

## The source-zero embedding decision (D-14-10-01)

The dgfy-temp snapshot has zero `item_embeddings` rows across all tenants, so the strict "all six entities non-vacuous" contract could not be met literally. Per operator decision on 2026-07-15 ("empty is truthful"), a legitimately empty source entity is accepted as truthfully migrated (0 → 0) when documented in `exemptions[]`. The `item_embeddings → product_embeddings` carry-over path remains built and unit-tested for when real vectors exist; embeddings (EMB-01) are explicitly v2.x-deferred and non-central to the v2.1 fidelity goal. `final_verdict` was moved from `blocked_source_zero_product_embedding` to `pass` with the exemption recorded.

## Artifacts

- **Validator:** `scripts/validate-phase14-rehearsal-evidence.js` — one zero-dependency ESM helper (`validatePhase14RehearsalEvidence` + CLI). Enforces exact top-level/nested schema, six-entity fidelity, source_volume/retry/blocking aggregate consistency, exact per-status sales totals, finding-code policy (blocking orphan/status codes rejected; the three attribution codes permitted only as non-blocking), safe report paths + hash format, and structured redaction (sensitive field paths, bcrypt/connection-URI/sentinel leaf values; `reports[].sha256` exempt). It carves out exactly one documented exemption: source-zero entities backed by an `exemptions[]` entry. **This is the single evidence-contract implementation Plan 11 invokes unchanged.**
- **Tests:** `tests/validatePhase14RehearsalEvidence.test.js` — 30 cases; positive (synthetic + the real committed evidence) and negative (schema/count/total/finding/report/redaction).
- **Evidence:** `14-REHEARSAL-EVIDENCE.json` — sanitized commands, report hashes, six-entity counts, exact totals, retry/blocking deltas, and the documented exemption.

## Deviations from the written plan (recorded, not hidden)

1. **Report hashes are format-checked, not recomputed.** Raw reports stay on the approved EC2 (they carry credential-hash material). The validator verifies 64-char lowercase hex + safe relative paths rather than digesting absent files.
2. **Docker context.** The rehearsal ran on `dgfy-temp` (`dgfy-temp-local-docker`), not the `lima-dgfy-dev` constant hardcoded in `dataMilestoneRehearsal.test.js`. That constant was not retrofitted here; the sanitized JSON is the evidence-of-record.

## Verification

- `node apps/dgfy-migration-runner/scripts/validate-phase14-rehearsal-evidence.js .planning/phases/14-.../14-REHEARSAL-EVIDENCE.json` → **OK** (exit 0).
- Validator suite: **30 passed**. Full package suite: **520 passed / 11 skipped**, `check:architecture` clean (29 files).

## Self-Check: PASSED

- Six entities present; five non-vacuous with exact source=target, the sixth source-zero under a documented exemption.
- Exact sales totals matched; zero blocking findings; zero retry writes.
- Evidence contains no credential/hash/snapshot/PII material; report integrity hashes preserved.
- Shared validator is the sole contract implementation Plan 11 will reuse.

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*
