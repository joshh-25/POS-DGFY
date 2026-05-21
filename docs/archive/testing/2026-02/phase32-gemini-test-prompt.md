# Phase 32 — QA Test Prompt for Gemini
> Prepared by: Claude Sonnet 4.6 | Date: 2026-02-18
> Target: Antigravity Gemini 3 Pro (High)

---

## Your Role

You are a QA engineer performing **black-box end-to-end testing** of a web-based inventory management system called **SKUpervisor** running at `https://skupervisor.surebizcorp.com`.

You have been given login credentials and full access to the application UI. Your job is to verify that three specific production bugs have been correctly fixed. You must test each bug independently, record your exact observations, and render a verdict of **PASS**, **FAIL**, or **INCONCLUSIVE** for each.

**Do not assume a fix is working.** Treat every expected outcome as something that must be observed and confirmed. A test only passes when the actual result matches the expected result exactly.

---

## Credentials

Use the test account provided to you separately. You need:
- A company with at least one **product** item that has a recipe (ingredients)
- At least one **active Job Order** (status: In Progress) for that product
- Sufficient ingredient stock to complete the job order

If no suitable data exists, create it as part of the test setup (documented below).

---

## Test Suite

---

### TEST 1 — Ingredient Quantity Precision (Bug 1)

**What was broken:** Entering `1` as an ingredient quantity in the product recipe wizard and saving would cause the field to display `0.9999999999` on re-open. The value drifted further with each save-reload cycle.

**What was fixed:** Rounding applied at three points in the save/load pipeline.

---

#### Test 1A — Fresh product creation

**Setup:** Navigate to Items → create a new Product item. Use these exact values:
- Name: `QA Test Product [today's date]`
- Batch size: `300` (unit: g)
- Add one Raw Material ingredient
- Set ingredient quantity: `1`

**Steps:**
1. Complete all wizard steps and save the product (make it Active).
2. Find the newly created product in the Items list.
3. Click the three-dot menu → **Edit Product**.
4. Navigate to Step 2 (Recipe & Ingredients).
5. Observe the ingredient quantity field.

**Expected Result:** The quantity field displays exactly `1` (or `1.000000` — acceptable). It must NOT contain any digit sequence like `0.999`, `0.9999`, or any value that is not `1`.

**Record:**
- Actual displayed value: `___________`
- PASS / FAIL: `___________`

---

#### Test 1B — Save stability (no drift across repeated cycles)

**Continuing from Test 1A (product is open in Edit mode at Step 2):**

**Steps:**
1. Without changing anything, click through all steps and save the product again.
2. Re-open the product in Edit mode.
3. Navigate to Step 2. Record the quantity.
4. Save again without changes.
5. Re-open and navigate to Step 2. Record the quantity.
6. Repeat the save-and-reopen cycle **3 more times** (5 total cycles).

**Expected Result:** The quantity displays exactly `1` after every single cycle. If the value changes at any cycle, the test fails at that cycle.

**Record:**
| Cycle | Displayed Quantity | Pass/Fail |
|-------|--------------------|-----------|
| 1     |                    |           |
| 2     |                    |           |
| 3     |                    |           |
| 4     |                    |           |
| 5     |                    |           |

**Overall PASS / FAIL:** `___________`

---

#### Test 1C — Existing product with known drifted value (regression check)

**Setup:** Find the product "CALAMANSI PASTEURIZED" (or any existing product that previously showed `0.9999999999`).

**Steps:**
1. Open it in Edit mode → Step 2.
2. Observe current quantity value.
3. If it shows `0.9999...`, manually type `1` in the field, then save.
4. Re-open → Step 2. Observe.

**Expected Result:** After manually correcting and saving, the value stabilises at `1` and does not revert to `0.9999...` on re-open.

**Record:**
- Value before correction: `___________`
- Value after correction + re-open: `___________`
- PASS / FAIL: `___________`

---

### TEST 2 — Job Order Over-Production (Bug 2)

**What was broken:** Entering a quantity higher than the Job Order's target in the "Complete Production" dialog threw:
`Cannot produce X. Only Y remaining (Total: Y, Already Produced: 0).`

**What was fixed:** The upper-bound check was removed. Any positive quantity is now accepted. The JO correctly transitions to `completed` when total produced ≥ target.

---

#### Test 2A — Over-production on a fresh JO

