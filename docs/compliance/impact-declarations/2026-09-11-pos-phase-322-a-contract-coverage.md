---
status: reference
owner: engineering
last_reviewed: 2026-09-11
declaration_id: 2026-09-11-pos-phase-322-a-contract-coverage
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.11
verification_evidence: focused POS/web-core contract suites,POS lint,POS production build,docs and compliance checks,git diff check
rollback_note: Revert the Phase 322-A contract-test and documentation changes together with this declaration. The changes add coverage and test-runner isolation only; no API, database, migration, payment, permission, or runtime behavior changes are introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-11T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-POS-PHASE-322-A-CONTRACT-COVERAGE-LOCAL-ONLY
---

# POS Phase 322-A contract coverage

## Compliance Impact Classification

Major by the repository path-based classification floor. The affected files
are POS and shared web-core contract tests plus the test-runner configuration;
they verify existing item-image, catalog workflow, split-payment UI, and
pending-preview behavior without changing production behavior.

## Affected Surfaces

- `pos` — contract coverage for the POS catalog, item-image, split-payment,
  and pending-preview workflows.
- `terminal` — shared terminal UI contracts exercised by the POS surface.

## Compliance Preconditions

- No API route, request payload, database table, migration, payment amount,
  checkout calculation, permission decision, fiscal output, audit event, or
  hardware command is changed.
- The package script change only serializes the existing storefront contract
  test command to avoid worker contention; it does not alter application code.
- Existing runtime and operator behavior remain unchanged.

## Verification Evidence

- Focused contract suites cover external lookup, split-payment UI, item-image
  rendering, catalog workflow, and pending image-preview state.
- POS/web-core lint and production builds, documentation checks, compliance
  checks, and `git diff --check` are run before delivery.

## Preflight Reconciliation

This declaration is for local branch delivery only. It must be reconciled
through the repository's local ephemeral compliance fixture before any staged
or production operation; this change authorizes no deployment.
