---
status: reference
owner: engineering
last_reviewed: 2026-06-30
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-30-release-qualification-baseline-repair
classification: regulatory
surfaces: pos,terminal,storefront,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.06.30
verification_evidence: npm --prefix backend run lint,npm --prefix frontend run lint,npm --prefix frontend test -- --run focused-suites,npm --prefix frontend run build:all,npm run test:backend:matrix,npm run check:compliance
rollback_note: Revert the baseline repair slice; no fiscal receipt, tax, payment, checkout calculation, terminal session, database migration, or compliance decision behavior is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-30T15:25:00+08:00
preflight_request_ref: RELEASE-QUALIFICATION-BASELINE-REPAIR-2026-06-30
---

# Release Qualification Baseline Repair

## Compliance Impact Classification

Regulatory (surface-driven minimum). The release repair itself touches compliance-sensitive POS use-case, workspace, and service files, restoring missing references, removing redundant error propagation, and satisfying release lint requirements without changing business decisions. Classification is escalated to `regulatory` to satisfy the repository-wide compliance surface floor for compliance-sensitive files changed in this same branch/PR; this slice does not itself modify compliance policy evaluation logic.

## Affected Surfaces

1. POS location-scope helper parameter handling.
2. POS item-operation error notifications.
3. POS device-status background capability requests.
4. Storefront and DGFY release qualification coverage.
5. `compliance` — added to satisfy the repository-wide compliance surface floor for compliance-sensitive files changed in this same branch/PR; this slice does not itself modify compliance policy evaluation logic.

## Compliance Preconditions

1. Fiscal receipt generation, document classification, tax, discount, and payment calculations remain unchanged.
2. Terminal authentication, lock, shift, and compliance-mode decisions remain unchanged.
3. No payment provider, PayMongo, migration, model, or database schema file is changed.
4. Existing POS and Storefront focused tests and all production builds must pass.
5. The complete backend matrix and final exact-SHA local qualification must pass before promotion.

## Verification Evidence

The commands listed in front matter must pass before signed promotion. Production validation must confirm POS and Storefront route health and exact frontend asset parity.
