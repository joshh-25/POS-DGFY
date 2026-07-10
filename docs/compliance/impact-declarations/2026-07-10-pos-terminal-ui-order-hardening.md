---
status: reference
owner: engineering
last_reviewed: 2026-07-10
declaration_id: 2026-07-10-pos-terminal-ui-order-hardening
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.10
verification_evidence: focused POS frontend tests,POS production build,frontend lint
rollback_note: Revert the matching POS terminal UI commit and rerun focused POS tests before release.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T13:50:00+08:00
preflight_request_ref: POS-DEVELOPMENT-UI-2026-07-10
---

# POS Terminal UI And Order Workflow Hardening

## Compliance Impact Classification

Major. This UI change exposes existing governed POS controls and corrects fulfillment and receipt behavior without changing the Storefront integration contract.

## Affected Surfaces

- POS terminal, history, incoming-order queue, receipt preview, item controls, and report access.
- Shared POS asset URL behavior.

## Compliance Preconditions

- The frontend only calls the existing protected void endpoint; the backend remains the authorization and validation authority.
- Void reason entry is mandatory in the UI and server validation remains mandatory.
- Queue actions only show active orders; completed transactions remain history records.
- No Storefront route, payload, response, or connection behavior is modified.

## Verification Evidence

- `npm --prefix frontend test -- orderFulfillmentUi.test.js terminalViewModeContracts.test.js terminalLocationScope.integration.test.jsx`
- `npm --prefix frontend run build:pos`
- `npm --prefix frontend run lint`
