---
status: reference
owner: engineering
last_reviewed: 2026-07-10
related_adr: 0034-manual-delivery-job-foundation.md
declaration_id: 2026-07-10-commercial-promo-expiry
classification: major
surfaces: pos,terminal
reason_codes_impacted: PROMO_EXPIRED,PROMO_NOT_STARTED,ALLOWED
policy_version: 2026.07.10
verification_evidence: backend-lint,commercial-promo-expiry-unit-test,pos-production-build
rollback_note: Revert the optional date-field handling and expiry checks together; promos without dates remain backward-compatible.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T16:25:00+08:00
preflight_request_ref: POS-PROMO-2026-07-10
---

# Commercial Promo Expiry

## Compliance Impact Classification

Major. This change adds server-side validation to the existing commercial promo discount path without changing statutory discount treatment, fiscal evidence, or Storefront API contracts.

## Affected Surfaces

- POS storefront-promo configuration.
- POS promo discount validation.
- Storefront checkout promo validation through the existing shared policy.

## Compliance Preconditions

- Promo end dates are optional and use `YYYY-MM-DD` in the configured storefront timezone.
- An active promo with an end date before the current storefront date is rejected with `PROMO_EXPIRED`.
- Existing promos without date fields retain their existing active, usage-limit, and time-window behavior.

## Verification Evidence

- Backend lint passes.
- Commercial promo expiry unit test passes.
- POS production build passes, including the Asia/Manila expiry badge alignment.
