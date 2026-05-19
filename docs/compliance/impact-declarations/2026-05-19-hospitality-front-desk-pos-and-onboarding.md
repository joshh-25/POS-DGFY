---
status: reference
owner: engineering
last_reviewed: 2026-05-19
related_adr: docs/architecture/adr/0022-hospitality-mode-pms-stay-management.md
declaration_id: 2026-05-19-hospitality-front-desk-pos-and-onboarding
classification: regulatory
surfaces: hospitality,pos,terminal,onboarding,storefront_catalog,settings,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.05.19
verification_evidence: npm --prefix frontend test -- --run src/features/pos/__tests__/hospitalityPos.contract.test.js src/features/onboarding/__tests__/hospitalityOnboarding.contract.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/hospitality/__tests__/hospitalityMode.contract.test.js apps/store/src/__tests__/hospitalityStorefront.contract.test.js,npm --prefix backend test -- --runTestsByPath tests/hospitalityOnboarding.contract.test.js tests/hospitalityUseCases.test.js tests/hospitalityFolioTotals.contract.test.js tests/tenantModelFactory.contract.test.js tests/onboardingUsecases.applicationResult.test.js,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:store,npm run check:architecture,npm run check:compliance,npm run lint:docs
rollback_note: Hide the Hospitality POS panel, disable public Hospitality direct booking confirmation, and revert Hospitality-specific onboarding room setup. Existing folios, rooms, and standard stock-bearing POS flows remain normal tenant records and can continue through Hospitality IMS APIs.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-19T00:00:00+08:00
preflight_request_ref: HOSPITALITY-FRONT-DESK-POS-ONBOARDING-2026-05-19
---

# Hospitality Front-Desk POS and Onboarding

## Compliance Impact Classification

Regulatory.

This declaration covers adding Hospitality-specific front-desk POS folio posting and replacing generic starter-item onboarding readiness with PMS room setup readiness for Hospitality tenants. The change is compliance-sensitive because it touches POS-adjacent charge, payment, refund, and onboarding flows, but it does not alter fiscal receipt issuance, tax calculation, payment authorization, compliance activation, or terminal certification rules.

## Affected Surfaces

- Hospitality POS now exposes a front-desk panel for reservation-to-folio lookup and folio line posting.
- Supported folio lines include room charges, amenities, minibar, retail, room service, deposits, payments, refunds, and adjustments.
- Folio deposits and payments reduce guest balance; refunds reverse payments and increase balance.
- Stock-bearing minibar and retail product sale remains available through the existing POS terminal and inventory/FIFO contracts.
- Hospitality onboarding now uses room type and room setup after brand assets and primary location, instead of generic bulk starter items.
- Hospitality onboarding readiness requires a bookable active room type with a positive default rate and at least one active room.
- The generic corrected-mode starter item readiness contract remains unchanged for non-Hospitality modes.
- Public direct booking now requires persisted holds and idempotency keys so customer retries do not duplicate bookings and active holds reduce availability.
- Optional Store JWT direct bookings are linked to `store_customer_id`; authenticated customers can list redacted stay history and can claim an existing booking only when the booking email matches the signed-in customer email.
- Reservation records persist future OTA/channel reconciliation metadata (`external_source`, `external_reference`, `channel_metadata`) without enabling live OTA sync.
- Reservation creation can auto-assign rooms when requested, and check-in/in-house transitions must assign a physical room before creating an in-house stay.
- Staff room moves and stay date changes are backend-validated for ownership, matching room type, assigned-room conflicts, and room-type capacity before persistence.
- Checkout is blocked while open folios have a remaining balance unless staff deliberately sends a non-persisted balance override flag.
- Hospitality dashboards/reports now expose operational readiness metrics such as occupancy, ADR, RevPAR, unassigned arrivals, and out-of-order rooms.
- Storefront quote/booking UI states deposit due and property collection explicitly; no online card authorization or deposit capture is introduced by this declaration.
- Reservation, folio, and maintenance-blocking mutations now write Hospitality domain audit events and mirror actor/request metadata into the existing tenant `audit_logs` table.

## Compliance Preconditions

1. Hospitality folio posting must stay inside authenticated tenant APIs and must not expose internal costs through public Storefront contracts.
2. Refund and payment folio lines remain operational records and must be audit logged in both Hospitality domain audit and tenant-wide `audit_logs`.
3. Stock deduction for physical minibar and retail products must continue through the existing POS checkout and location stock/FIFO paths.
4. Hospitality onboarding must only create tenant-local room types and rooms through Hospitality APIs; it must not synthesize inventory items for room nights.
5. Onboarding remains a soft setup guide and does not change tenant compliance activation states.
6. Front-desk folio actions must remain mode-gated to Hospitality tenants in the POS surface.
7. Storefront booking confirmation must fail without a valid hold token and must replay matching idempotent requests.
8. Authenticated stay-history and claim responses must stay redacted and must not expose customer contact fields, internal notes, internal room status, or payment adapter internals.
9. Deposit/payment labels must remain informational unless a governed payment-adapter change adds real authorization/capture.
10. Room moves, stay extensions, checkout overrides, and status transitions must write Hospitality audit events with actionable before/after state.

## Verification Evidence

- `npm --prefix frontend test -- --run src/features/pos/__tests__/hospitalityPos.contract.test.js src/features/onboarding/__tests__/hospitalityOnboarding.contract.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx`
- `npm --prefix backend test -- --runTestsByPath tests/hospitalityOnboarding.contract.test.js tests/hospitalityUseCases.test.js tests/onboardingUsecases.applicationResult.test.js`
- `npm --prefix frontend run build:skupervisor`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm run lint:docs`

## No Architecture Exception Required

The change uses the ADR 0022 Hospitality PMS boundary and keeps POS fiscal compliance, inventory stock movement, onboarding, and public Storefront contracts in their existing module boundaries. No compliance allowlist entry or architecture exception is introduced.
