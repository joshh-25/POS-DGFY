# Phase 14: Sales History Migration & Full Verification - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 22 new/modified files (including one optional supporting-doc update)
**Analogs found:** 22 / 22 at the file/structural level

The Phase 13 product/inventory migration is the dominant analog. Its layering and
dependency ordering should be reused, but two current behaviors are known defects
for Phase 14: timestamp overwrite in `insertTargetRow()` and batch-wide finding
suppression after checkpoint completion. Those lines are evidence of where to
change behavior, not patterns to copy unchanged.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/dgfy-migration-runner/src/migrations/schema/20260718000000-extend-schema-for-sales-history-migration.cjs` | migration | schema transform | `src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs` and `20260714103000-add-availment-source-reference.cjs` | exact |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` | schema contract/config | schema verification | same file's `availments` entry | exact extension |
| `apps/dgfy-api/src/models/Tenant/Availment.js` | persistence model | CRUD persistence | same model's `source_reference`/fulfillment fields | exact extension |
| `apps/dgfy-api/src/models/Tenant/AvailmentItem.js` | persistence model | CRUD persistence | same model's FK/field/index declarations | exact extension |
| `apps/dgfy-migration-runner/src/data/mappings.js` | pure mapper/utility | transform | Phase 13 product, movement, and embedding mappers in same file | exact |
| `apps/dgfy-migration-runner/tests/fixtures/phase14/legacySalesRecords.js` | test fixture | transform input | `tests/fixtures/phase13/legacyProductRecords.js` | exact |
| `apps/dgfy-migration-runner/src/data/legacySource.js` | source adapter | full-table file-I/O/batch | `readLegacyProductSnapshot()` | exact |
| `apps/dgfy-migration-runner/src/data/dryRun.js` | orchestration service | batch transform/reporting | Phase 13 product planning in same file | exact, with sales dependency delta |
| `apps/dgfy-migration-runner/src/metadata/dataState.js` | metadata repository | CRUD | existing finding/checkpoint functions in same file | role-match; lifecycle must change |
| `apps/dgfy-migration-runner/src/data/apply.js` | orchestration service | dependency-ordered batch CRUD | Phase 13 product apply pipeline in same file | exact, with lifecycle fixes |
| `apps/dgfy-migration-runner/src/data/verifyData.js` | verification service | batch read/reconciliation | `buildProductReconciliation()` and per-target count checks | exact, with exact-money delta |
| `apps/dgfy-migration-runner/tests/phase14SalesHistorySchema.test.js` | schema test | schema transform | additive migration suites in `tests/dgfyBusinessSchema.test.js` | exact |
| `apps/dgfy-migration-runner/tests/dataSalesMappings.test.js` | unit test | transform | `tests/dataProductMappings.test.js` | exact |
| `apps/dgfy-migration-runner/tests/dataSalesSource.test.js` | adapter test | batch read | `tests/dataProductSource.test.js` | exact |
| `apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js` | orchestration test | batch transform/reporting | `tests/dataProductDryRun.test.js` | exact |
| `apps/dgfy-migration-runner/tests/dataSalesApply.test.js` | integration-style unit test | dependency-ordered batch CRUD | `tests/dataProductApply.test.js` | exact |
| `apps/dgfy-migration-runner/tests/dataSalesVerify.test.js` | verification test | reconciliation | `tests/dataProductVerify.test.js` | exact |
| `apps/dgfy-migration-runner/tests/dataMilestoneRehearsal.test.js` | ENV-gated integration test | dry-run/apply/retry/verify | `tests/dataProductRehearsal.test.js` | exact |
| `docs/database/dgfy-data-migration-map.md` | authoritative documentation | reference | same file's Phase 13 entity mappings and verification summary | exact extension |
| `docs/database/dgfy-foundation.md` | authoritative documentation | reference | same file's tenant schema and verification contract sections | exact extension |
| `docs/database/dgfy-migration-rehearsal.md` | authoritative runbook | operator workflow | same file's rehearsal steps/gates | exact extension |
| `docs/database/dgfy-migration-rehearsal-progressive.md` | supporting draft runbook (optional) | operator workflow | same file's Stage 2 and coverage-gap sections | exact extension |

