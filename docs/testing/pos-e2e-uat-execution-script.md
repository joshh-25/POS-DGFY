# POS E2E UAT Execution Script (Cashier + Admin)

Status: in_progress  
Run order: sequential (do not skip failed steps)

## 0) Session Header

1. Fill run metadata in the latest dated run log (current baseline: `docs/testing/pos-e2e-uat-run-2026-04-16.md`) or create a new dated run file.
2. Open and complete signoff rows in `docs/testing/pos-e2e-uat-checklist.md`.
3. Create screenshot folder: `docs/testing/evidence/pos-e2e-<date>/`.

## 1) Environment Integrity Preconditions

1. `npm run doctor:runtime` -> must be healthy.
2. `npm run smoke:pos-local` -> all endpoints must be `200`.
3. Login using target cashier and admin accounts.

If any precondition fails: stop and log blocker as `ENV_BLOCKER`.

## 2) Admin Track (Settings + Compliance)

1. Open `Settings > POS Setup`.
2. Edit then save all compliance fields.
3. Hard refresh page and verify persistence.
4. Move tenant to `compliant_pending` (or use an existing compliant-pending tenant).
5. Clear one required compliance field (example PTU) and save.
6. Switch to cashier and attempt checkout.
7. Verify checkout blocked with deterministic missing-field output + reason code.
8. Restore missing field and save.
9. Retry checkout and verify success.
10. Validate non-compliant tenant path still issues non-fiscal output contract.
11. Verify terminal identity policy mode behavior matches tenant config (`warn`/`enforce`).

Required screenshots:
1. `A1-settings-before-save.png`
2. `A2-settings-after-refresh.png`
3. `A3-compliance-block-message.png`
4. `A4-checkout-success-after-fix.png`
5. `A5-terminal-identity-policy.png`

## 3) Cashier Track (POS Core Flow)

1. Open POS checkout.
2. Unlock terminal with selected terminal identity.
3. Add at least one item per VAT type (`vatable`, `vat_exempt`, `zero_rated`).
4. Apply discount preset if available.
5. Use order method with configured fee (if configured).
6. Complete checkout.
7. Open receipt preview and verify:
   - compliance header fields
   - VAT breakdown
   - discount line
   - service fee line (if configured)
8. Verify stock decrease in Items page.

Required screenshots:
1. `C1-cart-before-checkout.png`
2. `C2-receipt-header.png`
3. `C3-receipt-vat-breakdown.png`
4. `C4-stock-before-after.png`

## 4) Cashier/Admin Shared Track (History + Z-Reading + Sales)

1. Open POS History and filter by invoice/date/payment/order method/cashier.
2. Open historical transaction and trigger reprint/preview.
3. Run Close Day / Z-Reading.
4. Use `Open in Sales Report` from POS history/receipt context.
5. Confirm Sales page opens with matching filters/transaction context and POS row totals.
6. Export sales CSV and validate one sample row.
7. Execute source-separation checks:
   - POS History source filter (`In-Store`, `Online Store`)
   - Sales POS Channel filter (`POS In-Store`, `POS Online Store`)
   - CSV includes `pos_order_source` and values match active filter

Required screenshots:
1. `S1-pos-history-filtered.png`
2. `S2-historical-transaction-preview.png`
3. `S3-zreading-summary.png`
4. `S4-sales-table-pos-row.png`
5. `S5-sales-export-sample-row.png`
6. `S6-history-to-sales-handoff.png`
7. `S7-pos-history-source-in-store.png`
8. `S8-pos-history-source-online-store.png`
9. `S9-sales-pos-channel-in-store.png`
10. `S10-sales-pos-channel-online-store.png`
11. `S11-sales-csv-pos-order-source-sample.png`

## 5) Failure Taxonomy (Mandatory)

If a step fails, label it exactly as one of:

1. `ENV_BLOCKER` (service/migration/runtime unavailable)
2. `DATA_SETUP_BLOCKER` (missing catalog/VAT/stock/users/permissions)
3. `UX_BLOCKER` (flow unclear/misleading despite correct backend behavior)
4. `LOGIC_BLOCKER` (totals/reconciliation mismatch, incorrect behavior)
5. `SECURITY_BLOCKER` (auth/permission/session breach)

## 6) Exit Rule

Final readiness cannot move to done unless:

1. No open `LOGIC_BLOCKER` or `SECURITY_BLOCKER`.
2. Cashier + Admin signoff rows are completed.
3. Evidence screenshots listed above exist and are referenced in the run log.
