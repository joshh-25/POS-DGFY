# POS Kickoff Migration Dependency Map

> Legacy terminology note (2026-04-09): this migration map includes historical "strict compliance toggle" wording. Current runtime policy is governed by dual-mode compliance lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`) per ADR 0007 and `docs/compliance/ph-pos-software-developer-compliance-guide.md`.

Date: 2026-03-28  
Status: in_progress  
Purpose: Batch 0 baseline artifact for POS/Sales implementation kickoff.

## Dependency-Ordered Migration Chain

1. `20260325000001-add-item-vat-type-for-pos.cjs`
- Adds `items.vat_type` classification needed by checkout VAT snapshots.

2. `20260325000002-create-pos-transactions.cjs`
- Creates `pos_transactions` and `pos_transaction_lines` transactional core.

3. `20260325000003-add-pos-reference-type-and-settings.cjs`
- Adds POS stock-movement references + initial POS settings keys.

4. `20260327000001-add-pos-strict-compliance-setting.cjs`
- Adds strict compliance toggle setting used by checkout block gate.

5. `20260327000002-add-pos-discount-snapshot-columns.cjs`
- Adds immutable discount snapshot columns on `pos_transactions`.

6. `20260328000001-add-pos-order-method-fees.cjs`
- Adds order-method service fee settings + immutable fee snapshot columns.

7. `20260328000002-widen-pos-discount-rate-snapshot.cjs`
- Widens discount percentage precision for snapshot safety.

8. `20260328000003-add-pos-catalog-overrides-and-user-roles.cjs`
- Adds:
  - `pos_catalog_overrides` table
  - user role enum extension (`cashier`, `po`, `do`, `jo`)
  - petty cash setting keys (`pos_petty_cash_symbol`, `pos_petty_cash_amount`)

## Rollback Notes (Safe Order)

Use strict reverse order to preserve dependency safety:

1. `20260328000003`  
2. `20260328000002`  
3. `20260328000001`  
4. `20260327000002`  
5. `20260327000001`  
6. `20260325000003`  
7. `20260325000002`  
8. `20260325000001`

## Risk Notes

- `users.role` enum rollback can fail if rows still contain extended roles; downgrade path must normalize unsupported roles to `staff` before enum shrink.
- Dropping `pos_catalog_overrides` is destructive for override metadata and POS image mappings.
- Fee/discount snapshot rollback removes audit fidelity from historical rows.

## Verification Checklist

1. `npm run doctor:runtime` returns healthy.
2. `npm run check:architecture` passes.
3. `npm run lint:docs` passes.
4. POS targeted transport/use-case/DB suites pass.
5. `backend npm test` + `frontend npm test` + `npm run build` pass before release tagging.
