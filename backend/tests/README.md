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

### Schema Index Guard Test Pack (11.2 hardening)

**Purpose**: Verifies index-drift protections and canonical CSV folder filtering path.

**How to run only this pack**:
```bash
cd backend
npm test -- --runInBand --testPathPattern="tests/(schemaIndexAuditService|csvExportFolderFilter|healthSchemaIndexAudit|healthService|auditIndexesScript\\.integration)\\.test\\.js"
```

**Included suites**:
- `schemaIndexAuditService.test.js` — missing single/composite detection + tenant fallback behavior
- `csvExportFolderFilter.test.js` — ensures folder filtering uses `folder_id` path (never `product_folder`)
- `healthSchemaIndexAudit.test.js` — schema index health payload + degrade helper behavior
- `healthService.test.js` — `/health` response contract logic with `schemaIndexes` + `503` degradation
- `auditIndexesScript.integration.test.js` — script exit-code contract (`0` healthy, non-zero degraded)

**CI/runtime companion check**:
```bash
cd backend
npm run audit:indexes
```

### Runtime Schema Doctor Guard (startup drift prevention)

**Purpose**: Detect missing required migrations/columns before PM2 boot or manual UAT.

**How to run**:
```bash
cd backend
npm run doctor:runtime
```

**Included unit coverage**:
- `runtimeSchemaAuditService.test.js` — required migration/column checks, optional-column warnings, degraded/healthy status contract

---

### FIFO Drift Guard (inventory/POS stock consistency)

**Purpose**: Detect item-vs-batch stock drift before checkout-facing tests and manual UAT.

**How to run**:
```bash
cd backend
npm run audit:fifo-drift
# optional auto-repair for positive drift only
npm run audit:fifo-drift:repair
```

**What it validates**:
1. FIFO-enabled item `current_stock` matches open FIFO batch availability within tolerance.
2. No FIFO batch is over-consumed (`quantity_consumed > quantity`).
3. Coverage is tenant-aware (all active landlord tenants; `DB_NAME` fallback for local recovery mode).

---

### Role/Micro-Permission Drift Guard

**Purpose**: Prevent silent privilege drift across `cashier`, `po`, `do`, and `jo` roles.

**How to run**:
```bash
cd backend
npm test -- tests/permissionsRoleMatrix.test.js
```

**What it validates**:
1. Every supported role in `USER_ROLES` has default permissions configured.
2. Role permission sets contain only known permission keys and no duplicates.
3. Cashier remains restricted from admin/system mutation permissions.
4. PO/DO/JO write-domain scopes stay isolated (no cross-domain privilege leakage).

---

### PayPal Sandbox Canary Legacy Suite (`paypalSandboxCanary.e2e.legacy.test.js`)

**Purpose**: Optional legacy end-to-end canary that validates live PayPal sandbox subscription verification and payment lifecycle telemetry behavior.

**Default policy**:
1. Default backend test runs ignore `*.legacy.test.js`.
2. Legacy payment suites only run by explicit opt-in.

**How to run locally (opt-in)**:
```bash
cd backend
npm run test:legacy:payments
```

**Required environment variables**:
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_SANDBOX_ACTIVE_SUBSCRIPTION_ID`
- `PAYPAL_SANDBOX_NONACTIVE_SUBSCRIPTION_ID` (optional; if omitted, an invalid ID is used for the blocked-path assertion)
- `PAYPAL_STANDARD_PLAN_ID`
- `PAYPAL_PREMIUM_PLAN_ID` (or legacy `PAYPAL_PLAN_ID`)
- `PAYPAL_MODE=sandbox` (recommended; the test defaults to sandbox mode when unset)

**Behavior contract**:
- Local runs: test auto-skips if required sandbox variables are missing.
- Legacy suites are not part of default CI gates while payments are disabled.

**What it validates**:
1. OAuth token retrieval from PayPal sandbox.
2. Live subscription verification against sandbox APIs.
3. `/api/v1/payments/upgrade` accepts an ACTIVE subscription and rejects a non-active/invalid one.
4. `/api/v1/payments/migrate-to-paypal` persists PayPal migration state for a manual tenant and writes attempted+succeeded telemetry pairs.
5. `/api/v1/payments/reactivate-with-paypal` reactivates an inactive tenant and writes attempted+succeeded telemetry pairs.
6. Billing-funnel telemetry rows are persisted with the expected `event_type`, `source`, and `correlation_id` for each covered flow.

**What it does not validate**:
1. Real webhook delivery into `/api/v1/payments/webhook`.
2. Webhook signature verification through the HTTP ingress path.
3. Persistence of `paypal_payment_sale_completed`.
4. Product engagement, retention, or feature adoption.

See:
- `docs/testing/billing-funnel-telemetry-definition.md`
- `docs/testing/telemetry-event-catalog.md`

---

### Payment Disabled Contract Integration (`paymentLifecycle.integration.test.js`)

**Purpose**: Route-level integration that verifies disabled payment lifecycle routes return the canonical disabled contract (`503` + `PAYMENTS_DISABLED`) in default mode.

**How to run locally**:
```bash
cd backend
npm test -- paymentLifecycle.integration.test.js
```

**What it validates**:
1. `/api/v1/payments/migrate-to-paypal` returns `503` with `code=PAYMENTS_DISABLED`.
2. `/api/v1/payments/reactivate-with-paypal` returns `503` with `code=PAYMENTS_DISABLED`.
3. Default test suite behavior matches the current hard-disabled payment policy.

**Legacy note**:
- Provider-specific lifecycle and telemetry suites were moved to `.legacy.test.js` and are only run via `npm run test:legacy:payments`.

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
- `NODE_ENV=test` routes to `sku_test` database automatically (see `backend/src/config/database.js`)
- Rate limiter `skip()` returns `true` when `NODE_ENV === 'test'`
- `--runInBand` ensures sequential execution (avoids parallel DB state conflicts)

**Local preflight prerequisite**:
- Ensure the `sku_test` database exists before running integration suites that hit the landlord DB.
- Example:
```sql
CREATE DATABASE IF NOT EXISTS sku_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

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
