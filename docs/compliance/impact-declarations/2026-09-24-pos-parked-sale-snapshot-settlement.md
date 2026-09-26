---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-24
declaration_id: 2026-09-24-pos-parked-sale-snapshot-settlement
classification: major
surfaces: pos,terminal,inventory,payments,settings
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,RESOURCE_NOT_FOUND
policy_version: 2026.09.24
verification_evidence: focused parked-sale checkout contracts,split-payment route and use-case contracts,shared POS resume and split-payment contracts,POS Storefront SKUpervisor production builds,architecture guardrails,controller boundary check,API and shared frontend lint,git diff check
rollback_note: Revert the historical parked-sale settlement use-case/repository/validator changes, shared resume and split-payment marker propagation, focused tests, and this declaration together; no schema migration or historical-row rewrite is required.
preflight_result: no_breach
preflight_reason_code: NOT_EXECUTED_LOCAL_ONLY
preflight_run_at: 2026-09-24T15:12:00+08:00
preflight_request_ref: NOT-EXECUTED-PARKED-SALE-LOCAL-ONLY
---

# Historical parked-sale snapshot settlement

## Compliance Impact Classification

Major. The change touches the POS checkout and terminal payment boundary under
`apps/dgfy-api/src/modules/pos/` and `packages/web-core/src/features/pos/`.
It preserves the original parked line price when a claimed item later becomes
unavailable, has insufficient stock, has no valid current price, or no longer
has a catalog row. The exception is restricted to the authenticated cashier,
terminal, shift, location, and server-stored parked-sale snapshot.

This declaration covers snapshot-price settlement only. The separate
2026-09-24 parked-sale stock and Back Office approval lifecycle, including its
additive migration and Inventory-owned movements, is declared in
`2026-09-24-pos-parked-sale-lifecycle-approvals.md`.

## Affected Surfaces

- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`: validates the claimed
  parked-sale scope and snapshot marker, settles the stored price, records a
  stock-exempt note-only line when current inventory cannot be used, and writes
  an audit event.
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`: adds a
  parked-settlement-only lookup for inactive, hidden, or soft-deleted item rows;
  ordinary POS catalog lookup remains unchanged.
- `apps/dgfy-api/src/validators/posValidator.js`: preserves the authenticated
  historical-line marker through request validation.
- `packages/web-core/src/features/pos/`: warns on catalog drift during parked
  sale resume and preserves the marker through direct and split-payment checkout.
- No migration, fiscal document schema, payment method, or new authorization
  capability is introduced.

## Compliance Preconditions

1. A historical line must carry `parked_snapshot_line: true` and a
   `parked_sale_id`; the API rejects the marker on ordinary checkout.
2. The parked sale must be claimed by the current user on the same terminal,
   open shift, and location. The server matches quantity, price, modifiers,
   course, selected options, and instructions against the stored snapshot.
3. Only the stored positive sale price is honored. A missing or invalid parked
   price remains a validation failure; no price is invented.
4. A missing, unavailable, or short-stock item is written as a note-only,
   stock-exempt transaction line and creates no inventory movement. The
   settlement is explicitly audited as an original-snapshot-price settlement.
5. Newly added cart lines remain on the ordinary current-catalog, price,
   permission, and inventory validation path.

## Verification Evidence

- Backend parked-sale, repository, and use-case suites: 67/67 passed.
- Backend split-payment, route, parked-sale route, and validator suites: 48/48
  passed.
- Shared POS resume, parked-sale, and split-payment suites: 63/63 passed.
- POS, Storefront, and SKUpervisor production builds: passed.
- API source lint and shared POS lint: zero errors; shared lint reported only
  existing warnings in the large checkout hook.
- Architecture guardrails and controller-boundary checks: passed.
- API syntax checks, validator marker smoke check, `git diff --check`, conflict
  marker scan, debug-artifact scan, and secret-pattern scan: passed.
- Live authenticated cashier/browser settlement against a real tenant database
  was not run in this local audit; it remains a staging/QA acceptance check.
