---
phase: 14-sales-history-migration-full-verification
plan: 09
subsystem: migration-rehearsal-authorization
tags: [sales-history, rehearsal, authorization, operator-checkpoint]

requires:
  - phase: 14-sales-history-migration-full-verification
    plan: 08
    provides: "ENV-gated Phase 14 six-entity rehearsal harness and green automated readiness gates"
provides:
  - "Operator authorization for dgfy-temp experimental EC2 production-parity rehearsal"
  - "Approved source/template/manifest/target/runtime scope for Plan 10"
affects: [14-10, 14-11, production-parity-rehearsal]

tech-stack:
  added: []
  patterns:
    - "Operator-approved destructive rehearsal scope is recorded without secrets."

key-files:
  created:
    - .planning/phases/14-sales-history-migration-full-verification/14-09-SUMMARY.md
  modified: []

key-decisions:
  - "Use `ssh dgfy-temp` experimental EC2 instance as the production-parity rehearsal host."
  - "Use `/home/ubuntu/dgfy-rehearsal-template` as the approved rehearsal template and evidence root."
  - "Use `/home/ubuntu/dgfy-rehearsal-template/migration/manifest.json` as the reviewed migration manifest."
  - "Use the manifest's 26 `dgfy_business_r0001` through `dgfy_business_r0026` disposable target databases."
  - "Build and run the updated migration-runner Docker image on the EC2 before executing Plan 10."

requirements-completed: [VER-03]

coverage:
  - id: D1
    description: "Operator explicitly authorized exploration, remote image refresh, reset, and rehearsal on the experimental `dgfy-temp` EC2 host."
    requirement: VER-03
    verification:
      - kind: human
        ref: "User message on 2026-07-15 authorizing push-through on dgfy-temp experimental server"
        status: pass
    human_judgment: true

duration: 5min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 09: Rehearsal Authorization Summary

**The destructive real-volume rehearsal is authorized for the experimental `dgfy-temp` EC2 environment, scoped to the existing rehearsal template and its disposable DGFY targets.**

## Authorized Scope

- **Host:** `dgfy-temp`
- **Template root:** `/home/ubuntu/dgfy-rehearsal-template`
- **Manifest:** `/home/ubuntu/dgfy-rehearsal-template/migration/manifest.json`
- **Business DB list:** `/home/ubuntu/dgfy-rehearsal-template/migration/business-db-names.txt`
- **Source databases:** legacy `sku_tenant_*` databases seeded in the EC2 MySQL container
- **Target databases:** `dgfy_business_r0001` through `dgfy_business_r0026`
- **Runtime context:** Docker engine on `dgfy-temp` EC2
- **Evidence directory:** `/home/ubuntu/dgfy-rehearsal-template/reports`

## Pre-Authorization Exploration Findings

- The EC2 stack is running and healthy.
- The manifest contains 26 tenant targets.
- The source volume is non-vacuous:
  - `items`: 609
  - `item_folders`: 266
  - `pos_transactions`: 42
  - `pos_transaction_lines`: 55
- Existing target databases are disposable rehearsal targets.
- The remote migration-runner source/image was stale before authorization and must be refreshed from the current branch before Plan 10 executes.

## Operator Authorization

The operator authorized proceeding automatically because this is an experimental EC2 instance and the established workflow is to build updated Docker images and run the rehearsal there.

No secrets were printed or committed. Credential values remain in the EC2 environment/template files only.

## Guardrails Carried Into Plan 10

- Build the updated migration-runner image before running any migration command.
- Reset the rehearsal template before the real sequence.
- Run only against the approved EC2 template/manifest/targets above.
- Preserve reports and hashes.
- Do not claim VER-03 unless the real sequence produces non-vacuous six-entity proof with zero retry writes and no blocking findings.

## Self-Check: PASSED

- Authorization scope names source, target, manifest, runtime, and evidence directory.
- Summary contains no credential values.
- Plan 10 has a concrete approved target and may proceed.

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*
