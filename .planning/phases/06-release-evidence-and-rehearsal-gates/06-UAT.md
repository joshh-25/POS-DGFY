---
status: testing
phase: 06-release-evidence-and-rehearsal-gates
source: [06-VERIFICATION.md]
started: 2026-07-12T06:59:23Z
updated: 2026-07-12T06:59:23Z
---

## Current Test

number: 1
name: WR-04 — architecture-boundary scope mismatch for apps/dgfy-migration-runner/
expected: |
  Either (a) check:architecture gains a migration-runner architecture-guardrail target
  (mirroring check:architecture:dgfy-api) so a migration-runner-only diff is genuinely
  inspected, or (b) apps/dgfy-migration-runner/ is dropped from BOUNDARY_PREFIXES in
  scripts/gate-release-dgfy-evidence.js:36 so the gate's claimed coverage matches what
  it actually checks.
awaiting: user response

## Tests

### 1. WR-04 — architecture-boundary scope mismatch for apps/dgfy-migration-runner/
expected: Either (a) check:architecture gains a migration-runner architecture-guardrail target so a migration-runner-only diff is genuinely inspected, or (b) apps/dgfy-migration-runner/ is dropped from BOUNDARY_PREFIXES so the gate's claimed coverage matches what it actually checks.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
