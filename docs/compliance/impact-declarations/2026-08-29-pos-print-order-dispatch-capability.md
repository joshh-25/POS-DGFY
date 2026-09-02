---
status: reference
owner: engineering
last_reviewed: 2026-08-29
related_adr: 0053-pluggable-pos-hardware-device-drivers.md
declaration_id: 2026-08-29-pos-print-order-dispatch-capability
classification: major
surfaces: pos,terminal
reason_codes_impacted: NO_PRINTER_CONFIGURED,NOT_SUPPORTED
policy_version: 2026.08.29
verification_evidence: focused POS Print Order tests,full shared POS test suite,IMS POS and Storefront production builds,npm run check:architecture,npm run check:compliance
rollback_note: Revert the Print Order callback normalization, order-ticket capability gating, regression tests, and this declaration together. Receipt printing, transaction persistence, fiscal calculations, payment capture, audit payloads, and database schema are unaffected.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.393Z
preflight_request_ref: PREFLIGHT-33588602895-2026-08-29-POS-PRINT-ORDER-DISPATCH-CAPABILITY
---

# POS Print Order Dispatch And Capability Gating

## Compliance Impact Classification

Major. The changed files are under `packages/web-core/src/features/pos/`, whose
classification floor is `major` for the `pos,terminal` surfaces. The runtime
change corrects Print Order dispatch for an active cart and separates receipt
printer availability from order-ticket printer availability. It does not change
payment capture, fiscal calculations, transaction persistence, authorization,
audit payloads, API contracts, or database schema.

## Affected Surfaces

- `pos`, `terminal` — active-cart and historical-transaction Print Order actions.
- POS hardware capability presentation — Print Order and Bill Request are gated
  by order-ticket support, while receipt printing keeps its independent receipt
  capability gate.

## Compliance Preconditions

- Current-cart Print Order must send the active cart, never a React click event,
  to the order-ticket workflow.
- Historical Print Order may use a supplied transaction only when it has a valid
  positive `pos_transaction_id`.
- Receipt and order-ticket capability checks remain independent and use the
  existing pluggable device-driver contract from ADR 0053.
- No payment, tax, discount, inventory, transaction, audit, API, or migration
  behavior changes.

## Verification Evidence

- Focused Print Order and hardware workflow coverage passed: 7 test files and
  62 tests.
- Full shared POS suite passed: 165 test files and 941 tests.
- Production builds passed for `apps/dgfy-ims`, `apps/dgfy-pos`, and
  `apps/dgfy-storefront`.
- `npm run check:architecture` passed.
- `git diff --check` passed.
- Physical-printer smoke testing is deferred to QA on a configured POS device;
  automated tests cover active-cart, historical-order, receipt-only, and
  order-ticket-capable driver paths.

## Preflight Reconciliation

No live environment preflight was executed for this local, develop-targeted
change. `preflight_request_ref: NOT-EXECUTED-1159-POS-PRINT-ORDER` explicitly
records that production verification has not been claimed. The normal
promotion-time compliance preflight remains required.

## Deployment And Rollback

No database migration or deployment sequencing is required. Roll back by
reverting the callback normalization, capability gating, tests, and this
declaration together. LAN-bridge terminals (`lan_escpos_bridge`) will now show
Print Order and Bill Request disabled because that driver implements no
order-ticket path; previously those actions were enabled and returned
`NOT_SUPPORTED`. Verify this disabled state during the deferred physical-device
QA alongside order printing on a supported device.
