# Configurable Discount Management — Phase 5

## Browser/PWA POS transaction integration

Phase 5 connects the approved discount configuration directory to the browser/PWA POS checkout flow. The independent mobile POS remains outside this phase and was not changed.

## Delivered behavior

- Adds `GET /pos/discount-rules` for transaction clients with the existing POS transaction permission.
- Returns only rules where `is_active = true` and `is_approved = true`.
- Exposes configured rule identity, name, method, percentage/fixed amount, requirements, description, and configuration version to the POS selector.
- Displays one configured option for each standard rule type and a separate option for each approved custom rule.
- Keeps Voucher as a specialized server-authoritative instrument instead of treating it as a configurable percentage rule.
- Uses the configured rule name and configured rate/amount in the browser workspace; incomplete or invalid configurations are not offered as usable configured discounts.
- Preserves the existing legacy Promo/Voucher compatibility paths while the discount directory is loading or when the specialized server flow is selected.

## Server authority and validation

The checkout request carries the selected `rule_id` and `discount_key`, but those values are only identifiers. Before calculation, the server re-reads the rule inside the checkout transaction and requires:

1. The rule identity and requested type to match.
2. `is_active = true`.
3. `is_approved = true`.
4. A valid configured percentage or fixed amount.

Custom rules must be selected by stable identity; the server never chooses an arbitrary custom rule. The calculator no longer supplies a statutory percentage fallback, so a missing configured rate cannot silently become a hardcoded rate.

## Historical transaction behavior

- The applied configured label, rate, and calculated amount continue through the existing immutable transaction snapshot fields.
- Governed transaction discount rows keep the rule identity, actual rate used, and actual discount amount.
- Item discount snapshots keep their configured rule identity and applied values.
- Updating or disabling a rule changes future checkout eligibility only; completed transactions are not recalculated.

## Files

- `apps/dgfy-api/src/modules/pos/repositories/posDiscountConfigurationRepository.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/domain/posDiscountPolicy.js`
- `apps/dgfy-api/src/modules/pos/domain/posDiscountCalculator.js`
- `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`
- `apps/dgfy-api/src/routes/pos.js`
- `packages/web-core/src/features/pos/utils/posDiscountOptions.js`
- `packages/web-core/src/features/pos/hooks/usePosDiscountDirectory.js`
- `packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx`
- `packages/web-core/src/features/pos/components/POSDiscountWorkspace.jsx`
- `packages/web-core/src/features/pos/components/POSCheckoutConfirmDialog.jsx`
- `packages/web-core/src/features/pos/hooks/usePosCheckoutWorkflow.js`

## Validation

- Backend focused suites: 5 suites, 98 tests passed.
- Browser/PWA POS focused suites: 6 files, 61 tests passed.
- Targeted frontend lint: passed with existing warnings only; no errors.
- `apps/dgfy-ims` production build: passed.