**Setup:**
1. Ensure you have a Job Order in **In Progress** status with `quantity_produced = 0`.
2. Note its **Target Output** value (e.g., `24000 g`).
3. Ensure the ingredient stock is sufficient for at least 110% of the target.

**Steps:**
1. Navigate to Job Orders.
2. Open the target JO (click the eye icon or row).
3. Click **Complete Production**.
4. In the "Quantity Produced" field, enter a value **10% higher than the target** (e.g., if target is `24000`, enter `26400`).
5. Observe: does an error appear?
6. Click **Confirm** / **Complete**.
7. Observe the result.

**Expected Results:**
- No error toast or error message appears when entering the over-target value.
- The request succeeds (no 400 error in the network tab).
- The JO status changes to **Completed**.
- The product's stock increases by the quantity you entered (e.g., `+26400 g`), not the original target.

**Record:**
- Target output: `___________`
- Quantity entered: `___________`
- Error shown (yes/no): `___________`
- JO status after: `___________`
- Product stock change: `___________` (check item details or stock movements)
- PASS / FAIL: `___________`

---

#### Test 2B — Ingredient consumption is proportional for over-production

**Continuing from Test 2A:**

**Steps:**
1. Navigate to the product's ingredient item (e.g., Calamansi Fruit).
2. Open its Item Details → check **Current Stock** or **Stock Movements**.
3. Find the most recent movement of type `production_consumption` for this JO.
4. Record the quantity consumed.

**Expected Result:**
- Consumed quantity = `ingredient_quantity_required × (qty_produced / target_qty)`
- Example: If the recipe requires `80 kg` of ingredient for `24000 g` target, and you produced `26400 g`:
  - Ratio = 26400 / 24000 = **1.1**
  - Expected consumption = 80 × 1.1 = **88 kg**
- The consumed quantity must be **greater than the recipe's total requirement** — proportional to the over-production ratio.

**Record:**
- Recipe requirement for ingredient: `___________`
- Ratio (produced / target): `___________`
- Expected consumption: `___________`
- Actual consumption (from stock movement): `___________`
- PASS / FAIL: `___________`

---

#### Test 2C — UI: "Target" button and hint text

**Steps:**
1. Open any In Progress JO.
2. Click **Complete Production**.
3. Observe the button next to the quantity input.
4. Observe the hint text below the input.

**Expected Results:**
- The button is labelled **"Target"** (NOT "Max").
- The hint text reads something like: `Target: X g | Produced So Far: 0 | Over-production allowed`
- The amber/orange text "Over-production allowed" is visible.

**Record:**
- Button label: `___________`
- Hint text visible: `___________`
- "Over-production allowed" text visible (yes/no): `___________`
- PASS / FAIL: `___________`

---

#### Test 2D — Partial completion still works (regression)

**Setup:** Create or find a JO with a large target (e.g., `1000 g`). Ensure it has `quantity_produced = 0`.

**Steps:**
1. Open the JO → Complete Production.
2. Enter **half** the target (e.g., `500`).
3. Confirm.

**Expected Results:**
- No error.
- JO status becomes **Partial** (not Completed).
- `quantity_produced` = 500.
- Product stock increases by 500.

**Record:**
- Target: `___________`
- Quantity entered: `___________`
- JO status after: `___________`
- PASS / FAIL: `___________`

---

### TEST 3 — Inventory Value Calculation (Bug 3)

**What was broken:** The Inventory Value and `@ ₱X/unit` rate for product items were inflated 2–5× the correct value. The helper function `calculateTotalProductCost` was summing `cost_per_unit + labor_cost + overhead_cost + additional_packaging_cost + recipe_cost`, but `cost_per_unit` already contains all of those components.

**What was fixed:** `calculateTotalProductCost` now returns only `cost_per_unit`.

---

#### Test 3A — Verify the unit rate matches the wizard

**Setup:** Use the product "CALAMANSI PASTEURIZED" or any product whose `cost_per_unit` you can verify from the wizard.

**Steps to get the ground truth:**
1. Open the product in Edit mode → navigate to the **Cost & Financial** step (Step 3 or whichever step shows "Cost per Unit after yield adjustment").
2. Record the **Cost Per Unit** value shown in the wizard (e.g., `₱0.13/g`).
3. Close the wizard without saving.

**Steps to check the display:**
4. Open the product's Item Details (view mode, not edit).
5. Find the **Stock & Inventory** section.
6. Find the **Inventory Value** card.
7. Read the `@ ₱X/unit` rate shown below the inventory value amount.

