---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-22
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-09-22-pos-development-pr-readiness-phase-459
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,UI_LAYOUT,PERMISSION_BOUNDARY
policy_version: 2026.09.22
verification_evidence: Shared POS contract suite; POS and IMS security E2E; POS, IMS, and Storefront builds; architecture, compatibility, schema-coverage, documentation, hygiene, and diff checks
rollback_note: Revert the candidate repair commits and this declaration; no API, migration, payment, tenant-data, or production-row rollback is required.
preflight_result: no_breach
preflight_reason_code: BACKOFFICE_PR_READINESS
preflight_run_at: 2026-09-22T20:18:40+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-459-LOCAL-ONLY
---

# POS Development PR readiness — Phase 459

## Compliance Impact Classification

Major because the candidate repairs touch shared POS terminal presentation,
catalog setup visibility, settings visibility, and permission-aware UI paths.
The changes preserve existing API ownership and do not introduce payment
settlement, inventory mutation, tenant-scope, database-schema, or production
data behavior.

## Affected Surfaces

- Shared POS terminal workspace, catalog presentation, transaction history,
  settings, attendance, and permission-aware controls.
- POS and terminal permission visibility, including cashier restrictions and
  view-only settings behavior.
- IMS CSP worker policy and shared frontend contracts consumed by POS,
  Storefront, and IMS builds.

## Compliance Preconditions

- Existing backend permission, tenant, payment, inventory, and terminal
  service owners remain authoritative; the candidate changes only restore or
  expose existing frontend contracts and lazy-loaded UI boundaries.
- Cashier restrictions remain enforced in the terminal UI, and permission
  checks continue to be resolved through the existing shared permission
  configuration.
- No migration files, API contracts, production deployment, transaction,
  account, tenant, ledger, inventory, or external-provider mutation is part
  of this local PR candidate.
- Authenticated multi-role and cross-branch browser acceptance remains an
  explicit follow-up because no repository E2E/company credentials are
  configured locally.

## Verification Evidence

- Targeted repaired shared POS suite passed: 6 files and 48 tests.
- Full shared POS and frontend-permission suite passed 384 of 390 files and
  1,245 of 1,255 tests; the 10 remaining failures are baseline responsive or
  portal-duplication failures in three unchanged test files.
- POS security E2E passed 7 of 7 tests; correctly targeted IMS security E2E
  passed 9 tests with 2 credential-gated tests skipped; IMS smoke passed 2
  tests. Storefront public checks exited successfully with fixture-dependent
  scenarios skipped.
- POS, IMS, and Storefront production builds passed. POS and IMS lint passed;
  Storefront lint passed with existing warnings.
- Architecture, compatibility-seam, tenant-schema-coverage,
  documentation-lint, workspace-hygiene, frontend-split, app-version, and
  `git diff --check` validations passed.
- Full authenticated role and cross-branch acceptance, and a complete
  backend matrix run, remain unavailable in this local environment; the PR
  must remain draft until those acceptance gates are completed.

**Live request-time compliance preflight was not executed.** This local
declaration uses the documented `NOT-EXECUTED-*` placeholder and must be
reconciled by the governed preflight process before promotion. The declaration
records the local PR-readiness evidence only and does not authorize promotion.
