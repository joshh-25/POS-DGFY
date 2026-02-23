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

---

## Automated Integration Tests (Jest)

### `lookup_v2.test.js` — Company Token Lookup (10/10 coverage)

**Purpose**: Full integration test for the `POST /api/v1/auth/lookup` endpoint, which maps a user's email to their company token so they can log in without memorizing it.

**How to run**:
```bash
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/lookup_v2.test.js
```

**What is tested (10 tests across 7 describe blocks)**:

| # | Test | What it proves |
|---|------|----------------|
| 1 | Happy path with status assertion | Registers a pending company; lookup returns correct token, name, and `status: 'pending'` (guards against rejected tenants leaking through) |
| 2 | 404 for unknown email | Emails with no mapping return `404`, not an error |
| 3 | Case normalization — UPPERCASE | `findTenantsByEmail` lowercases; UPPERCASE lookup returns the same token |
| 4 | Case normalization — mixed case | Alternating-case email is also normalized correctly |
| 5 | Multiple-tenant branch | Same email registered under two companies returns `multiple: true` with a `tenants[]` array of length 2, each with `id`, `name`, `company_token`, `status` |
| 6 | Rejected tenant excluded | After manually setting status to `'rejected'`, lookup returns `404` (excluded by `findTenantsByEmail` filter) |
| 7 | 422 — malformed email | Validator rejects non-email strings; `errors[]` contains `field: 'email'` |
| 8 | 422 — missing email field | Empty body returns 422 with errors array |
| 9 | 422 — email with spaces | Spaces in email are rejected |
| 10 | Rate limiter bypass documented | 6 consecutive lookups in `NODE_ENV=test` all return 404, none return 429 — confirming the test-env skip function works |

**Cleanup strategy**:
- `afterAll` uses `Op.like` pattern matching (`lookup-v2-test-%`) to sweep every mapping and tenant record this suite could have created — including orphans from mid-test failures.
- All test emails are namespaced under `EMAIL_PREFIX = 'lookup-v2-test-'` plus a `Date.now()` timestamp to prevent cross-run collisions.

**Infrastructure notes**:
- `NODE_ENV=test` routes to `sku_inventory_manager_test` database automatically
- Rate limiter `skip()` returns `true` when `NODE_ENV === 'test'`
- `--runInBand` ensures sequential execution (avoids parallel DB state conflicts)

---

---

### `token_refresh_race.test.js` — Token Refresh Race Condition Unit Tests (4/4)

**Purpose**: Unit tests for the `POST /api/v1/auth/refresh-token` endpoint with mocked Redis. Verifies the HTTP-layer behaviour of the refresh endpoint in isolation.

**How to run**:
```bash
cd backend
npm test -- --testPathPattern=token_refresh_race.test
```

**What is tested (4 tests)**:

| # | Test | What it proves |
|---|------|----------------|
| 1.1 | Valid refresh token → new token pair | Happy path: correct JWT structure (`token`, `refreshToken`, `expiresIn: 86400`) |
| 1.2 | Expired/invalid token → 401 | Backend correctly rejects bad tokens with `success: false` |
| 1.3 | Missing token body → 422 | Validator rejects missing `refreshToken` field |
| 1.4 | Blacklist after use (mocked Redis) | Used token is blacklisted; second use returns 401 |

**Infrastructure notes**:
- Redis is mocked via `setup.js` (always returns `null` on `get`) — no real Redis required
- Tests register and login a real user against the test database

---

### `token_refresh_race_integration.test.js` — Token Refresh Race Condition Integration Tests (2/2)

**Purpose**: Integration tests using **real Redis**. Verifies actual blacklisting behaviour end-to-end. The `TEST_TYPE=integration` env variable causes `jest.config.cjs` to skip `setup.js`, so the Redis mock is NOT active.

**How to run**:
```bash
cd backend
npm run test:integration
# Requires: Redis running on localhost:6379
```

**What is tested (2 tests)**:

| # | Test | What it proves |
|---|------|----------------|
| 1.5 | Concurrent refresh calls — no 5xx | Without a distributed lock (Redlock), all concurrent requests pass the blacklist check before any write completes. No server crashes. Each 200 response has valid JWT structure. **The frontend mutex is load-bearing security.** |
| 1.6 | Sequential RTR — used token blacklisted | `rt1 → rt2` succeeds; reusing `rt1` returns 401 |

**Key design decisions**:
- `beforeEach` waits 1100ms so `generateRefreshToken`'s `iat` (second-precision) is unique per test, preventing token collisions across tests
- Blacklist assertion is done via HTTP reuse (not `isTokenBlacklisted()` directly) because `AsyncLocalStorage` tenant scoping produces different Redis key prefixes inside vs. outside request context
- `--forceExit` prevents Jest from hanging after Redis connection stays open

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
