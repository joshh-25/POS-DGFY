import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
