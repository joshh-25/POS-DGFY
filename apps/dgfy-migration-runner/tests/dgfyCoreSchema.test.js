import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { jest } from '@jest/globals';
import { Sequelize } from 'sequelize';

import { dgfyCoreContract } from '../src/schemaContracts/dgfyCoreContract.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_PATH = join(
  __dirname,
  '..',
  'src',
  'migrations',
  'schema',
  '20260710020000-create-dgfy-core-foundation.cjs'
);

const CORE_TABLE_NAMES = [
  'accounts',
  'businesses',
  'business_memberships',
  'business_database_registry',
  'business_audit_logs',
  'storefront_discovery_index'
];

// Indexes added onto an existing CORE_TABLE_NAMES table by a LATER migration
// (e.g. Phase 10's geo/full-text search indexes on storefront_discovery_index,
// added by 20260714101000-enable-storefront-discovery-geo-search.cjs) — this
// original foundation migration never requests them.
const INDEXES_ADDED_BY_LATER_MIGRATIONS = {
  storefront_discovery_index: ['idx_storefront_discovery_geo_spatial', 'ftx_storefront_discovery_search_text']
};

// This migration file (20260710020000) is Phase 02's foundation migration — it only
// ever creates CORE_TABLE_NAMES (with their original indexes). Later phases (e.g.
// Phase 10) add their own tables/indexes to dgfyCoreContract.tables via separate
// additive migrations, so tests about THIS migration's up()/down() must scope to
// CORE_TABLE_NAMES and their original indexes, not the full growing contract.
const CORE_CONTRACT_TABLES = Object.fromEntries(
  CORE_TABLE_NAMES.map((name) => {
    const table = dgfyCoreContract.tables[name];
    const laterIndexes = INDEXES_ADDED_BY_LATER_MIGRATIONS[name] || [];
    return [
      name,
      laterIndexes.length
        ? { ...table, indexes: table.indexes.filter((indexName) => !laterIndexes.includes(indexName)) }
        : table
    ];
  })
);

const OUT_OF_SCOPE_TABLE_NAMES = [
  'items',
  'products',
  'purchase_orders',
  'job_orders',
  'stock_movements',
  'pos_transactions',
  'promos',
  'promotions',
  'discounts',
  'fiscal_receipts',
  'branches',
  'locations'
];

describe('dgfyCoreContract', () => {
  test('D-01: exports databaseName dgfy_core', () => {
    expect(dgfyCoreContract.databaseName).toBe('dgfy_core');
  });

  test('D-06: includes all required core landlord tables', () => {
    CORE_TABLE_NAMES.forEach((name) => {
      expect(dgfyCoreContract.tables).toHaveProperty(name);
    });
  });

  test('D-05: no core table name is redundantly prefixed with dgfy_', () => {
    Object.keys(dgfyCoreContract.tables).forEach((name) => {
      expect(name.startsWith('dgfy_')).toBe(false);
    });
    dgfyCoreContract.rejectedTables.forEach((name) => {
      // rejected/out-of-scope names are also plain per D-05, but more
      // importantly must never collide with an in-scope core table name.
      expect(dgfyCoreContract.tables).not.toHaveProperty(name);
    });
  });

  test('D-08: business_database_registry stores database_name and stable_opaque_suffix', () => {
    const registry = dgfyCoreContract.tables.business_database_registry;
    expect(registry.columns).toEqual(
      expect.arrayContaining(['database_name', 'stable_opaque_suffix'])
    );
  });

  test('D-08: business_database_registry enforces uniqueness on suffix and database_name', () => {
    const registry = dgfyCoreContract.tables.business_database_registry;
    expect(registry.uniqueConstraints).toEqual(
      expect.arrayContaining([
        'unique_business_database_registry_suffix',
        'unique_business_database_registry_database_name'
      ])
    );
  });

  test('D-07: business_memberships supports role and status fields for owner/manager/member', () => {
    const memberships = dgfyCoreContract.tables.business_memberships;
    expect(memberships.columns).toEqual(expect.arrayContaining(['role', 'status']));
  });

  test('D-11/D-13: storefront_discovery_index is marked projection-only', () => {
    expect(dgfyCoreContract.tables.storefront_discovery_index.projectionOnly).toBe(true);
  });

  test('D-06/D-09: business_audit_logs supports minimal audit fields', () => {
    const auditLogs = dgfyCoreContract.tables.business_audit_logs;
    expect(auditLogs.columns).toEqual(
      expect.arrayContaining(['audit_log_id', 'business_id', 'account_id', 'action'])
    );
  });

  test('D-10/Pitfall 1: no canonical branches/locations table exists in dgfy_core, and both are rejected', () => {
    expect(dgfyCoreContract.tables).not.toHaveProperty('branches');
    expect(dgfyCoreContract.tables).not.toHaveProperty('locations');
    expect(dgfyCoreContract.rejectedTables).toEqual(
      expect.arrayContaining(['branches', 'locations'])
    );
  });

  test('D-15/ADR 0029: product/POS/inventory/fiscal/promo tables are absent and explicitly rejected', () => {
    OUT_OF_SCOPE_TABLE_NAMES.forEach((name) => {
      expect(dgfyCoreContract.tables).not.toHaveProperty(name);
      expect(dgfyCoreContract.rejectedTables).toContain(name);
    });
  });

  test('every table entry declares columns, indexes, and a projectionOnly flag', () => {
    Object.entries(dgfyCoreContract.tables).forEach(([name, table]) => {
      expect(Array.isArray(table.columns)).toBe(true);
      expect(table.columns.length).toBeGreaterThan(0);
      expect(Array.isArray(table.indexes)).toBe(true);
      expect(typeof table.projectionOnly).toBe('boolean');
      expect(name).toBe(name.toLowerCase());
    });
  });
});

