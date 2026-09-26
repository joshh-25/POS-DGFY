---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-12
declaration_id: 2026-09-12-storefront-convenience-fee-phase-333
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.12
verification_evidence: focused Storefront/API checkout suites, payment-finalization regression, Storefront lint and build, API contract compliance check, documentation checks, git diff check
rollback_note: Revert the Phase 333 Storefront fee calculation, payment metadata, summary rendering, tests, documentation, and declaration together; existing historical transaction and payment rows require no data rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-12T20:50:00+08:00
preflight_request_ref: NOT-EXECUTED-STOREFRONT-CONVENIENCE-FEE-PHASE-333-LOCAL-ONLY
---

# Storefront customer convenience fee retirement

## Compliance Impact Classification

Major by the repository path-based classification floor. Phase 333 changes the customer-facing
Storefront quote, checkout, and payment-session totals, so the payments surface is affected. The
change removes the DGFY convenience-fee add-on from new Storefront orders; it does not change the
separate F&B restaurant service charge, delivery-fee calculation, POS cashier checkout, or the
tenant-revenue-sharing settlement policy.

## Affected Surfaces

- Storefront pricing and review/payment summaries in F&B, Retail, and Simple modes.
- Storefront checkout persistence and PayMongo payment-session metadata.
- Payment finalization handling for the new explicit no-split versus historical split-session shape.
- API/ADR contracts describing the compatibility `service_fee_*` fields and customer total.

## Compliance Preconditions

- New Storefront quotes and orders set `service_fee_amount` to `0` and calculate the customer total
  from the discounted item subtotal plus the resolved delivery fee.
- Existing `service_fee_*` columns and positive historical snapshots remain readable and are not
  recomputed or backfilled.
- The F&B restaurant service charge remains separate and continues to follow its existing taxable
  versus non-taxable policy.
- Any legacy non-revenue-sharing QR Ph platform settlement is kept separate from the customer total
  and marked tenant-funded; tenant revenue sharing remains governed by its existing policy.
- No database migration, tenant data rewrite, permission change, or fiscal-mode transition is
  introduced.

## Verification Evidence

- API focused checkout/payment tests pass, including quote totals, F&B modifiers, downpayment
  capture amounts, payment metadata, and payment finalization behavior.
- Storefront focused summary/totals tests pass across F&B, Retail, and Simple modes; Storefront
  production build and lint pass with existing warnings only.
- API contract compliance, architecture/documentation checks, and `git diff --check` pass before
  delivery. The aggregate working-tree declaration gate is not independently attributable because
  unrelated pre-existing POS/terminal changes are mixed into the dirty worktree.

This declaration is for the authorized local implementation only. No PR, push, deployment, or
production data mutation was requested or performed.
