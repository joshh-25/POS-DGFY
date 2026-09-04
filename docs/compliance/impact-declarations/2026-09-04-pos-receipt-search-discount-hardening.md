---
status: reference
owner: engineering
last_reviewed: 2026-09-04
declaration_id: 2026-09-04-pos-receipt-search-discount-hardening
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.04
verification_evidence: focused POS receipt and discount Vitest suites passed,POS and SKUpervisor production builds passed,POS and API lint passed,npm run check:architecture passed
rollback_note: Revert the three POS fix commits together; no schema migration or historical transaction rewrite is involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T16:07:17.508Z
preflight_request_ref: PREFLIGHT-33893050690-2026-09-04-POS-RECEIPT-SEARCH-DISCOUNT-HARDENING
---

# POS Receipt, Search, and Discount Hardening

## Compliance Impact Classification

Major. The changed shared POS files map to the `pos` and `terminal` compliance
surfaces, and the receipt change displays persisted split-tender payment evidence.
The work corrects presentation and request validation without changing fiscal
calculations, payment collection, authorization policy, or historical records.

## Affected Surfaces

- Physical iMin customer receipts now print persisted split-payment allocations.
- The POS catalog clear control removes the complete search query in one action.
- Governed-discount payload construction omits statutory beneficiaries for
  non-statutory discounts while the API tolerates the legacy empty-array shape.
- Senior/PWD beneficiary quantity controls prevent client-side over-allocation and
  block additional blank beneficiary rows.

## Compliance Preconditions

- Receipt values come only from the persisted `payment_breakdown`; no payment amount
  is recalculated or inferred by the printer bridge.
- Server-side statutory-beneficiary identity, eligibility, duplicate-ID, quantity,
  and approval checks remain authoritative and unchanged.
- The API compatibility adjustment accepts an empty beneficiary array but does not
  bypass the POS discount policy use case.
- No database migration, stored financial mutation, authorization change, or new
  compliance exception is introduced.

## Verification Evidence

- POS receipt contract conformance tests passed, including persisted Cash and GCash
  split-payment output.
- POS discount validator tests passed: 18/18.
- Discount and allocation Vitest suites passed: 14/14.
- POS catalog contract tests passed: 8/8.
- `npm run lint --prefix apps/dgfy-pos` passed; API lint completed with zero errors
  and pre-existing warnings only.
- `npm run check:architecture` passed.
- `npm run build:pos` and `npm run build --prefix apps/dgfy-ims` passed.

## Residual Risks

- Final rendered checkout interaction requires an authenticated, unlocked terminal;
  the available temporary browser session reached the correct POS login surface with
  no console errors but could not exercise a financial transaction without credentials.
- Hardware receipt layout was verified by formatter contract tests; a final physical
  printer smoke test remains an operational release check.
