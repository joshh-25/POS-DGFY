# POS End-to-End UAT Checklist (Cashier + Admin)

**Status:** in_progress until all sections are signed  
**Purpose:** close the final user-readiness gap through human verification in staging/production-like environment.

Execution support artifacts:

1. `docs/testing/pos-e2e-uat-execution-script.md`
2. `docs/testing/pos-e2e-uat-evidence-template.md`

## 1) Test Session Metadata

- Date:
- Environment URL:
- Backend version/commit:
- Frontend version/commit:
- Tenant:
- Tested by (Cashier):
- Tested by (Admin):

## 2) Preconditions (Must be true before running)

1. Tenant is active and login works.
2. Tenant plan allows POS (`premium`).
   - If `PAYMENTS_ENABLED=false`, plan metadata alone satisfies premium route gate.
   - If `PAYMENTS_ENABLED=true`, premium subscription state must also be active/in-grace.
3. POS setup fields are configured in **Settings > POS Setup**:
   - `pos_business_name`
   - `pos_tin_branch`
   - `pos_address`
   - `pos_ptu_number`
   - `pos_min_number`
   - `pos_accreditation_number`
4. At least 3 finished goods exist with different VAT types:
   - one `vatable`
   - one `vat_exempt`
   - one `zero_rated`
5. Finished goods have non-zero stock.
6. Cashier role has POS permissions (`pos:view`, plus `pos:transact` for checkout flows).
7. Admin role has settings + reports/sales visibility permissions.
8. Terminal identity policy is known for the test tenant (`warn` or `enforce`) and at least one active registry entry exists when `enforce` is enabled.

## 3) Admin UAT Scenarios

### 3.1 POS Setup Save/Reload
1. Open `Settings > POS Setup`.
2. Edit all POS metadata fields.
3. Save and refresh browser.
4. Confirm values persist exactly.

Expected:
1. Save returns success.
2. Reloaded form shows saved values.

Evidence:
- Screenshot before save
- Screenshot after reload

### 3.2 Compliance Gate (Dual-Mode Lifecycle)
1. For a tenant in `compliant_pending`, clear one required checklist field (example: PTU).
2. Attempt checkout as cashier.
3. Repeat for a tenant in `non_compliant_active` and verify non-fiscal output contract.

Expected:
1. Checkout is blocked.
2. Error explicitly lists missing field(s) with deterministic reason code and fix path.
3. Non-compliant tenant remains operational with `non_fiscal_slip` output (no fiscal escalation).

Evidence:
- Screenshot of blocked checkout message
- Screenshot of missing field in settings

### 3.3 Compliance Gate Recovery
1. Fill missing required field.
2. Retry checkout.

Expected:
1. Checkout succeeds without false-positive block.

Evidence:
- Screenshot of successful checkout after fix

## 4) Cashier UAT Scenarios

### 4.1 POS Catalog + Cart
1. Open POS terminal page.
2. Unlock terminal using a selected terminal identity.
3. Confirm finished goods catalog loads.
4. Add 3 items (vatable/exempt/zero-rated) to cart.
5. Change quantity and sale price on one line.
6. Apply discount amount.

Expected:
1. Totals recalculate correctly.
2. No console or UI error.
3. Terminal identity policy banner/warning behavior matches configured mode (`warn` vs `enforce`).

Evidence:
- Screenshot of cart before checkout

### 4.1A POS Scroll Behavior (Terminal + IMS Standalone)
1. In terminal workspace (`/terminal`) on desktop (`>=1536px`), verify `Scroll Zone: Catalog` and `Scroll Zone: Current Sale` badges are shown.
2. In terminal workspace, place cursor inside catalog pane and scroll down/up; verify only catalog pane moves.
3. In terminal workspace, place cursor inside current-sale pane and scroll down/up; verify only current-sale pane moves and sticky action footer remains visible.
4. In terminal workspace, click the catalog scroll area, then use keyboard: `ArrowUp/ArrowDown`, `PageUp/PageDown`, `Home/End`; verify pane scroll response is deterministic.
5. In IMS standalone POS (`/pos`) below `2xl`, verify badges switch to page-scrolling copy (`Scroll: Page (...)`) and page scroll remains functional.
6. In IMS standalone POS at `>=2xl`, verify split-pane scroll returns and pane-level scroll behavior matches terminal workspace.
7. In mobile drawer navigation, verify cashier menu remains scrollable and no misleading desktop-only scroll-zone badge is shown.

Expected:
1. Scroll badges match actual behavior by context (`pane` vs `page`).
2. No dead-zone where wheel/trackpad appears blocked.
3. Overflow fade cues appear only when additional content exists in that direction.
4. Keyboard scroll actions work when pane is focused.

