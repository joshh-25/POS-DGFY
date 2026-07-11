---
status: reference
owner: engineering
last_reviewed: 2026-07-11
related_adr: 0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-07-11-pos-offline-navigation-contract-test
classification: major
surfaces: pos,terminal,pwa
reason_codes_impacted: ALLOWED
policy_version: 2026.07.11
verification_evidence: focused POS contract test,POS production build,architecture guardrails,docs lint
rollback_note: Revert the test expectation and declaration; no runtime or persisted data behavior changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-11T10:00:00+08:00
preflight_request_ref: POS-OFFLINE-NAVIGATION-TEST-2026-07-11
---

# POS Offline Navigation Contract Test

## Compliance Impact Classification

Major by repository classification because the test covers a compliance-sensitive POS terminal navigation rule. The change updates test coverage for the existing rule that the remote Online Orders queue is unavailable while offline. It does not modify runtime checkout, payment, fiscal, Storefront, API, or database behavior.

## Affected Surfaces

- POS terminal sidebar contract test for Online Orders availability.

## Compliance Preconditions

- Online Orders remains a remote-only operation and must stay unavailable offline.
- The change must not alter checkout, payment, fiscal receipt, Storefront API, or database contracts.

## Verification Evidence

- `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js`
- `npm run build:pos`
- `npm run check:architecture`
- `npm run lint:docs`