## Pattern Assignments

### Additive schema migration, contract, and persistence models

**Files:**
- `apps/dgfy-migration-runner/src/migrations/schema/20260718000000-extend-schema-for-sales-history-migration.cjs`
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`
- `apps/dgfy-api/src/models/Tenant/Availment.js`
- `apps/dgfy-api/src/models/Tenant/AvailmentItem.js`
- `apps/dgfy-migration-runner/tests/phase14SalesHistorySchema.test.js`

**Primary analog:** `apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs`

**Guarded column/index pattern** (lines 86-98, 113-152):
```javascript
const hasIndex = async (tableName, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return (indexes || []).some((index) =>
      String(index.name).toLowerCase() === String(indexName).toLowerCase()
    );
  } catch {
    return false;
  }
};

const addIndexIfMissing = async (tableName, columns, options = {}) => {
  if (options.name && await hasIndex(tableName, options.name)) return;
  await queryInterface.addIndex(tableName, columns, options);
};

const productsDescription = await queryInterface.describeTable('products');
if (!productsDescription.attributes) {
  await queryInterface.addColumn('products', 'attributes', {
    type: Sequelize.JSON,
    allowNull: true
  });
}
```

Use this for nullable `availments.source_system`, `legacy_snapshot`, and
`additional_fees`, plus nullable `availment_items.source_system`,
`source_reference`, and `legacy_snapshot`. Re-describe each table before adding
its fields; add the line unique index through `addIndexIfMissing`.

**Provenance column and unique index analog:**
`apps/dgfy-migration-runner/src/migrations/schema/20260714103000-add-availment-source-reference.cjs:71-82`
```javascript
const availmentsDescription = await queryInterface.describeTable('availments');
if (!availmentsDescription.source_reference) {
  await queryInterface.addColumn('availments', 'source_reference', {
    type: Sequelize.STRING(64),
    allowNull: true
  });
}
await addIndexIfMissing('availments', ['source_reference'], {
  name: 'unique_availments_source_reference',
  unique: true
});
```

Mirror this for `availment_items.source_reference` and
`unique_availment_items_source_reference`. Down migration order must remove the
index before the column, following lines 94-126 of the same migration.

**Contract analog:**
`apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js:573-608`
```javascript
availments: {
  columns: [
    'id', 'business_id', 'branch_id', 'customer_account_id',
    'shift_id', 'terminal_id', 'cashier_account_id',
    'cashier_dgfy_account_id', 'status', 'document_context',
    'subtotal_amount', 'discount_amount', 'vat_amount',
    'vat_exempt_amount', 'total_amount', 'source_reference',
    'created_at', 'updated_at'
  ],
  indexes: ['idx_availments_business_status', 'unique_availments_source_reference'],
  uniqueConstraints: ['unique_availments_source_reference'],
  foreignKeys: [
    { column: 'branch_id', referencesTable: 'locations', referencesColumn: 'id' },
    { column: 'terminal_id', referencesTable: 'terminal_identities', referencesColumn: 'id' },
    { column: 'cashier_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
  ],
  projectionOnly: false
}
```

Extend this entry and add the missing `availment_items` contract using the
physical table definition and model FKs. Do not add an architecture allowlist.

**Model field/index analogs:**
- `apps/dgfy-api/src/models/Tenant/Availment.js:206-246` declares a nullable
  persistence field and mirrors its unique index in model options.
- `apps/dgfy-api/src/models/Tenant/AvailmentItem.js:33-103` declares typed
  persistence fields and same-database FKs; lines 104-114 declare table and
  index metadata.

Add persistence-only fields. Do not touch checkout inputs, repository create
payloads, public entity serialization, or receipt fee calculation.

**Schema test analog:** `apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js:379-489`

Copy the isolated `createRequire` migration load, mocked QueryInterface call
capture, contract equality assertions, non-destructive `meta` assertions,
column/index assertions, idempotent second-run assertions, and narrow `down()`
assertions. Phase 14 additionally needs `describeTable`, `showIndex`,
`addColumn`, `addIndex`, `removeIndex`, and `removeColumn` mocks.

---

### Header/line mappers, reason codes, fixtures, and mapping tests

**Files:**
- `apps/dgfy-migration-runner/src/data/mappings.js`
- `apps/dgfy-migration-runner/tests/fixtures/phase14/legacySalesRecords.js`
- `apps/dgfy-migration-runner/tests/dataSalesMappings.test.js`

**Analog:** `apps/dgfy-migration-runner/src/data/mappings.js:938-997`
```javascript
export function mapItemToProduct(legacyItem = {}, context = {}) {
  const {
    legacyTenantDbName = 'legacy_tenant',
    targetBusinessDbName = null,
    expectedBusinessId = null,
    resolvedFolderId = null
  } = context;
  const legacyIdMapKeyValue = legacyIdMapKey({
    legacySource: legacyTenantDbName,
    legacyTable: 'items',
    legacyId: legacyItem.item_id
  });

  return {
    operation: 'insert',
    entity_type: 'product',
    target_table: 'products',
    target_database: targetBusinessDbName,
    target_payload: { business_id: expectedBusinessId },
    legacy_id_map_key: legacyIdMapKeyValue,
    related_targets: [],
    findings: []
  };
}
```

Use one pure mapper for `pos_transactions -> availments` and one for
`pos_transaction_lines -> availment_items`. All database resolution remains in
dry-run/apply orchestration and arrives through mapper context.

**Skip/finding analog:** `apps/dgfy-migration-runner/src/data/mappings.js:1019-1055`
shows a source enum that either produces a structured lossy finding/skip or a
normal insert. Header location/terminal/cashier gaps differ: they remain
inserts with nullable attribution plus findings. Line parent/product gaps are
blocking skips because both target FKs are non-null.

**Reason/scope registry analog:** `apps/dgfy-migration-runner/src/data/mappings.js:38-74`

Add stable sale-location, sale-terminal, sale-cashier, availment-parent, and
sale-product reason codes. Remove `pos_transaction_lines` from
`OUT_OF_SCOPE_LEGACY_TABLES` and update the Phase 13-only comments.

**Test analog:** `apps/dgfy-migration-runner/tests/dataProductMappings.test.js:1-74,158-209`
```javascript
const result = mapItemFolderToProductFolder(fixture(), context());
expect(result.operation).toBe('insert');
expect(result.target_payload).toEqual(/* complete payload */);
expect(result.legacy_id_map_key).toEqual(/* complete source key */);
expect(result.findings).toEqual([]);
```

Use complete payload assertions for finalized and voided headers and normal
lines; table-driven tests for status/document-context mappings; explicit tests
for every attribution gap, both blocking line dependencies, namespaced natural
keys, timestamp preservation, `additional_fees`, and allowlisted snapshot
coverage. Fixture construction should follow
`tests/fixtures/phase13/legacyProductRecords.js`: factory functions with
overrides and one shared mapper-context factory.

---

### Legacy sales source reader and source test

**Files:**
- `apps/dgfy-migration-runner/src/data/legacySource.js`
- `apps/dgfy-migration-runner/tests/dataSalesSource.test.js`

**Analog:** `apps/dgfy-migration-runner/src/data/legacySource.js:176-238`
```javascript
export async function readLegacyProductSnapshot(tenantSequelize) {
  const [items] = await tenantSequelize.query('SELECT * FROM items');
  const [stockMovements] = await tenantSequelize.query('SELECT * FROM stock_movements');
  const [itemEmbeddings] = await tenantSequelize.query('SELECT * FROM item_embeddings');
  return { items, stockMovements, itemEmbeddings };
}
```

Add `readLegacySalesSnapshot()` with exactly two unpaginated reads:
`pos_transactions` and `pos_transaction_lines`. Return raw arrays; mapper
orchestration resolves parent/product relationships. This intentionally follows
D-14-06's full-scan contract and does not add a cursor/watermark.

**Test analog:** `apps/dgfy-migration-runner/tests/dataProductSource.test.js:10-37,39-95`

Use a query spy that recognizes only the expected table SQL, assert both arrays
verbatim, assert each query exactly once, and retain the existing source-file
guard against write SQL if present in the Phase 13 source test tail.

---

### Dry-run planning, safe reporting, and connection closure

**Files:**
- `apps/dgfy-migration-runner/src/data/dryRun.js`
- `apps/dgfy-migration-runner/tests/dataSalesDryRun.test.js`

**Dependency-order analog:**
`apps/dgfy-migration-runner/tests/dataProductDryRun.test.js:142-189` finds each
entity index and asserts folder < product < movements/embeddings. Phase 14
should assert product prerequisites < availment < availment_item.

On a clean target, represent valid header/product source dependencies as
planned/pending rather than reporting every line as an orphan. On a retry,
resolved `legacy_id_map` entries reclassify both headers and lines.

**Report redaction analog:** `apps/dgfy-migration-runner/src/data/dryRun.js:89-113`
```javascript
const redactedPayload = {};
Object.entries(targetPayload).forEach(([key, value]) => {
  if (key !== 'password_hash' && key !== 'pos_approval_pin_hash') {
    redactedPayload[key] = value;
  }
});
return { ...entry, target_payload: redactedPayload };
```

Extend this key walk so `legacy_snapshot` is never copied. Replace it with only
`has_legacy_snapshot` and sorted/top-level snapshot key names. Tests must seed
customer/payment/delivery sentinel strings and prove none survive serialized
dry-run output.

**Orchestrator analog:** `apps/dgfy-migration-runner/src/data/dryRun.js:490-530`
reads per-tenant snapshots, builds one plan, persists findings, summarizes, and
returns. Wrap landlord and every tenant connection in `try/finally` closure;
Phase 14 real-volume execution cannot leave one pool per tenant open.

---

### Current-state finding lifecycle

**Files:**
- `apps/dgfy-migration-runner/src/metadata/dataState.js`
- `apps/dgfy-migration-runner/src/data/apply.js`
- `apps/dgfy-migration-runner/tests/dataSalesApply.test.js`
- existing `apps/dgfy-migration-runner/tests/dataState.test.js` (extend rather than create a duplicate metadata test file)

**Existing structural analog:** `apps/dgfy-migration-runner/src/metadata/dataState.js:130-190`
contains the repository boundary for recording and resolving findings.

**Known defect, do not copy:**
`apps/dgfy-migration-runner/src/data/apply.js:385-419`
```javascript
await resolveDataQualityFindings(metaSequelize, {
  runScope,
  legacyTenantId,
  entityType: entry.entity_type,
  legacyTable: entry.legacy_id_map_key.legacy_table,
  legacyId: entry.legacy_id_map_key.legacy_id
});

if (!alreadyCompleted) {
  for (const finding of entry.findings || []) {
    await recordDataQualityFinding(/* ... */);
  }
}
```

Replace these semantics with reason-specific current-state synchronization:

1. Upsert/reopen each finding on the tuple `(run_scope, tenant, entity,
   legacy_table, legacy_id, reason_code)`.
2. Resolve only prior reasons absent from the current mapper result.
3. Process findings even when the batch checkpoint is already completed.
4. Deduplicate newly discovered rows after a completed full-scan checkpoint.

**Metadata test analog:** `apps/dgfy-migration-runner/tests/dataState.test.js:254-350`
already uses an in-memory QueryInterface fake and scopes assertions by run,
tenant, entity, table, and source ID. Extend it with repeated-open, reopen-after-
resolved, and resolve-one-reason-but-not-another cases.

---

### Dependency-ordered apply and timestamp preservation

**Files:**
- `apps/dgfy-migration-runner/src/data/apply.js`
- `apps/dgfy-migration-runner/tests/dataSalesApply.test.js`

**Target-first idempotency analog:** `apps/dgfy-migration-runner/src/data/apply.js:106-164,268-342`

Add entity target config for `availment` and `availment_item`, both using
`source_reference` as the natural key. Reuse the existing three-stage behavior:
durable map lookup, target natural-key reconciliation, then insert + map record.

**Timestamp defect to fix:** `apps/dgfy-migration-runner/src/data/apply.js:176-183`
```javascript
const row = {
  ...serializeTargetPayload(payload),
  created_at: new Date()
};
if (!APPEND_ONLY_TARGET_TABLES.has(table)) {
  row.updated_at = new Date();
}
```

Fill timestamps only when absent from mapper payload. Add regression assertions
that existing entity inserts still receive timestamps and that sales headers and
lines retain their historical `created_at`/`updated_at`.

**Ordering/FK lookup analog:** `apps/dgfy-migration-runner/src/data/apply.js:823-949`
applies parent entities first, then calls `findLegacyIdMap()` immediately before
mapping dependent rows. Apply all availments before lines. Each line resolves:

- `pos_transactions` map -> target `availment_id`
- `items` map -> target `product_id`
- Phase 13 product snapshot -> `product_name`

Do not insert a line if either required map is missing. Before sales apply,
assert completed product-folder/product/inventory-movement/product-embedding
checkpoints for that tenant.

**Apply test analog:** `apps/dgfy-migration-runner/tests/dataProductApply.test.js:222-350`
asserts dependency order, resolved target IDs rather than raw IDs, inserted
payloads, findings, and a second apply with no duplicate natural-key rows. Phase
14 must additionally cover persistent attribution findings on retry, a new row
arriving after checkpoint completion, target-first interruption recovery, and
connection closure on success and failure.

---

### Sales reconciliation and verification

**Files:**
- `apps/dgfy-migration-runner/src/data/verifyData.js`
- `apps/dgfy-migration-runner/tests/dataSalesVerify.test.js`

**Grouped SQL reconciliation analog:**
`apps/dgfy-migration-runner/src/data/verifyData.js:381-403`
```javascript
const [movementTypeRows] = await businessSequelize.query(`
  SELECT movement_type, SUM(quantity) AS total_quantity
  FROM inventory_movements
  GROUP BY movement_type
  ORDER BY movement_type
`);
return {
  movement_type_totals: summarizeMovementTypeTotals(movementTypeRows)
};
```

Use source and target grouped queries for header count/`total_amount` by mapped
status and source system, plus line counts. Add provenance coverage, valid
parent/product FK coverage, void fidelity, and map completeness for
`pos_transactions` and `pos_transaction_lines`.

**Per-target integration analog:**
`apps/dgfy-migration-runner/src/data/verifyData.js:426-566` opens scoped source
and target connections, reads in parallel, nets expected target counts against
deduplicated findings, checks maps/relationships/reconciliation, and folds all
booleans into the target verdict.

Do not reuse the file's current `Number()`-based quantity normalization for
money. The repository has no exact DECIMAL(14,4) helper; use the researched
`decimal4ToUnits()` BigInt parser and compare integer units.

**Test analog:** `apps/dgfy-migration-runner/tests/dataProductVerify.test.js:204-291`
asserts the full target verdict, grouped totals, duplicate-finding count
deduplication, and explicit mismatch failure. Add table-driven money strings
(`0`, `1.2`, `1.2345`, negative where valid), source/target mismatch cases,
void/status mismatches, provenance/FK gaps, and successful six-entity parity.

---

### Full milestone rehearsal

**File:** `apps/dgfy-migration-runner/tests/dataMilestoneRehearsal.test.js`

**Analog:** `apps/dgfy-migration-runner/tests/dataProductRehearsal.test.js:8-37,39-94,96-155`

Copy these patterns:

- opt in through a Phase 14-specific ENV flag;
- skip cleanly unless every required credential/manifest variable exists;
- validate/filter the explicit target manifest;
- use `try/finally` for evidence-query connections;
- run dry-run -> destructive apply -> retry apply -> verify;
- assert entity presence/order, first-run writes, zero retry inserts, zero
  blocking findings, and source/target evidence.

Expand the proof to all six roadmap entity types and exact sales totals. Runtime
selection must explicitly use the approved Docker context; never rely on the
operator's currently active context. The test can be committed in skipped state,
but VER-03 remains a human/operator gate until the real-volume manifest and
target reset are supplied.

---

### Authoritative and supporting documentation

**Files:**
- `docs/database/dgfy-data-migration-map.md`
- `docs/database/dgfy-foundation.md`
- `docs/database/dgfy-migration-rehearsal.md`
- optionally `docs/database/dgfy-migration-rehearsal-progressive.md`

**Self-analogs and insertion points:**

- `dgfy-data-migration-map.md:44-90` defines ID-map and finding conventions;
  add Phase 14 reason codes there and full header/line mapping sections before
  the exclusions. Lines 301-336 contain the stale Phase 14 exclusion and
  verification summary that must be updated.
- `dgfy-foundation.md:122-205` is the tenant schema section; document the
  additive columns/index and `availment_items` contract there. Lines 230-328
  contain the migration/verification contract and evidence commands.
- `dgfy-migration-rehearsal.md:90-164` is the canonical step/test flow; replace
  the stale claim that every missing membership blocks and add six-entity,
  exact-sales-sum, retry, and report-redaction evidence.
- `dgfy-migration-rehearsal-progressive.md:171-234` is the draft Stage 2 and
  known-coverage-gap section. Update it only as supporting operator guidance;
  it is not authority for architecture or acceptance decisions.

Preserve each document's frontmatter and refresh `last_reviewed` on documents
whose authoritative content changes. ADR 0029 already authorizes this path; no
new ADR is needed unless implementation expands into live checkout writes or a
new ownership boundary.

## Shared Patterns

### Pure mapping boundary

**Source:** `apps/dgfy-migration-runner/src/data/mappings.js:938-997`

Mappers accept source rows plus resolved context and return a plan entry. They
must not open Sequelize connections, query target models, or mutate source data.

### Parameterized SQL and durable ID maps

**Sources:**
- `apps/dgfy-migration-runner/src/data/apply.js:134-164`
- `apps/dgfy-migration-runner/src/data/apply.js:280-340`

Use `?` placeholders with `replacements`. Resolve every legacy FK-shaped value
through `findLegacyIdMap()`; never copy raw legacy IDs into tenant-local integer
FKs.

### Natural-key crash recovery

**Source:** `apps/dgfy-migration-runner/src/data/apply.js:296-342`

The durable map is the first guard, target natural key is the target-first crash
guard, and insert is the final path. Namespaced references prevent collisions
with organic/storefront availments.

### Report-safe sensitive data

**Source:** `apps/dgfy-migration-runner/src/data/dryRun.js:89-113`

Redaction occurs during report assembly while internal mapper/apply entries keep
the full payload. Phase 14 extends the denylist to the entire snapshot value and
only reports safe presence/key evidence.

### Connection ownership

**Source:** `apps/dgfy-migration-runner/tests/dataProductRehearsal.test.js:72-93`

The function that creates a connection owns closing it in `finally`. Apply this
to landlord, legacy tenant, business target, and evidence-query connections.

### Architecture boundary

This is a `within-existing-boundary` migration: legacy POS is read-only,
`dgfy_business_*` receives additive schema/data, and the runner owns
orchestration. No live checkout/POS write path or UI receives `additional_fees`
in this phase.

## No Exact Algorithm Analog

Every planned file has a structural analog, but these two algorithms do not:

| Concern | Destination | Required Source of Truth |
|---|---|---|
| Exact DECIMAL(14,4) comparison | `src/data/verifyData.js` | `14-RESEARCH.md` `decimal4ToUnits()` BigInt example; do not use `Number()` |
| Reason-specific current-state finding upsert/reopen | `src/metadata/dataState.js`, `src/data/apply.js` | `14-RESEARCH.md` Pattern 3; existing resolve-all/checkpoint suppression is the defect being replaced |

## Metadata

**Analog search scope:** `apps/dgfy-migration-runner/src`,
`apps/dgfy-migration-runner/tests`, `apps/dgfy-api/src/models/Tenant`, and
`docs/database`

**Primary analog set read:** schema extension/provenance migrations,
`mappings.js`, `legacySource.js`, `dryRun.js`, `apply.js`, `dataState.js`,
`verifyData.js`, target contract/models, Phase 13 product tests, and database
runbooks

**Pattern extraction date:** 2026-07-15
