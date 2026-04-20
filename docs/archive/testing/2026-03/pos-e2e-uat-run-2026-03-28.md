# POS E2E UAT Run Log (2026-03-28)

> Legacy terminology note (2026-04-09): references to "strict mode/strict toggle" in this historical run log are superseded by the dual-mode lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`) defined in `docs/compliance/ph-pos-software-developer-compliance-guide.md` and `docs/features/IMS_POS_SALES_UX_JOURNEY.md`.

**Status:** in_progress  
**Environment:** `http://localhost:5173` / `http://localhost:5000`  
**Tenant:** `token-original` (`Original Legacy Data`)  
**Executed by:** Codex automation + pending human cashier/admin click UAT

## Automated Precondition Validation

1. Login works (`admin@test.com`) -> PASS
2. Tenant plan supports POS (`premium`) -> PASS
3. POS setup required fields populated -> PASS
4. Finished goods VAT coverage (`vatable`, `vat_exempt`, `zero_rated`) -> PASS
5. Finished goods with stock > 0 -> PASS
6. POS catalog loads with VAT-covered finished goods -> PASS
7. Discount preset exists (`Employee Discount 20%`) -> PASS
8. Order method fee matrix exists -> PASS

## Automated Behavior Validation

1. Strict compliance block (simulated missing PTU) -> PASS
   - Checkout returned `422`
   - Missing fields payload included `pos_ptu_number`
2. Strict compliance recovery after PTU restore -> PASS
   - Checkout returned `201`
3. Mixed VAT checkout + discount preset + delivery fee -> PASS
   - `discount_label_snapshot=Employee Discount`
   - `discount_rate_snapshot=20.0000`
   - `service_fee_amount=50.0000`
   - VAT buckets populated from line snapshots
4. POS history and Z-reading generation -> PASS
5. Unified Sales POS source visibility + summary totals -> PASS
   - Includes `service_fee_total`, COGS, gross profit

## Fix Applied During Run

Unified Sales permission parsing bug fixed:
- JSON-string permissions were not being normalized to arrays.
- Result: some valid users saw empty unified sales despite existing POS transactions.
- Fixed in:
  - `backend/src/modules/sales/controllers/salesHandlers.js`
  - `backend/src/modules/sales/repositories/salesRepository.js`
- Regression test added:
  - `backend/tests/salesHandlers.transport.test.js`

## Remaining Human UAT (Required for final signoff)

1. UI screenshots for POS Setup save/reload.
2. UI strict toggle + blocked checkout message screenshot.
3. Checkout cart screenshot with 3 VAT types + discount preset selected.
4. Receipt preview screenshots (header + VAT totals + footer).
5. Before/after stock screenshots from Items page.
6. POS History filtered view + historical receipt/reprint screenshots.
7. Sales page mixed-source screenshot + CSV export sample row.
8. Cashier and Admin signoff fields in `docs/testing/pos-e2e-uat-checklist.md`.
