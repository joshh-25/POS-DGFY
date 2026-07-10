---
status: reference
owner: engineering
last_reviewed: 2026-07-10
declaration_id: 2026-07-10-pos-commerce-order-hardening
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.07.10
verification_evidence: focused POS frontend tests,POS production build,backend fiscal void test,architecture guardrails,tenant schema coverage,docs lint
rollback_note: Revert the POS commerce commits together, including the delivery_jobs migration and tenant schema registry entry, then rerun architecture and compliance checks.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T13:45:00+08:00
preflight_request_ref: POS-DEVELOPMENT-2026-07-10
---

# POS Commerce And Order Hardening

## Compliance Impact Classification

Major. The change modifies POS transaction controls, receipt-related order data, discount validation, asset handling, and governed void visibility without changing the Storefront API contract.

## Affected Surfaces

- POS transaction lifecycle, incoming-order workflow, receipt preview, and transaction void controls.
- POS discount and fiscal receipt behavior.
- Tenant-scoped delivery job storage and repair registry.
- POS and Storefront image-asset handling.

## Compliance Preconditions

- Server-side `pos:void` permission and required void reason remain authoritative.
- The existing Storefront routes, request payloads, response shapes, and UI connection remain unchanged.
- `delivery_jobs` must be provisioned for every tenant through the migration and tenant schema registry before delivery-job reads are enabled.
- Fiscal transaction lifecycle evidence and stock reversals remain owned by the existing POS void use case.

## Verification Evidence

- `npm --prefix frontend test -- orderFulfillmentUi.test.js terminalViewModeContracts.test.js terminalLocationScope.integration.test.jsx`
- `npm --prefix frontend run build:pos`
- `npm --prefix backend test -- --runTestsByPath tests/posCheckoutFnbContracts.usecase.test.js --testNamePattern="voids a fiscal transaction"`
- `npm --prefix backend run check:architecture-guardrails`
- `npm --prefix backend run check:controller-boundaries`
- `npm --prefix backend run check:tenant-schema-coverage`
- `npm run lint:docs`
