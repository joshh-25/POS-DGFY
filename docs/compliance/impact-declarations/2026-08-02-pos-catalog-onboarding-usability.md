---
status: reference
owner: engineering
last_reviewed: 2026-08-02
declaration_id: 2026-08-02-pos-catalog-onboarding-usability
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.08.02
verification_evidence: Backend geo and storefront asset tests,Frontend POS and map contract tests,Source lint,Architecture guardrails
rollback_note: Revert the address search, onboarding asset upload, and business-mode POS workspace commits together with this declaration.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-02T22:55:00+08:00
preflight_request_ref: POS-CATALOG-ONBOARDING-USABILITY-20260802
---

# POS Catalog And Onboarding Usability

## Compliance Impact Classification

Major. This batch changes governed POS and settings presentation, onboarding
asset handling, and first-party location search. It does not change payment,
discount, inventory, shift, receipt, or transaction authority.

## Affected Surfaces

1. Storefront onboarding accepts large source images only when server-side optimization produces an approved final asset.
2. POS item labels and settings visibility follow the tenant business workflow without changing protected operations.
3. Map pin selection can search the existing first-party Philippine location dataset.

## Compliance Preconditions

1. The backend remains authoritative for tenant access, settings persistence, file validation, and final image size.
2. POS permissions, shift requirements, prices, inventory, discounts, and payments are unchanged.
3. Address search returns public location data and does not expose tenant or customer records.
4. Existing Storefront and POS API contracts remain backward compatible.

## Verification Evidence

1. Backend focused tests passed 2 suites and 9 tests for address search and Storefront asset uploads.
2. Frontend focused tests passed 5 files and 84 tests for map search and POS workspace contracts.
3. Backend and frontend changed production sources passed ESLint with zero errors.
4. Architecture and controller-boundary guardrails passed during the initial pre-commit attempt.
