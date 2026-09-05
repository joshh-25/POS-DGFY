---
status: reference
owner: engineering
last_reviewed: 2026-09-05
declaration_id: 2026-09-05-pos-checkout-validation-limits
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: API unit tests 88 passed,frontend unit and rendered component tests 23 passed,IMS POS and Storefront production builds passed
rollback_note: Revert the validation and UI limit changes together; retain existing fiscal records and use a new patch version for any subsequent release. No migration is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-05T14:30:00+08:00
preflight_request_ref: NOT-EXECUTED-PR-1619
---

# POS checkout validation limits

## Compliance Impact Classification

Major, matching the POS and terminal frontend path floor.

## Affected Surfaces

Voucher requests may supply a null method because the server resolves the voucher
benefit. Other discount types retain strict method validation. Senior/PWD input
checks enforce names of 2–120 characters, primary IDs of 2–100 characters,
additional IDs of 2–120 characters, and at most 20 beneficiaries including the
primary beneficiary. Existing API limits, calculations, authorization, item
eligibility, and stored fiscal records remain authoritative.

## Compliance Preconditions

**Live preflight has NOT been executed.** The front-matter result and timestamp
are declaration placeholders required by the document gate, not an endpoint
response or a claim of production readiness. The NOT-EXECUTED reference must be
replaced by real preflight evidence before merging this main-targeted hotfix.
This follows the PR-open placeholder convention in
`docs/compliance/request-time-preflight-protocol.md`.

## Verification Evidence

- API tests exercise the actual Voucher UI payload across all six payment methods
  and confirm that Other discounts still reject null methods.
- Identity-boundary tests cover short and oversized values and the primary-ID limit.
- Rendered component tests cover desktop and tablet layouts, the disabled Add
  button at 20 beneficiaries, and input maxLength attributes.
- All three frontend builds passed; POS and Storefront reported chunk-size warnings.
- No new persistence, replay, authentication, or payment collection behavior is
  introduced. End-to-end tablet checkout and live compliance preflight remain
  release verification obligations, not completed evidence.

## References

- PR #1619; related issues #1584 and #1101.
- ADR 0033 exact cart-line scope and multi-beneficiary amendments.
- ADR 0081 patch-only main hotfix versioning.
