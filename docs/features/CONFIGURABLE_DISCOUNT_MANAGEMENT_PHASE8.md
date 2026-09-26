# Configurable Discount Management — Phase 8

## Final release verification

Phase 8 closes the automated verification gap for configurable discounts in the browser/PWA POS. It does not execute a production migration or modify the independent mobile POS.

## Delivered verification

- Added behavior coverage for the configurable discount schema migration across the landlord database and active tenant databases.
- Verified additive columns, the `custom` type enum, normalized non-null discount keys, and availability indexes.
- Verified legacy `pos_discount_profiles` values migrate into preserved `legacy_profile` rules while invalid profiles are skipped without deleting the original setting.
- Verified the migration is safe to rerun without duplicate migrated rules or repeated DDL.
- Verified rollback is blocked while custom or migrated rules still exist, protecting configuration and historical references.
- Re-ran the backend management, policy, calculator, schema, validator, and migration suites.
- Re-ran the browser/PWA settings, selector, checkout, transaction-history behavior, item-discount, and parked-sale discount suites.

## Automated validation

- Backend configurable-discount gate: 8 suites, 106 tests passed.
- Browser/PWA discount gate excluding the unrelated transaction-history layout contract: 20 files, 205 tests passed.
- New migration test lint: 0 errors and 0 warnings.
- Existing Phase 7 frontend build, targeted lint, documentation lint, and ADR lint remain green.

## Known unrelated repository failure

The broader browser/PWA run still reports one pre-existing assertion in `posTransactionHistory.contract.test.js` for a compact discount-column CSS class. The transaction-history component and that contract were already modified outside this discount phase; Phase 8 does not change or mask that failure.

## Manual release gate

Before deployment, the release owner must:

1. Back up the affected databases and run the migration through the normal migration runner in the target environment.
2. Confirm landlord and active tenant schemas contain the new columns and indexes.
3. Compare migrated legacy-rule counts with the preserved `pos_discount_profiles` settings and confirm invalid entries were reported, not deleted.
4. Smoke-test administrator create, edit, disable, approve, and re-enable actions.
5. Smoke-test cashier selection, changed-rate behavior for new transactions, historical snapshot preservation, and parked-sale revalidation.
6. Record the migration result and rollback decision in the release evidence.

No production database was changed during this phase.

## Files

- `apps/dgfy-api/tests/configurableDiscountMigration.test.js`
- `docs/features/CONFIGURABLE_DISCOUNT_MANAGEMENT_PHASE8.md`