describe('dgfy_core foundation migration (20260710020000-create-dgfy-core-foundation.cjs)', () => {
  let migration;
  let queryInterface;
  let createdTables;
  let createdIndexes;
  let createTableCalls;

  beforeEach(() => {
    delete require.cache[require.resolve(MIGRATION_PATH)];
    // eslint-disable-next-line global-require, import/no-dynamic-require
    migration = require(MIGRATION_PATH);

    createdTables = [];
    createdIndexes = [];
    createTableCalls = [];

    queryInterface = {
      showAllTables: jest.fn().mockResolvedValue([]),
      showIndex: jest.fn().mockResolvedValue([]),
      createTable: jest.fn().mockImplementation(async (name, columns) => {
        createdTables.push(name);
        createTableCalls.push({ name, columns });
      }),
      addIndex: jest.fn().mockImplementation(async (table, columns, options) => {
        createdIndexes.push({ table, columns, name: options?.name, unique: Boolean(options?.unique) });
      }),
      dropTable: jest.fn().mockResolvedValue(undefined)
    };
  });

  test('exports non-destructive meta describing the additive foundation migration', () => {
    expect(migration.meta).toBeDefined();
    expect(migration.meta.destructive).toBe(false);
    expect(typeof migration.meta.rollbackDescription).toBe('string');
  });

  test('up() uses QueryInterface with existence guards, not sequelize.sync', async () => {
    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.showAllTables).toHaveBeenCalled();
    expect(queryInterface.createTable).toHaveBeenCalled();
  });

  test('up() creates exactly the contract core tables and no out-of-scope tables', async () => {
    await migration.up(queryInterface, Sequelize);

    Object.keys(CORE_CONTRACT_TABLES).forEach((name) => {
      expect(createdTables).toContain(name);
    });
    expect(createdTables.sort()).toEqual(Object.keys(CORE_CONTRACT_TABLES).sort());

    dgfyCoreContract.rejectedTables.forEach((name) => {
      expect(createdTables).not.toContain(name);
    });
  });

  test('up() does not create canonical branches/locations tables; storefront_discovery_index is the only discovery table', async () => {
    await migration.up(queryInterface, Sequelize);

    expect(createdTables).not.toContain('branches');
    expect(createdTables).not.toContain('locations');
    expect(createdTables).toContain('storefront_discovery_index');
  });

  test('up() requests every index declared in the contract, matching unique flags', async () => {
    await migration.up(queryInterface, Sequelize);
    const byName = new Map(createdIndexes.map((entry) => [entry.name, entry]));

    Object.values(CORE_CONTRACT_TABLES).forEach((table) => {
      table.indexes.forEach((indexName) => {
        expect(byName.has(indexName)).toBe(true);
        const expectedUnique = table.uniqueConstraints.includes(indexName);
        expect(byName.get(indexName).unique).toBe(expectedUnique);
      });
    });
  });

  test('up() wires foreign keys declared in the contract onto the correct columns', async () => {
    await migration.up(queryInterface, Sequelize);
    const columnsByTable = new Map(createTableCalls.map((entry) => [entry.name, entry.columns]));

    Object.entries(CORE_CONTRACT_TABLES).forEach(([tableName, table]) => {
      table.foreignKeys.forEach((fk) => {
        const columnDef = columnsByTable.get(tableName)?.[fk.column];
        expect(columnDef).toBeDefined();
        expect(columnDef.references).toBeDefined();
        expect(columnDef.references.model).toBe(fk.referencesTable);
        expect(columnDef.references.key).toBe(fk.referencesColumn);
      });
    });
  });

  test('up() is idempotent: skips createTable/addIndex when tables and indexes already exist', async () => {
    const existingTableNames = Object.keys(dgfyCoreContract.tables);
    queryInterface.showAllTables.mockResolvedValue(existingTableNames);
    const allIndexNames = Object.values(dgfyCoreContract.tables).flatMap((table) => table.indexes);
    queryInterface.showIndex.mockResolvedValue(allIndexNames.map((name) => ({ name })));

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });

  test('down() drops every contract table', async () => {
    await migration.down(queryInterface, Sequelize);

    Object.keys(CORE_CONTRACT_TABLES).forEach((name) => {
      expect(queryInterface.dropTable).toHaveBeenCalledWith(name);
    });
  });
});
