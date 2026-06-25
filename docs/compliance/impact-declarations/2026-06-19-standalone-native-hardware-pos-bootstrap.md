---
status: reference
owner: engineering
last_reviewed: 2026-06-19
related_adr: docs/architecture/adr/0029-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-06-19-standalone-native-hardware-pos-bootstrap
classification: regulatory
surfaces: pos,terminal,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,RESOURCE_NOT_FOUND
policy_version: 2026.06.19
verification_evidence: npm run lint:docs,npm run check:compliance,npm --prefix backend test -- --runInBand --runTestsByPath tests/mobilePosHandlers.transport.test.js tests/posHandlers.transport.test.js,git diff --check
rollback_note: Revert the mobile-pos backend routes, mobile POS use-case handlers, standalone hardware POS scaffold, ADR, parity contract, and this declaration together if the hardware bootstrap contract must be withdrawn.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-19T12:30:00+08:00
preflight_request_ref: POS-HARDWARE-NATIVE-BOOTSTRAP-2026-06-19
---

# Standalone Native Hardware POS Bootstrap

## Compliance Impact Classification

Regulatory.

This change introduces the first governed bootstrap slice for the standalone native hardware POS. It adds dedicated backend mobile POS contract endpoints, a separate native-hardware product direction, and local hardware POS scaffolding while preserving the existing browser POS. The slice is compliance-sensitive because it establishes new transaction-replay, shift-replay, and hardware-runtime contract surfaces for regulated cashier operations.

## Affected Surfaces

1. New `/api/v1/mobile-pos/*` backend contract endpoints for bootstrap, replay, and checkpoint acknowledgement.
2. POS use-case layer additions that package catalog, settings, terminal policy, and replay responses for native hardware clients.
3. Standalone hardware POS workspace scaffolding with local SQLite schema and sync-policy definitions.
4. Architecture and UX parity documentation establishing the governed split between browser POS and native hardware POS.

## Compliance Preconditions

1. Backend remains the canonical authority for transaction persistence, inventory, permissions, and compliance.
2. The new mobile-pos endpoints must not alter existing `/api/v1/pos/*` browser POS behavior.
3. Pending local transactions must continue to be represented as pending until backend replay succeeds.
4. Sync contract responses must remain deterministic for idempotent replay, conflict, validation failure, and stale-client conditions.
5. Native hardware POS must preserve the current web POS cashier flow contract and must not render the hosted browser POS UI.

## Verification Evidence

Required validation:

1. `npm run lint:docs`
2. `npm run check:compliance`
3. `npm --prefix backend test -- --runInBand --runTestsByPath tests/mobilePosHandlers.transport.test.js tests/posHandlers.transport.test.js`
4. `git diff --check`

## Deployment And Rollback

Deploy the ADR, parity contract, compliance declaration, backend mobile-pos routes/handlers/use cases, and standalone hardware POS scaffold together. Rollback requires removing the `/api/v1/mobile-pos/*` surface and reverting the native-hardware bootstrap artifacts together so backend and documentation do not drift.
