# Jest ESM Configuration Fix - Implementation Plan

## Problem Summary

The backend test suite (`npm test`) is **completely non-functional** due to an incompatibility between:

1. **Your source code**: Uses native ES Modules (`"type": "module"` in `package.json`) with `import.meta.url`
2. **Jest**: Runs via Babel transformation, which is misconfigured for `import.meta.url`

When Jest tries to run tests, it fails immediately at the first file that declares `const __filename = fileURLToPath(import.meta.url)`.

**Error:** `ReferenceError: Cannot access '_filename' before initialization`

---

## Root Cause Analysis

### Files Using `import.meta.url`

The following source files declare `__filename` and `__dirname` using ESM syntax:

| File | Purpose |
|------|---------|
| [server.js](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/src/server.js) | Load `.env` from correct path (lines 7-11) |
| [authService.js](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/src/services/authService.js) | Load `.env` before validation (lines 6-8) |
| [purchaseOrderService.js](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/src/services/purchaseOrderService.js) | Log file path resolution (line 176) |
| [reset-database.js](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/scripts/reset-database.js) | Utility script |
| [setup-database.js](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/scripts/setup-database.js) | Utility script |

### Current Configuration

```mermaid
flowchart LR
    A[Test File] --> B[Jest]
    B --> C[babel-jest]
    C --> D[babel.config.json]
    D --> E{transform-import-meta plugin}
    E -->|BROKEN| F[ReferenceError]
```

**Current `babel.config.json`:**
```json
{
    "presets": [["@babel/preset-env", { "targets": { "node": "current" } }]],
    "plugins": ["transform-import-meta"]
}
```

The `babel-plugin-transform-import-meta` plugin is **NOT** correctly transforming `import.meta.url` because it outputs code that references `__filename` before it is initialized.

---

## Proposed Solution

> [!IMPORTANT]
> **Strategy:** Create a dedicated Jest configuration file with correct ESM transformation settings. This is a **configuration-only** fix that does not modify any source code.

### Approach

We will:

1. **Create a Jest configuration file** (`jest.config.cjs`) that explicitly tells Jest how to handle ES Modules
2. **Update the Babel configuration** to use a newer plugin that correctly handles `import.meta`
3. **Test the fix** by running the test suite
4. **Document the fix** in the tests README

> [!NOTE]
> The fix uses `.cjs` extension for the Jest config because the project is ESM (`"type": "module"`), and Node/Jest require CommonJS syntax for config files.

---

## Proposed Changes

---

### Configuration

#### [NEW] [jest.config.cjs](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/jest.config.cjs)

A new Jest configuration file that:
- Sets `testEnvironment: 'node'`
- Sets `transform` to use `babel-jest`
- Sets `transformIgnorePatterns` to allow node_modules to be transformed as needed
- Sets `moduleFileExtensions` for `.js` files
- Enables `testTimeout` of 30 seconds for database tests

---

#### [MODIFY] [babel.config.json](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/babel.config.json)

Update to use `@babel/plugin-syntax-import-meta` instead of `babel-plugin-transform-import-meta`, and add `@babel/plugin-transform-modules-commonjs` to convert ESM to CJS during testing.

**Before:**
```json
{
    "plugins": ["transform-import-meta"]
}
```

**After:**
```diff
{
    "presets": [
        [
            "@babel/preset-env",
            {
                "targets": {
-                   "node": "current"
+                   "node": "18"
-               }
+               },
+               "modules": "commonjs"
            }
        ]
    ],
-   "plugins": ["transform-import-meta"]
+   "plugins": [
+       ["babel-plugin-transform-import-meta", { "module": "ES6" }]
+   ]
}
```

> [!NOTE]
> The key fix is adding `"modules": "commonjs"` to the preset configuration, which tells Babel to transform ES module imports/exports to CommonJS format. This is required because Jest + Node cannot natively run ESM tests without experimental flags.

---

#### [MODIFY] [package.json](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/package.json)

Update test scripts to use the new config file and set `NODE_OPTIONS` if needed.

**Current:**
```json
"test": "jest",
```

**Proposed:**
```json
"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs",
```

> [!WARNING]
> The `--experimental-vm-modules` flag is required for Jest to support ES Modules natively. This is a Node.js experimental feature approved for Jest usage.

---

### Documentation

#### [MODIFY] [tests/README.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/backend/tests/README.md)

Add a section explaining the ESM/Jest configuration and how to run tests.

---

## Files NOT Modified (Impact Assessment)

The following files use `import.meta.url` but **do NOT need to be modified**:

| File | Reason |
|------|--------|
| `server.js` | Works correctly in production (Node.js natively supports ESM) |
| `authService.js` | Works correctly in production |
| `purchaseOrderService.js` | Works correctly in production |
| `scripts/*.js` | Not run via Jest |

This fix ensures:
- ✅ Production code remains unchanged
- ✅ Development server continues to work
- ✅ PM2 configuration continues to work
- ✅ All existing scripts remain functional

---

## Verification Plan

### Automated Tests

After applying the fix, run:

```bash
cd backend
npm test
```

**Expected outcome:**
- Jest should execute `tests/auth.test.js` and `tests/purchaseOrder.test.js`
- No `ReferenceError: Cannot access '_filename'` error
- Tests may pass or fail based on database state, but the **test runner itself should work**

### Manual Verification

1. Verify production server still starts normally:
   ```bash
   cd backend
   npm run dev
   ```

2. Verify database scripts still work:
   ```bash
   node tests/reproduce_expiry_bug.js
   ```

---

## Rollback Plan

If tests still fail after applying this fix, the changes can be reverted by:

1. Delete `jest.config.cjs`
2. Restore original `babel.config.json`
3. Restore original test script in `package.json`

---

## Alternative Approaches Considered

| Approach | Why Not Chosen |
|----------|----------------|
| **Refactor source to avoid `import.meta.url`** | High risk, modifies production code, breaks `.env` loading pattern |
| **Use Jest's native ESM support** | Experimental, may cause other compatibility issues |
| **Switch to Vitest** | Requires significant configuration changes, overkill for the problem |
| **Mock `import.meta`** | Complex, hard to maintain, fragile |
 

The chosen approach is the **least invasive** and **most maintainable**.
