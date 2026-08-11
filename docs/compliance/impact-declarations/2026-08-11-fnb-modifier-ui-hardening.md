---
status: reference
owner: engineering
last_reviewed: 2026-08-11
declaration_id: 2026-08-11-fnb-modifier-ui-hardening
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: focused F&B backend contracts,POS and Storefront modifier component tests,deterministic F&B Playwright contract,POS and Storefront production builds
rollback_note: Revert the F&B modifier UI commit while retaining the additive schema until dependent tenant assignments are assessed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-11T00:00:00+08:00
preflight_request_ref: FNB-MODIFIER-UI-PHASE42-20260811
---

# F&B Modifier UI Hardening

## Compliance Impact Classification

Major. POS and Storefront now consume the same effective F&B modifier-group
contract, including folder inheritance, item exclusions, required overrides,
availability, quantity constraints, and edit-session restoration. The change
does not alter fiscal calculations or bypass checkout validation.

## Affected Surfaces

1. POS modifier configuration and item-edit sessions.
2. Storefront modifier presentation, cart selection, and guest-checkout state.
3. Deterministic F&B browser and readiness-gate coverage.

## Compliance Preconditions

1. The API remains authoritative for effective modifier assignments.
2. Required, inactive, unavailable, and quantity-limited options fail closed.
3. Item-level exclusions override inherited folder assignments without changing
   historical order snapshots.
4. POS and Storefront submit the same validated option identifiers and prices.

## Verification Evidence

1. Focused backend assignment, validator, and migration tests accompany the
   schema/domain commit.
2. POS and Storefront component/model tests cover inherited assignments,
   required selections, edit restoration, and condition handling.
3. The maintained deterministic F&B Playwright contract is included in the
   readiness gate and will be rerun after merging `develop`.
4. Affected production builds remain mandatory before the draft PR is opened.