**Expected Result:** The `@ ₱X/unit` rate in the details view must match the Cost Per Unit from the wizard **exactly** (within ±₱0.01 rounding tolerance).

**Record:**
- Cost Per Unit from wizard: `₱___________`
- Rate shown in item details (`@ ₱X/unit`): `₱___________`
- Difference: `₱___________`
- PASS / FAIL: `___________`

---

#### Test 3B — Verify inventory value arithmetic

**Continuing from Test 3A:**

**Steps:**
1. In the Item Details, record the **Current Stock** value (e.g., `60000 g`).
2. Record the **Inventory Value** shown (e.g., `₱7980.00`).
3. Manually compute: `Current Stock × (@ rate from Test 3A)`.

**Expected Result:** `Current Stock × unit_rate = Inventory Value` (within ±₱1.00 rounding tolerance for large values).

**Record:**
- Current Stock: `___________`
- Unit rate: `₱___________`
- Computed Inventory Value (`stock × rate`): `₱___________`
- Displayed Inventory Value: `₱___________`
- Difference: `₱___________`
- PASS / FAIL: `___________`

---

#### Test 3C — Check a second product (breadth check)

Repeat Tests 3A and 3B for a **different product** — ideally one with non-zero `labor_cost` or `overhead_cost` set (so the old bug would have been most visible).

**Record:**
- Product name: `___________`
- Cost Per Unit from wizard: `₱___________`
- Rate shown in item details: `₱___________`
- PASS / FAIL: `___________`

---

#### Test 3D — Cost breakdown section still shows correctly (regression)

**Steps:**
1. Open any product with labor/overhead costs set.
2. In the Item Details view, find the **Cost & Financial** accordion section (expand it).
3. Verify the individual breakdown rows (Ingredient Cost, Labor Cost, Overhead Cost, etc.) are still visible and show correct individual values.
4. Verify the breakdown section's **Total** or summary also looks correct.

**Expected Result:** Individual cost rows are still displayed and not broken. The fix should only affect the Inventory Value calculation — not the breakdown display.

**Record:**
- Individual rows still visible (yes/no): `___________`
- Values look reasonable (yes/no): `___________`
- PASS / FAIL: `___________`

---

## Summary Scorecard

| Test | Description | Result |
|------|-------------|--------|
| 1A | Fresh product — quantity shows exactly `1` | |
| 1B | 5-cycle save stability — no drift | |
| 1C | Existing drifted product self-corrects on save | |
| 2A | Over-production accepted, JO completes | |
| 2B | Ingredient consumption proportional (ratio > 1.0) | |
| 2C | "Target" button label + hint text visible | |
| 2D | Partial completion regression (JO → Partial) | |
| 3A | Unit rate in details matches wizard | |
| 3B | Inventory value arithmetic correct | |
| 3C | Second product verification | |
| 3D | Cost breakdown panel regression | |

**Overall verdict:** PASS / FAIL / INCONCLUSIVE

---

## What Counts as a Meaningful Test Result

A result is **meaningful** only if:

1. **You interacted with the actual running application** — not a mock, a unit test, or a local fixture. All tests must be performed against the live production URL or a staging environment running the deployed Phase 32 code.

2. **You observed real data changes** — for JO tests, verify the stock movement records and the item's actual current stock. For cost tests, verify the wizard value matches the display value using real product data. Do not infer correctness from UI text alone.

3. **You tested the failure mode** — for Bug 2, confirm the old error message no longer appears when entering an over-target quantity. For Bug 1, confirm the value is stable across multiple cycles (not just the first load). For Bug 3, confirm the arithmetic with actual numbers.

4. **Regression was explicitly checked** — partial JO completion (Test 2D) and the cost breakdown panel (Test 3D) must be verified to ensure the fixes did not break adjacent behaviour.

A test is **INCONCLUSIVE** if:
- You cannot access the application
- The product/JO data needed for the test does not exist and cannot be created
- The result is ambiguous (e.g., value shown is `1.000000` — acceptable; `0.9999999` — fail)

A test is **FAIL** if:
- The actual result does not match the expected result
- An error appears that should not appear
- A status change does not occur that should occur
- The arithmetic does not balance within tolerance

---

*End of test prompt. Return your completed scorecard and full observation notes.*
