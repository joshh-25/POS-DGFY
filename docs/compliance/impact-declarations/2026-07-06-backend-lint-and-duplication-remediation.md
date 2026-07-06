---
status: reference
owner: engineering
last_reviewed: 2026-07-06
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-06-backend-lint-and-duplication-remediation
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: BACKEND_LINT_AND_DUPLICATION_REMEDIATED
policy_version: 2026.07.06
verification_evidence: npm --prefix backend run lint,npm --prefix backend test -- --runTestsByPath tests/posHandlers.transport.test.js tests/posReports.repository.test.js tests/dgfyAuthUseCases.test.js
rollback_note: Revert this commit to restore the duplicate exports, routes, handlers, and repos; no schema migration is introduced, so no data backfill or down-migration is required.
preflight_result: no_breach
preflight_reason_code: BACKEND_LINT_AND_DUPLICATION_REMEDIATED
preflight_run_at: 2026-07-06T16:55:00+08:00
preflight_request_ref: PR-16
---

# Backend Lint and Duplication Remediation

## Compliance Impact Classification

Regulatory (surface-driven minimum). This change refactors and cleans up duplicate exports, duplicate object keys, duplicate routes, duplicate schemas, and unused variables. The changed files fall under the compliance-sensitive surfaces `pos` and `terminal` tracked by the pre-commit compliance logic. Classification is escalated to `regulatory` to satisfy the repository-wide compliance surface floor for compliance-sensitive files changed in this same branch/PR; this slice does not itself modify compliance policy evaluation logic.

## Affected Surfaces

1. `backend/src/controllers/posController.js`: Facade exports and imports cleaned of duplicate entries.
2. `backend/src/modules/pos/controllers/posHandlers.js` and `backend/src/modules/pos/repositories/posRepository.js`: Removed shadowed/duplicate method definitions.
3. `backend/src/modules/pos/usecases/posUseCases.js`: Unified date validation with scoping check and deleted duplicate declarations.
4. `backend/src/routes/pos.js` and `backend/src/validators/posValidator.js`: Removed duplicate routes and schemas.
5. `backend/src/modules/store/usecases/storeUseCases.js`: Removed unused parameter destructuring.
6. `settings, compliance` — added to satisfy the repository-wide compliance surface floor for compliance-sensitive files changed in this same branch/PR; this slice does not itself modify settings or compliance policy evaluation logic.

## Compliance Preconditions

1. No compliance evaluation logic, fiscal computation formulas, or security rules are modified.
2. The reports overview date validation/normalization rules remain fully active and are correctly wrapped under the read-scoping policy checks.
3. No data schema changes, database migrations, or security policy changes are introduced.

## Verification Evidence

- `npm --prefix backend run lint` runs with zero warnings or errors.
- `npm --prefix backend test -- --runTestsByPath tests/posHandlers.transport.test.js tests/posReports.repository.test.js tests/dgfyAuthUseCases.test.js` passes successfully with 66 tests passing.
