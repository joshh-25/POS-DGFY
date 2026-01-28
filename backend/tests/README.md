# Backend Test Scripts

## Automated Testing (Jest)

The backend uses Jest for automated testing. Due to the project's use of native ES Modules (`type: "module"`), we use a specific configuration.

**How to run tests:**
```bash
npm test
```

**Configuration Details:**
- **Config File**: `jest.config.cjs`
- **Execution Mode**: Runs with `node --experimental-vm-modules` to support ESM natively.
- **Transform**: Babel transformation is explicitly disabled for `.js` files to allow native ESM execution.

### Understanding the Jest ESM Setup
The project uses **Native ES Modules** (defined by `"type": "module"` in package.json). Jest's default behavior is designed for CommonJS, so we use a specialized setup:

1. **`NODE_OPTIONS="--experimental-vm-modules"`**: This flag is passed in the NPM script to enable Jest's experimental ESM support.
2. **`jest.config.cjs`**: Note the `.cjs` extension. This forces the config file itself to be treated as CommonJS, which is required by Jest's runner.
3. **No Babel**: We explicitly disable code transformation because Node.js 18+ can run the ES modules natively. This avoids "import.meta" errors and simplifies debugging.

---


## Manual Verification Scripts

### FIFO Batch Notes Verification

**Script**: `manual_fifo_verification.js`

**Purpose**: Verifies that PO receipt notes are correctly saved to both Purchase Orders and FIFO batches.

**What it tests**:
1. Creates a test FIFO-enabled item
2. Creates a Purchase Order for that item
3. Receives the PO with notes: "Test Receipt Note"
4. Validates:
   - PO.notes === "Test Receipt Note"
   - FIFOBatch.notes === "Test Receipt Note"

**How to run**:
```bash
cd backend
node tests/manual_fifo_verification.js
```

**Expected output**:
```
--- Starting FIFO Verification ---
Creating Test Item...
Creating PO...
Receiving PO with Notes...
--- Verification Results ---
PO Notes: "Test Receipt Note"
PASS: PO Notes saved
Batches Found: 1
Batch Notes: "Test Receipt Note"
PASS: Batch Notes saved
```

**Exit code**: 0 on success, 1 on failure

**Prerequisites**:
- MySQL running on port 3306
- Database `sku_inventory_manager` exists
- Migration `20260107111700-add-notes-to-fifo-batches.js` applied
- At least one User and Supplier record in database

**Troubleshooting**:

| Error | Solution |
|-------|----------|
| "No user found" | Run `npm run seed` |
| "No supplier found" | Run `npm run seed` |
| "Column 'notes' doesn't exist" | Run `npx sequelize-cli db:migrate` |
| Lock wait timeout | Check for hanging transactions, restart MySQL if needed |

**Test data cleanup**:

The script creates test items with SKU starting with `TEST-FIFO-`. To clean up:

```sql
DELETE FROM fifo_batches WHERE item_id IN
  (SELECT item_id FROM items WHERE sku_code LIKE 'TEST-FIFO-%');
DELETE FROM stock_movements WHERE item_id IN
  (SELECT item_id FROM items WHERE sku_code LIKE 'TEST-FIFO-%');
DELETE FROM po_line_items WHERE item_id IN
  (SELECT item_id FROM items WHERE sku_code LIKE 'TEST-FIFO-%');
DELETE FROM items WHERE sku_code LIKE 'TEST-FIFO-%';
```

---

## Test Development Guidelines

When creating new verification scripts:

1. **Use transactions carefully**: Service functions create their own transactions
2. **Parameter naming**: Match service function expectations exactly
3. **Cleanup**: Comment out cleanup code to allow manual DB inspection
4. **Error handling**: Catch and log full error details
5. **Output format**: Use clear "PASS"/"FAIL" indicators
6. **Exit codes**: 0 for success, 1 for failure

---

## Bug Fixes Applied

### Issue 1: Missing Named Exports
**File**: `backend/src/models/index.js` (lines 164-190)
- Added named exports for all models including FIFOBatch
- Allows direct import of models in test scripts

### Issue 2: Product Type Validation
**File**: `backend/src/models/Item.js` (line 33)
- Updated validator to handle undefined values
- Changed `value !== null` to `value !== null && value !== undefined`
- Prevents validation errors when creating non-product items

### Issue 3: Verification Script Parameters
**File**: `backend/tests/manual_fifo_verification.js`
- Use `line_items` instead of `items`
- Use `quantity_ordered` instead of `quantity`
- Removed outer transaction to avoid conflicts with service transactions

---

## Related Documentation

- **DEVELOPMENT_HISTORY.md** - Phase 23: JO Notes & Batch Notes Feature
- **CLAUDE.md** - Item entity validation rules
- **spec-kit/DATABASE_SCHEMA.md** - FIFO batch notes column definition
