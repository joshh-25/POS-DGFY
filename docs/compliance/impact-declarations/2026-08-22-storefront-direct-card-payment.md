---
status: reference
owner: engineering
last_reviewed: 2026-08-22
declaration_id: 2026-08-22-storefront-direct-card-payment
classification: major
surfaces: pos,terminal,payments,storefront
reason_codes_impacted: STOREFRONT_DIRECT_CARD_AUTHORIZATION
policy_version: 2026.08.22
verification_evidence: storefront-payment-contract-tests,paymongo-service-syntax-check
rollback_note: Disable the direct-card feature flags and revert the direct-card adapter changes; existing hosted checkout remains the fallback when the strict flag is disabled.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T00:00:00+08:00
preflight_request_ref: #843
---

# Storefront Direct Card Payment

## Compliance Impact Classification

Major because the Storefront payment boundary now supports direct card authorization through
PayMongo. Walk-in POS merchant-owned tenders remain outside this flow.

## Affected Surfaces

- Storefront card payment session creation and return handling.
- PayMongo direct-payment adapter configuration.

## Compliance Preconditions

- Direct card authorization remains disabled unless the explicit feature flags are enabled.
- Card data is sent to PayMongo and is not stored by DGFY.
- Live enablement requires payment-provider and PCI review; local tests use sandbox data only.

## Verification Evidence

- Storefront direct-payment contract tests pass.
- PayMongo adapter syntax and unit checks pass.
