---
status: reference
owner: engineering
last_reviewed: 2026-07-13
related_adr: 0033-commercial-promo-and-statutory-pos-discount-boundaries.md
declaration_id: 2026-07-13-pos-storefront-promo-and-order-address-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.13
verification_evidence: npm -C frontend test -- --run src/features/pos/utils/storefrontPromoSchedule.test.js src/features/pos/__tests__/storefrontPromoEligibility.contract.test.js src/features/pos/__tests__/terminalLocationScope.integration.test.jsx,npm -C frontend run build:pos,npm run check:architecture
rollback_note: Revert the POS Settings schedule-validation helper, incoming-order presentation changes, and Storefront pickup-address payload update; no migration or persisted fiscal records are changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-13T13:35:00+08:00
preflight_request_ref: PR-38
---

# POS Storefront Promo and Order Address UI

## Compliance Impact Classification

Major. The changed frontend files are within the POS/terminal guardrail perimeter, but this change does not alter fiscal calculations, payment collection, receipt issuance, compliance policies, API routes, or persisted transaction records.

## Affected Surfaces

- POS Settings commercial-promo schedule validation.
- Incoming Storefront-order address presentation in the POS terminal.
- Storefront pickup checkout payload retention of the customer-provided address.
- Incoming-order card layout and action-button presentation.

## Compliance Preconditions

- The backend remains authoritative for promo eligibility, payment state, fiscal calculations, and transaction persistence.
- The existing `storefront_promos` validation contract remains unchanged: date and time ranges are independently optional, but each provided range must be complete.
- No fiscal, payment, receipt, audit, database, or migration contract changes are included.
- Incoming-order address data is displayed as text; delivery coordinates remain limited to the map-link target and are not rendered in the card.

## Verification Evidence

- Focused POS tests passed: 3 files, 12 tests.
- POS production build passed.
- Architecture guardrails passed for the backend and DGFY API checks.
- The affected-file whitespace check passed.
