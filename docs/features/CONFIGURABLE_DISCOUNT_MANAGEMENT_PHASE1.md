---
status: complete
authority_level: implementation-reference
owner: pos-platform
applies_to: apps/dgfy-pos and packages/web-core POS sell surface
topic: configurable_discount_management_phase1
---

# Configurable Discount Management — Phase 1 Audit

## Scope

This audit covers the browser/PWA POS in `apps/dgfy-pos` and the shared POS
implementation in `packages/web-core`. The independent mobile application is
outside this phase.

Phase 1 is discovery and migration mapping only. It does not change checkout
calculation, settings behavior, database schema, or transaction data.

## Current discount sources

| Source | Current responsibility | Phase 2 treatment |
| --- | --- | --- |
| `pos_discount_rules` | Server-authoritative governed POS rules for Senior, PWD, Employee, and Manual discounts | Extend as the authoritative configurable rule store; preserve existing rule IDs and transaction references |
| `pos_discount_profiles` | Legacy JSON presets with `name`, `percentage`, and `active` | Migrate into configurable rules; retain compatibility reads during cutover |
| `storefront_promos` | Commercial promo codes with target items, channel, timing, and usage constraints | Keep the specialized commercial-promo contract; expose its status in the management experience without flattening it into a static percentage rule |
| Voucher records and redemptions | Code-based redemption with percentage, amount-off, or fixed-price benefits | Keep the voucher redemption contract; do not convert vouchers into ordinary static discount rows |
| `pos_tax_policies` | VAT treatment for discount categories | Remain separate from discount percentage and approval configuration |

## Runtime consumers

- `POSCheckoutConfirmDialog` currently owns the fixed discount-type selector.
- `POSDiscountWorkspace` collects discount identity, item selection, rate/method,
  promo/voucher data, and transaction approval input.
- `POSCheckoutTerminal` loads legacy profiles and coordinates applied discount
  state.
- `usePosFinancialWorkflow` calculates the client-side preview.
- `usePosCheckoutWorkflow` builds the checkout payload, applies online/offline
  rules, and preserves discount snapshots for queued and completed sales.
- `posDiscountPolicy` resolves server-authoritative governed rules.
- `posDiscountCalculator` calculates governed discount allocations.
- `posRepository.createGovernedTransactionDiscount` persists governed discount
  audit and line-allocation records.

## Confirmed hardcoded behavior

The following values must be removed or replaced during delivery phases:

1. The governed-discount seed migration creates Senior Citizen and PWD rules at
   20%.
2. `posDiscountPolicy` falls back to 20% when a Senior/PWD rule has no rate.
3. `posDiscountCalculator` directly uses 20% for statutory calculations.
4. The POS checkout selector contains fixed display labels for Employee, Senior
   Citizen, PWD, Promo, Voucher, and Other.
5. The terminal workflow contains a fixed label map for governed discounts.
6. Legacy profile resolution reads `pos_discount_profiles` directly instead of
   resolving a rule record.

Canonical internal keys such as `senior`, `pwd`, `employee`, `promo`,
`voucher`, and `manual` remain required for API compatibility, eligibility,
tax treatment, approval, reporting, and historical audit. They are not user-
editable display names.

## Historical transaction contract

The existing transaction model already supports the required immutable values:

- `pos_transactions.discount_label_snapshot`
- `pos_transactions.discount_rate_snapshot`
- `pos_transactions.discount_amount`
- `pos_transaction_discounts.discount_rule_id`
- `pos_transaction_discounts.discount_rate`
- `pos_transaction_discounts.discount_amount`
- Per-line discount allocation records

No completed transaction should be repriced when a rule changes. Phase 2 must
preserve these fields and add only the minimum configuration metadata needed
for future audit and concurrency checks.

## Migration mapping

### Existing governed rules

- Preserve the existing `pos_discount_rules.id`.
- Preserve the existing canonical `type`.
- Copy `name` and `rate` without transformation.
- Map `is_active` to the future Enabled status.
- Initialize configuration Approved to `true` for existing active rules so the
  migration preserves current cashier behavior.
- Keep the existing transaction-level approval PIN and approver audit flow.

### Legacy POS profiles

- Create one configurable rule for each valid legacy profile.
- Preserve the profile name and percentage.
- Map `active !== false` to Enabled.
- Initialize configuration Approved to `true` for profiles that were already
  active and selectable.
- Mark the source as legacy for compatibility and reconciliation.
- Do not delete the original setting until the runtime cutover is verified.

### Commercial promos and vouchers

These remain separate policy engines. Their configured names, percentages, or
benefits are already server-authoritative, but their additional code, scope,
time, usage, and redemption rules must continue to run.

## Required Phase 2 decisions

1. Add a `custom` rule capability for administrator-created static discounts;
   built-in canonical types retain their specialized validation.
2. Preserve both percentage and fixed-amount methods in the data model, while
   the first Add Discount UI may default to percentage.
3. Treat configuration Approved as an administrator availability gate, never
   as a replacement for cashier/manager transaction authorization.
4. Use disable/archive instead of destructive deletion so historical rule
   references remain meaningful.

## Phase 1 gate

Phase 1 is complete when:

- Every current discount source has a migration destination.
- Hardcoded display labels and rate locations are identified.
- Historical snapshot fields are confirmed.
- Promo and voucher boundaries are preserved.
- The implementation target is limited to the browser POS.

The next phase is the schema and migration work for `pos_discount_rules`.
