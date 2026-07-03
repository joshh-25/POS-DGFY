---
status: reference
owner: engineering
last_reviewed: 2026-07-03
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-03-pos-online-order-pairing-hotfix
classification: major
surfaces: pos,terminal,online-orders,terminal-auth
reason_codes_impacted: POS_TERMINAL_PAIRING_INVALID
policy_version: 2026.07.03
verification_evidence: npm run check:architecture,npm run check:compliance,backend focused POS route/usecase tests
rollback_note: Revert the POS route middleware change so online order status updates again require the pairing cookie.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-03T00:00:00+08:00
preflight_request_ref: POS-ORDER-PAIRING-HOTFIX-2026-07-03
---

# POS Online Order Pairing Hotfix

## Compliance Impact Classification
Major

## Affected Surfaces
- Backend POS route authorization for `PATCH /api/v1/pos/orders/:id/status`
- Online Store incoming-order confirmation and rejection from the POS Orders view

## Compliance Preconditions
- The route still requires authenticated tenant POS access through the existing POS router stack.
- The route still requires `pos:transact` through `checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS)`.
- The use case still requires an authenticated POS user and an open shift for the online order location before mutation.
- Physical-device pairing remains optional compatibility state under ADR 0031 and must not block normal order handling.

## Verification Evidence
- `npm run check:architecture`
- `npm run check:compliance`
- `node --experimental-vm-modules ...jest.js --config jest.config.cjs --runInBand --runTestsByPath tests/rbacRouteCoverage.contract.test.js tests/posHandlers.transport.test.js tests/posUsecases.applicationResult.test.js`
- Exact-master release inventory must include this declaration with the POS route and route contract test.

## Rollback Note
Revert `backend/src/routes/pos.js` and this declaration if production shows unexpected POS order-status authorization behavior.
