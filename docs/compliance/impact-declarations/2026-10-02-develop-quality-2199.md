---
status: reference
owner: engineering
last_reviewed: 2026-10-02
related_adr: 0033-commercial-promo-and-statutory-pos-discount-boundaries.md
declaration_id: 2026-10-02-develop-quality-2199
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,DISCOUNT_CUSTOMER_NAME_REQUIRED,STATUTORY_IDENTITY_REQUIRED
policy_version: 2026.10.02
verification_evidence: GHA run 36885505736 identified the multiple-beneficiary identity failure; post-fix GHA quality rerun pending
rollback_note: Revert the POS discount-policy change and associated contract-test updates; no migration or persisted-data transformation is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-01T16:55:02.646Z
preflight_request_ref: PREFLIGHT-LOCAL-1790873564695-2026-10-02-DEVELOP-QUALITY-2199
---

# Develop quality repair — multi-beneficiary statutory identity

## Compliance Impact Classification

Major because the changed POS domain path is classified as both POS and
terminal by docs/compliance/compliance-classification-matrix.md. The change
allows a multi-beneficiary statutory discount to satisfy the existing identity
requirement through the name and ID already required for each beneficiary. It
does not change statutory rates, eligible-item rules, approval authorization,
tax treatment, receipt contents, discount totals, or persisted audit evidence.

## Affected Surfaces

- POS checkout's validation of a configured rule that requires a customer
  identity.
- Multiple-beneficiary Senior/PWD checkout, where each beneficiary already
  carries a name, ID number, and eligible item allocations under ADR 0033.

## Compliance Preconditions

- Every statutory beneficiary must still provide a non-empty name and ID number.
- Duplicate beneficiary IDs and aggregate eligible quantities above cart
  quantities remain rejected.
- Existing authorization, eligibility, rate, tax, receipt, inventory, and
  persistence behavior remains unchanged.

## Verification Evidence

- GHA run 36885505736's raw API artifact identified the regression in
  posCheckout.db.integration.test.js.
- A new GHA quality run on the repaired develop SHA is required; the first
  run's API and E2E outcomes are not post-fix verification.
- The local ephemeral compliance endpoint evaluated this declaration and
  returned `no_breach` / `ALLOWED`; reconciliation is recorded in
  `preflight_request_ref` above. This was an isolated local preflight and did
  not target DEV, staging, or production.