Evidence:
- Screen recording: terminal split-pane scroll (`catalog` and `current sale`)
- Screenshot: standalone POS below `2xl` showing `Scroll: Page (...)`
- Screenshot: standalone POS at `>=2xl` showing split-pane zones
- Screen recording: focused keyboard scroll (`PageDown`, `Home`, `End`)

### 4.2 Checkout + Digital Receipt
1. Perform checkout (`Cash`, `Dine In`).
2. Open receipt preview.

Expected:
1. Invoice number generated.
2. Receipt header shows business/TIN/address/PTU/MIN/accreditation.
3. VAT totals show:
   - vatable sales
   - VAT amount
   - VAT exempt sales
   - zero-rated sales
4. Footer message displays when configured.

Evidence:
- Screenshot of receipt totals area
- Screenshot of compliance header fields

### 4.3 Stock Deduction Validation
1. Note stock values before checkout for sold items.
2. Complete checkout.
3. Verify stock values after checkout.

Expected:
1. Stock decreases by sold quantity.
2. No negative stock introduced.

Evidence:
- Before/after stock screenshots

### 4.4 POS History + Reprint
1. Switch to POS `History` mode.
2. Filter by invoice text, date range, payment type, order method.
3. Open a transaction from history.
4. Reopen receipt preview/print action.
5. Use `Open in Sales Report` from history/receipt context.

Expected:
1. Filters return expected records.
2. Selected history row matches receipt details and totals.
3. Reprint/review path works for historical transaction.
4. Sales page opens with matching filters/transaction context.

Evidence:
- Screenshot of filtered history
- Screenshot of opened historical receipt

### 4.5 Close Day / Z-Reading
1. Run `Close Day / Z-Reading`.
2. Compare transaction count and totals with same-day completed checkouts.

Expected:
1. Z-reading totals reconcile with POS transactions.

Evidence:
- Screenshot of Z-reading summary
- Screenshot/list of same-day transactions

## 5) Unified Sales UAT Scenarios

### 5.1 Unified Timeline and Source Tagging
1. Open Sales page.
2. Confirm both `POS` and `DISPATCH` rows appear (if both exist).
3. Filter by source/status/date/search.

Expected:
1. Source tags are correct.
2. Filters and sorting produce stable, expected results.

Evidence:
- Screenshot of mixed-source table

### 5.2 Sales Detail + Export
1. Open a POS row detail panel.
2. Verify VAT bucket values and gross/cogs/profit.
3. Export CSV with active filters.

Expected:
1. Detail panel values match selected row.
2. CSV downloads successfully and reflects current filter set.
3. Export feedback includes completion state and filter-aware filename/context.

Evidence:
- Screenshot of detail panel
- Exported CSV sample row

### 5.3 POS Channel Source-Separation Validation
1. In POS History, filter by `Source = In-Store`; confirm only in-store rows are listed.
2. In POS History, filter by `Source = Online Store`; confirm only online-store rows are listed.
3. Open Sales page and set `Source=POS` + `POS Channel=In-Store`; verify rows align with POS history in-store subset.
4. Repeat with `POS Channel=Online Store`; verify rows align with POS history online-store subset.
5. Export CSV for each channel filter and confirm `pos_order_source` column exists with expected values.

Expected:
1. No cross-source leakage in POS History source filter.
2. Sales channel filter matches POS history source truth.
3. CSV reconciliation remains auditable via `pos_order_source`.

Evidence:
- Screenshot of POS History (`In-Store` filtered)
- Screenshot of POS History (`Online Store` filtered)
- Screenshot of Sales (`POS In-Store` filtered)
- Screenshot of Sales (`POS Online Store` filtered)
- CSV sample rows showing `pos_order_source`

## 6) Fail Conditions (Automatic UAT Rejection)

1. Checkout succeeds for `compliant_pending`/`compliant_active` while required compliance setup fields remain blank.
2. Same-day transaction is missing when filtering `date_from == date_to`.
3. Receipt VAT totals differ from transaction snapshot.
4. Z-reading totals do not reconcile with same-day completed POS transactions.
5. Sales page action mutates source records (must remain read-only).

## 7) Signoff

- Cashier UAT result: PASS / FAIL  
  - Name:
  - Date:
  - Notes:

- Admin UAT result: PASS / FAIL  
  - Name:
  - Date:
  - Notes:

- Final POS E2E readiness: PASS / FAIL  
  - Release owner:
  - Date:
  - Blocking issues:
