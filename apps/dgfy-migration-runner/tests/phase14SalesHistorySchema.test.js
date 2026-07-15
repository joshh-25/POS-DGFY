import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { jest } from '@jest/globals';
import { Sequelize } from 'sequelize';

import { dgfyBusinessContract } from '../src/schemaContracts/dgfyBusinessContract.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_PATH = join(
  __dirname,
  '..',
  'src',
  'migrations',
  'schema',
  '20260718000000-extend-schema-for-sales-history-migration.cjs'
);

// Task 2: apps/dgfy-api is a sibling package with its own node_modules
// (mysql2/sequelize) — resolved relative to each model file's own location
// by Node's ESM resolver, not by this test file's location.
const DGFY_API_ROOT = join(__dirname, '..', '..', 'dgfy-api');
const AVAILMENT_MODEL_PATH = join(DGFY_API_ROOT, 'src', 'models', 'Tenant', 'Availment.js');
const AVAILMENT_ITEM_MODEL_PATH = join(DGFY_API_ROOT, 'src', 'models', 'Tenant', 'AvailmentItem.js');

// Every live availment input/create/finalize/serializer surface a Phase 14
// field must never appear in (persistence-only, ADR 0029/D-14-09).
const LIVE_AVAILMENT_SOURCE_SURFACE_PATHS = [
  join(DGFY_API_ROOT, 'src', 'modules', 'availments', 'entities', 'availmentEntity.js'),
  join(DGFY_API_ROOT, 'src', 'modules', 'availments', 'controllers', 'availmentController.js'),
  join(DGFY_API_ROOT, 'src', 'modules', 'availments', 'usecases', 'availmentUseCases.js'),
  join(DGFY_API_ROOT, 'src', 'modules', 'availments', 'usecases', 'storefrontFinalizeUseCases.js'),
  join(DGFY_API_ROOT, 'src', 'modules', 'availments', 'repositories', 'availmentRepository.js')
];

const PHASE_14_FIELD_NAMES = ['source_system', 'legacy_snapshot', 'additional_fees'];

describe('Phase 14 Plan 01: dgfyBusinessContract sales-history persistence surface', () => {
  test('LDM-05/D-14-01/D-14-08/D-14-09: availments contract gains source_system/legacy_snapshot/additional_fees without removing any existing column', () => {
    const table = dgfyBusinessContract.tables.availments;
    expect(table.columns).toEqual(
      expect.arrayContaining(['source_system', 'legacy_snapshot', 'additional_fees'])
    );
    // Existing Phase 9/10/11 columns remain untouched.
    expect(table.columns).toEqual(
      expect.arrayContaining([
        'source_reference',
        'fulfillment_mode',
        'fulfillment_status',
        'fulfillment_stage'
      ])
    );
  });

  test('T-14-01-01: availments.source_reference and unique_availments_source_reference are unchanged by Phase 14', () => {
    const table = dgfyBusinessContract.tables.availments;
    expect(table.indexes).toContain('unique_availments_source_reference');
    expect(table.uniqueConstraints).toContain('unique_availments_source_reference');
    // Phase 14 adds no new unique constraint on availments (only availment_items).
    expect(table.uniqueConstraints).toEqual(['unique_availments_source_reference']);
  });

  test('SHM-04: availment_items is a full contract entry backfilled from the physical Phase 9 DDL plus Phase 14 provenance columns', () => {
    const table = dgfyBusinessContract.tables.availment_items;
    expect(table).toBeDefined();
    expect(table.columns).toEqual([
      'id',
      'business_id',
      'availment_id',
      'product_id',
      'product_name',
      'quantity',
      'unit_price',
      'stock_effect_type',
      'tax_treatment',
      'tax_rate',
      'cancelled_at',
      'source_system',
      'source_reference',
      'legacy_snapshot',
      'created_at',
      'updated_at'
    ]);
    expect(table.indexes).toEqual([
      'idx_availment_items_business_availment',
      'unique_availment_items_source_reference'
    ]);
    expect(table.uniqueConstraints).toEqual(['unique_availment_items_source_reference']);
    expect(table.foreignKeys).toEqual([
      { column: 'availment_id', referencesTable: 'availments', referencesColumn: 'id' },
      { column: 'product_id', referencesTable: 'products', referencesColumn: 'id' }
    ]);
    expect(table.projectionOnly).toBe(false);
  });

  test('D-15/ADR 0029: availment_items is not a rejected table name', () => {
    expect(dgfyBusinessContract.rejectedTables).not.toContain('availment_items');
  });
});

describe('Phase 14 Plan 01: sales-history schema migration (20260718000000-extend-schema-for-sales-history-migration.cjs)', () => {
  let migration;
  let queryInterface;
  let tableDescriptions;
  let addedColumns;
  let addedIndexes;
  let removedColumns;
  let removedIndexes;

  const resetDescriptions = () => {
    tableDescriptions = {
      availments: {},
      availment_items: {}
    };
  };

  beforeEach(() => {
    delete require.cache[require.resolve(MIGRATION_PATH)];
    // eslint-disable-next-line global-require, import/no-dynamic-require
    migration = require(MIGRATION_PATH);

    resetDescriptions();
    addedColumns = [];
    addedIndexes = [];
    removedColumns = [];
    removedIndexes = [];

    queryInterface = {
      describeTable: jest.fn().mockImplementation(async (tableName) => tableDescriptions[tableName] || {}),
      showIndex: jest.fn().mockResolvedValue([]),
      addColumn: jest.fn().mockImplementation(async (tableName, columnName, definition) => {
        addedColumns.push({ tableName, columnName, definition });
        tableDescriptions[tableName] = tableDescriptions[tableName] || {};
        tableDescriptions[tableName][columnName] = definition;
      }),
      addIndex: jest.fn().mockImplementation(async (tableName, columns, options) => {
        addedIndexes.push({ tableName, columns, name: options?.name, unique: Boolean(options?.unique) });
      }),
      removeColumn: jest.fn().mockImplementation(async (tableName, columnName) => {
        removedColumns.push({ tableName, columnName });
        if (tableDescriptions[tableName]) delete tableDescriptions[tableName][columnName];
      }),
      removeIndex: jest.fn().mockImplementation(async (tableName, indexName) => {
        removedIndexes.push({ tableName, indexName });
      })
    };
  });

  test('exports non-destructive meta with targetKind "business"', () => {
    expect(migration.meta).toBeDefined();
    expect(migration.meta.destructive).toBe(false);
    expect(migration.meta.targetKind).toBe('business');
    expect(typeof migration.meta.rollbackDescription).toBe('string');
    expect(migration.meta.rollbackDescription.length).toBeGreaterThan(0);
  });

  test('up() adds exactly the three nullable availments columns with the contracted types', async () => {
    await migration.up(queryInterface, Sequelize);

    const byColumn = new Map(
      addedColumns.filter((entry) => entry.tableName === 'availments').map((entry) => [entry.columnName, entry.definition])
    );

    expect(byColumn.has('source_system')).toBe(true);
    expect(byColumn.get('source_system').allowNull).toBe(true);
    expect(byColumn.get('source_system').type.toString()).toContain('VARCHAR(32)');

    expect(byColumn.has('legacy_snapshot')).toBe(true);
    expect(byColumn.get('legacy_snapshot').allowNull).toBe(true);
    expect(byColumn.get('legacy_snapshot').type).toBe(Sequelize.JSON);

    expect(byColumn.has('additional_fees')).toBe(true);
    expect(byColumn.get('additional_fees').allowNull).toBe(true);
    expect(byColumn.get('additional_fees').type).toBe(Sequelize.JSON);

    // Never touches availments.source_reference (added by a prior migration).
    expect(byColumn.has('source_reference')).toBe(false);
  });

  test('up() adds exactly the three nullable availment_items columns with the contracted types', async () => {
    await migration.up(queryInterface, Sequelize);

    const byColumn = new Map(
      addedColumns.filter((entry) => entry.tableName === 'availment_items').map((entry) => [entry.columnName, entry.definition])
    );

    expect(byColumn.has('source_system')).toBe(true);
    expect(byColumn.get('source_system').allowNull).toBe(true);
    expect(byColumn.get('source_system').type.toString()).toContain('VARCHAR(32)');

    expect(byColumn.has('source_reference')).toBe(true);
    expect(byColumn.get('source_reference').allowNull).toBe(true);
    expect(byColumn.get('source_reference').type.toString()).toContain('VARCHAR(64)');

    expect(byColumn.has('legacy_snapshot')).toBe(true);
    expect(byColumn.get('legacy_snapshot').allowNull).toBe(true);
    expect(byColumn.get('legacy_snapshot').type).toBe(Sequelize.JSON);
  });

  test('up() adds unique_availment_items_source_reference as a unique index on source_reference', async () => {
    await migration.up(queryInterface, Sequelize);

    const index = addedIndexes.find((entry) => entry.name === 'unique_availment_items_source_reference');
    expect(index).toBeDefined();
    expect(index.tableName).toBe('availment_items');
    expect(index.columns).toEqual(['source_reference']);
    expect(index.unique).toBe(true);
  });

  test('up() is idempotent: second run is a no-op when columns/index already exist', async () => {
    await migration.up(queryInterface, Sequelize);
    addedColumns.length = 0;
    addedIndexes.length = 0;
    queryInterface.showIndex.mockResolvedValue([{ name: 'unique_availment_items_source_reference' }]);

    await migration.up(queryInterface, Sequelize);

    expect(addedColumns).toEqual([]);
    expect(addedIndexes).toEqual([]);
  });

  test('down() removes only the six Phase 14 columns and the one Phase 14 index, in narrow reverse order', async () => {
    await migration.up(queryInterface, Sequelize);
    queryInterface.showIndex.mockResolvedValue([{ name: 'unique_availment_items_source_reference' }]);

    await migration.down(queryInterface, Sequelize);

    expect(removedIndexes).toEqual([
      { tableName: 'availment_items', indexName: 'unique_availment_items_source_reference' }
    ]);

    const removedByTable = removedColumns.reduce((acc, entry) => {
      acc[entry.tableName] = acc[entry.tableName] || [];
      acc[entry.tableName].push(entry.columnName);
      return acc;
    }, {});

    expect(removedByTable.availment_items).toEqual(['legacy_snapshot', 'source_reference', 'source_system']);
    expect(removedByTable.availments).toEqual(['additional_fees', 'legacy_snapshot', 'source_system']);
  });

  test('down() never removes availments.source_reference or unique_availments_source_reference', async () => {
    await migration.up(queryInterface, Sequelize);
    await migration.down(queryInterface, Sequelize);

    expect(
      removedColumns.some((entry) => entry.tableName === 'availments' && entry.columnName === 'source_reference')
    ).toBe(false);
    expect(removedIndexes.some((entry) => entry.indexName === 'unique_availments_source_reference')).toBe(false);
  });
});

describe('Phase 14 Plan 02: apps/dgfy-api tenant persistence model parity (Availment.js/AvailmentItem.js)', () => {
  let sequelize;
  let Availment;
  let AvailmentItem;

  beforeAll(async () => {
    // No live DB connection is opened — Model.init() only builds the
    // schema definition; mysql2 is present in apps/dgfy-api's own
    // node_modules so Sequelize's dialect resolution succeeds without a
    // connect() call.
    sequelize = new Sequelize('phase14_parity_check', 'user', 'pass', {
      dialect: 'mysql',
      logging: false
    });
    const { default: defineAvailment } = await import(`file://${AVAILMENT_MODEL_PATH}`);
    const { default: defineAvailmentItem } = await import(`file://${AVAILMENT_ITEM_MODEL_PATH}`);
    Availment = defineAvailment(sequelize);
    AvailmentItem = defineAvailmentItem(sequelize);
  });

  afterAll(async () => {
    if (sequelize) await sequelize.close();
  });

  test('Availment model declares source_system/legacy_snapshot/additional_fees with the exact migration-matching types, nullability, and physical field names', () => {
    const attrs = Availment.rawAttributes;

    expect(attrs.source_system).toBeDefined();
    expect(attrs.source_system.allowNull).toBe(true);
    expect(attrs.source_system.type.toString()).toContain('VARCHAR(32)');
    expect(attrs.source_system.field ?? 'source_system').toBe('source_system');

    expect(attrs.legacy_snapshot).toBeDefined();
    expect(attrs.legacy_snapshot.allowNull).toBe(true);
    expect(attrs.legacy_snapshot.type.constructor.name).toBe('JSONTYPE');
    expect(attrs.legacy_snapshot.field ?? 'legacy_snapshot').toBe('legacy_snapshot');

    expect(attrs.additional_fees).toBeDefined();
    expect(attrs.additional_fees.allowNull).toBe(true);
    expect(attrs.additional_fees.type.constructor.name).toBe('JSONTYPE');
    expect(attrs.additional_fees.field ?? 'additional_fees').toBe('additional_fees');
  });

  test('AvailmentItem model declares source_system/source_reference/legacy_snapshot with the exact migration-matching types, nullability, and physical field names', () => {
    const attrs = AvailmentItem.rawAttributes;

    expect(attrs.source_system).toBeDefined();
    expect(attrs.source_system.allowNull).toBe(true);
    expect(attrs.source_system.type.toString()).toContain('VARCHAR(32)');
    expect(attrs.source_system.field ?? 'source_system').toBe('source_system');

    expect(attrs.source_reference).toBeDefined();
    expect(attrs.source_reference.allowNull).toBe(true);
    expect(attrs.source_reference.type.toString()).toContain('VARCHAR(64)');
    expect(attrs.source_reference.field ?? 'source_reference').toBe('source_reference');

    expect(attrs.legacy_snapshot).toBeDefined();
    expect(attrs.legacy_snapshot.allowNull).toBe(true);
    expect(attrs.legacy_snapshot.type.constructor.name).toBe('JSONTYPE');
    expect(attrs.legacy_snapshot.field ?? 'legacy_snapshot').toBe('legacy_snapshot');
  });

  test('AvailmentItem model index options declare unique_availment_items_source_reference matching the contract/migration', () => {
    const indexes = AvailmentItem.options.indexes || [];
    const index = indexes.find((entry) => entry.name === 'unique_availment_items_source_reference');

    expect(index).toBeDefined();
    expect(index.unique).toBe(true);
    expect(index.fields).toEqual(['source_reference']);

    // Model index list matches the contract's index list exactly.
    const contractTable = dgfyBusinessContract.tables.availment_items;
    const modelIndexNames = indexes.map((entry) => entry.name).sort();
    expect(modelIndexNames).toEqual([...contractTable.indexes].sort());
  });

  test('Availment model attribute set matches the dgfyBusinessContract.availments column list (minus timestamps handled by Sequelize)', () => {
    const contractColumns = dgfyBusinessContract.tables.availments.columns;
    const modelColumns = Object.keys(Availment.rawAttributes);
    contractColumns.forEach((columnName) => {
      expect(modelColumns).toContain(columnName);
    });
  });

  test('AvailmentItem model attribute set matches the dgfyBusinessContract.availment_items column list', () => {
    const contractColumns = dgfyBusinessContract.tables.availment_items.columns;
    const modelColumns = Object.keys(AvailmentItem.rawAttributes);
    contractColumns.forEach((columnName) => {
      expect(modelColumns).toContain(columnName);
    });
  });
});

describe('Phase 14 Plan 02: source-surface guard — Phase 14 fields are absent from every live availment surface (ADR 0029/D-14-09)', () => {
  test('no live availment entity/controller/usecase/repository source file references source_system, legacy_snapshot, or additional_fees', () => {
    LIVE_AVAILMENT_SOURCE_SURFACE_PATHS.forEach((filePath) => {
      const contents = readFileSync(filePath, 'utf8');
      PHASE_14_FIELD_NAMES.forEach((fieldName) => {
        expect(contents).not.toContain(fieldName);
      });
    });
  });

  test('AvailmentEntity.toPlain() output never includes a Phase 14 field even when constructed with one (public response shape stays narrow)', async () => {
    const { AvailmentEntity } = await import(
      `file://${join(DGFY_API_ROOT, 'src', 'modules', 'availments', 'entities', 'availmentEntity.js')}`
    );
    const entity = new AvailmentEntity({
      id: 1,
      business_id: 'b1',
      source_system: 'legacy_migration',
      legacy_snapshot: { legacy_pos: {} },
      additional_fees: { service_fee_amount: '1.0000' }
    });
    const plain = entity.toPlain();

    PHASE_14_FIELD_NAMES.forEach((fieldName) => {
      expect(plain).not.toHaveProperty(fieldName);
    });
  });
});
