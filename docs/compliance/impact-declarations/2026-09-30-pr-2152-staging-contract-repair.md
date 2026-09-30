---
status: reference
owner: engineering
last_reviewed: 2026-09-30
declaration_id: 2026-09-30-pr-2152-staging-contract-repair
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.30
verification_evidence: POS contract tests verify the removed POS Back Office route stays absent and cashier source assertion is indentation-agnostic,npm run build:pos and npm run build:skupervisor pass
rollback_note: Revert the POS contract-test expectation change and this declaration. No runtime behavior or persisted data changes are included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-30T04:17:31.745Z
preflight_request_ref: PREFLIGHT-LOCAL-1790741747333-2026-09-30-PR-2152-STAGING-CONTRACT-REPAIR
---

# POS Contract Test Repair for Staging Candidate 2026-09-30-01

## Compliance Impact Classification

Major. The automated path floor classifies changes under `packages/web-core/src/features/pos/` as `major` on the `pos` and `terminal` surfaces. This change only updates source-contract assertions; it does not change POS runtime behavior.

## Affected Surfaces

- POS Back Office route-boundary contract test.
- POS cashier settings source-contract test.

## Compliance Preconditions

1. POS continues to expose no Back Office route or OPIS handoff.
2. OPIS remains independently accessible with its own route tree.
3. No API, data, permission, fiscal, checkout, or payment behavior changes are included.

## Verification Evidence

- `packages/web-core/src/features/hospitality/__tests__/hospitalityMode.contract.test.js` and `packages/web-core/src/features/pos/__tests__/posSettingsCashier.contract.test.js` passed via Vitest (84 tests across both files).
- POS, IMS, Storefront, and OPIS production builds passed.
- The cashier settings assertion searches for the component and panel markers without assuming indentation.

## Preflight Reconciliation

This declaration is reconciled against the repository's ephemeral local preflight fixture before commit. The change is test-only; the preflight evaluates the declared POS and terminal surfaces and does not exercise or modify deployed tenant data.
