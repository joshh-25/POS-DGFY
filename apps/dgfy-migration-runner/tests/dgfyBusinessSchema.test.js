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
  '20260710021000-create-dgfy-business-foundation.cjs'
);

const BUSINESS_TABLE_NAMES = [
  'locations',
  'staff_accounts',
  'account_staff_assignments',
  'roles',
  'role_permissions',
  'terminal_identities',
  'tenant_ownership_metadata',
  'tenant_audit_logs'
];

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
  'fiscal_receipts'
];

describe('dgfyBusinessContract', () => {
  test('D-02/D-03: exports the dgfy_business_<stable_opaque_suffix> naming pattern, not a literal database name', () => {
    expect(dgfyBusinessContract.databaseNamePattern).toBe('dgfy_business_<stable_opaque_suffix>');
  });

  test('D-14: includes all required tenant foundation tables', () => {
    BUSINESS_TABLE_NAMES.forEach((name) => {
      expect(dgfyBusinessContract.tables).toHaveProperty(name);
    });
  });

  test('D-05: no business table name is redundantly prefixed with dgfy_', () => {
    Object.keys(dgfyBusinessContract.tables).forEach((name) => {
      expect(name.startsWith('dgfy_')).toBe(false);
    });
    dgfyBusinessContract.rejectedTables.forEach((name) => {
      expect(dgfyBusinessContract.tables).not.toHaveProperty(name);
    });
  });

  test('D-10: locations is the canonical tenant-local table (not a projection)', () => {
    expect(dgfyBusinessContract.tables.locations.projectionOnly).toBe(false);
  });

  test('D-14: account_staff_assignments links a DGFY account (opaque UUID, no cross-db FK) to a local staff_account', () => {
    const table = dgfyBusinessContract.tables.account_staff_assignments;
    expect(table.columns).toEqual(expect.arrayContaining(['dgfy_account_id', 'staff_account_id', 'role', 'status']));
    expect(table.foreignKeys).toEqual([
      { column: 'staff_account_id', referencesTable: 'staff_accounts', referencesColumn: 'id' }
    ]);
    // dgfy_account_id must never be declared as a foreign key — it points at
    // dgfy_core.accounts.id in a different database.
    expect(table.foreignKeys.some((fk) => fk.column === 'dgfy_account_id')).toBe(false);
  });

  test('D-14: role_permissions enforces uniqueness on (role_id, permission_key)', () => {
    const table = dgfyBusinessContract.tables.role_permissions;
    expect(table.uniqueConstraints).toContain('unique_role_permissions_role_permission');
    expect(table.foreignKeys).toEqual([
      { column: 'role_id', referencesTable: 'roles', referencesColumn: 'id' }
    ]);
  });

  test('T-02-03-04: terminal_identities stores identity/status/policy foundation only, with a nullable location binding', () => {
    const table = dgfyBusinessContract.tables.terminal_identities;
    expect(table.columns).toEqual(
      expect.arrayContaining(['terminal_code', 'label', 'location_id', 'status', 'last_seen_at'])
    );
    expect(table.foreignKeys).toEqual([
      { column: 'location_id', referencesTable: 'locations', referencesColumn: 'id' }
    ]);
  });

  test('D-14: tenant_ownership_metadata links business_id/owner_dgfy_account_id as opaque UUIDs with no cross-db FK', () => {
    const table = dgfyBusinessContract.tables.tenant_ownership_metadata;
    expect(table.columns).toEqual(
      expect.arrayContaining(['business_id', 'business_handle', 'stable_opaque_suffix', 'owner_dgfy_account_id'])
    );
    expect(table.foreignKeys).toEqual([]);
    expect(table.uniqueConstraints).toContain('unique_tenant_ownership_metadata_business_id');
  });

  test('D-14: tenant_audit_logs supports minimal tenant-local audit fields', () => {
    const table = dgfyBusinessContract.tables.tenant_audit_logs;
    expect(table.columns).toEqual(
      expect.arrayContaining(['audit_log_id', 'actor_dgfy_account_id', 'staff_account_id', 'action'])
    );
  });

  test('D-15/ADR 0029: product/POS/inventory/fiscal/promo tables are absent and explicitly rejected', () => {
    OUT_OF_SCOPE_TABLE_NAMES.forEach((name) => {
      expect(dgfyBusinessContract.tables).not.toHaveProperty(name);
      expect(dgfyBusinessContract.rejectedTables).toContain(name);
    });
  });

  test('every table entry declares columns, indexes, and a projectionOnly flag', () => {
    Object.entries(dgfyBusinessContract.tables).forEach(([name, table]) => {
      expect(Array.isArray(table.columns)).toBe(true);
      expect(table.columns.length).toBeGreaterThan(0);
      expect(Array.isArray(table.indexes)).toBe(true);
      expect(typeof table.projectionOnly).toBe('boolean');
      expect(name).toBe(name.toLowerCase());
    });
  });
});

describe('dgfy_business foundation migration (20260710021000-create-dgfy-business-foundation.cjs)', () => {
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

  test('exports non-destructive meta with targetKind "business" (Plan 03 Task 2 scoping)', () => {
    expect(migration.meta).toBeDefined();
    expect(migration.meta.destructive).toBe(false);
    expect(migration.meta.targetKind).toBe('business');
    expect(typeof migration.meta.rollbackDescription).toBe('string');
  });

  test('up() uses QueryInterface with existence guards, not sequelize.sync', async () => {
    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.showAllTables).toHaveBeenCalled();
    expect(queryInterface.createTable).toHaveBeenCalled();
  });

  test('up() creates exactly the original foundation tenant tables and no out-of-scope tables', async () => {
    await migration.up(queryInterface, Sequelize);

    // Scoped to BUSINESS_TABLE_NAMES (this migration's own original table
    // set), NOT the full dgfyBusinessContract.tables key list — Wave 7
    // (04-07-PLAN.md) added a `staff_invitations` contract entry backed by a
    // SEPARATE additive migration (20260711143000-add-dgfy-business-staff-
    // invitations.cjs), so this historical foundation migration file is
    // correctly expected to NOT create it (see dgfyBusinessStaffInvitations
    // describe block below for that migration's own equivalent assertions).
    BUSINESS_TABLE_NAMES.forEach((name) => {
      expect(createdTables).toContain(name);
    });
    expect(createdTables.sort()).toEqual([...BUSINESS_TABLE_NAMES].sort());

    dgfyBusinessContract.rejectedTables.forEach((name) => {
      expect(createdTables).not.toContain(name);
    });
  });

  test('up() creates canonical locations (no operational product/POS/inventory/fiscal/promo table)', async () => {
    await migration.up(queryInterface, Sequelize);

    expect(createdTables).toContain('locations');
    OUT_OF_SCOPE_TABLE_NAMES.forEach((name) => {
      expect(createdTables).not.toContain(name);
    });
  });

  test('up() requests every index declared in the contract for tables this migration owns, matching unique flags', async () => {
    await migration.up(queryInterface, Sequelize);
    const byName = new Map(createdIndexes.map((entry) => [entry.name, entry]));

    // Scoped to BUSINESS_TABLE_NAMES — see the "creates exactly the original
    // foundation tenant tables" test above for why `staff_invitations` (a
    // separate, later additive migration) is excluded here.
    BUSINESS_TABLE_NAMES.forEach((name) => {
      const table = dgfyBusinessContract.tables[name];
      table.indexes.forEach((indexName) => {
        expect(byName.has(indexName)).toBe(true);
        const expectedUnique = table.uniqueConstraints.includes(indexName);
        expect(byName.get(indexName).unique).toBe(expectedUnique);
      });
    });
  });

  test('up() wires foreign keys declared in the contract onto the correct columns (for tables this migration owns)', async () => {
    await migration.up(queryInterface, Sequelize);
    const columnsByTable = new Map(createTableCalls.map((entry) => [entry.name, entry.columns]));

    // Scoped to BUSINESS_TABLE_NAMES — see the "creates exactly the original
    // foundation tenant tables" test above for why `staff_invitations` (a
    // separate, later additive migration) is excluded here.
    BUSINESS_TABLE_NAMES.forEach((tableName) => {
      const table = dgfyBusinessContract.tables[tableName];
      table.foreignKeys.forEach((fk) => {
        const columnDef = columnsByTable.get(tableName)?.[fk.column];
        expect(columnDef).toBeDefined();
        expect(columnDef.references).toBeDefined();
        expect(columnDef.references.model).toBe(fk.referencesTable);
        expect(columnDef.references.key).toBe(fk.referencesColumn);
      });
    });
  });

  test('up() never declares a references object on a cross-database opaque UUID column (dgfy_account_id, business_id, owner_dgfy_account_id, actor_dgfy_account_id)', async () => {
    await migration.up(queryInterface, Sequelize);
    const columnsByTable = new Map(createTableCalls.map((entry) => [entry.name, entry.columns]));

    const crossDbColumns = [
      ['account_staff_assignments', 'dgfy_account_id'],
      ['tenant_ownership_metadata', 'business_id'],
      ['tenant_ownership_metadata', 'owner_dgfy_account_id'],
      ['tenant_audit_logs', 'actor_dgfy_account_id']
    ];

    crossDbColumns.forEach(([tableName, columnName]) => {
      const columnDef = columnsByTable.get(tableName)?.[columnName];
      expect(columnDef).toBeDefined();
      expect(columnDef.references).toBeUndefined();
    });
  });

  test('up() is idempotent: skips createTable/addIndex when tables and indexes already exist', async () => {
    const existingTableNames = Object.keys(dgfyBusinessContract.tables);
    queryInterface.showAllTables.mockResolvedValue(existingTableNames);
    const allIndexNames = Object.values(dgfyBusinessContract.tables).flatMap((table) => table.indexes);
    queryInterface.showIndex.mockResolvedValue(allIndexNames.map((name) => ({ name })));

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });

  test('down() drops every original foundation table', async () => {
    await migration.down(queryInterface, Sequelize);

    // Scoped to BUSINESS_TABLE_NAMES — staff_invitations is dropped by its
    // own separate additive migration's down(), tested below.
    BUSINESS_TABLE_NAMES.forEach((name) => {
      expect(queryInterface.dropTable).toHaveBeenCalledWith(name);
    });
  });
});

describe('dgfy_business staff_invitations additive migration (20260711143000-add-dgfy-business-staff-invitations.cjs)', () => {
  const STAFF_INVITATIONS_MIGRATION_PATH = join(
    __dirname,
    '..',
    'src',
    'migrations',
    'schema',
    '20260711143000-add-dgfy-business-staff-invitations.cjs'
  );

  let migration;
  let queryInterface;
  let createdTables;
  let createdIndexes;
  let createTableCalls;

  beforeEach(() => {
    delete require.cache[require.resolve(STAFF_INVITATIONS_MIGRATION_PATH)];
    // eslint-disable-next-line global-require, import/no-dynamic-require
    migration = require(STAFF_INVITATIONS_MIGRATION_PATH);

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

  test('exports non-destructive meta with targetKind "business"', () => {
    expect(migration.meta).toBeDefined();
    expect(migration.meta.destructive).toBe(false);
    expect(migration.meta.targetKind).toBe('business');
    expect(typeof migration.meta.rollbackDescription).toBe('string');
  });

  test('up() creates staff_invitations with the contract columns/indexes/foreign key', async () => {
    await migration.up(queryInterface, Sequelize);

    expect(createdTables).toEqual(['staff_invitations']);
    const contractTable = dgfyBusinessContract.tables.staff_invitations;
    const columns = createTableCalls[0].columns;

    contractTable.columns.forEach((columnName) => {
      expect(columns).toHaveProperty(columnName);
    });

    // Never a raw token column — only token_hash (T-04-07-02).
    expect(columns).not.toHaveProperty('token');
    expect(columns.staff_account_id.references).toEqual({ model: 'staff_accounts', key: 'id' });

    const byName = new Map(createdIndexes.map((entry) => [entry.name, entry]));
    contractTable.indexes.forEach((indexName) => {
      expect(byName.has(indexName)).toBe(true);
      const expectedUnique = contractTable.uniqueConstraints.includes(indexName);
      expect(byName.get(indexName).unique).toBe(expectedUnique);
    });
  });

  test('up() is idempotent: skips createTable/addIndex when staff_invitations already exists', async () => {
    queryInterface.showAllTables.mockResolvedValue(['staff_invitations']);
    queryInterface.showIndex.mockResolvedValue(
      dgfyBusinessContract.tables.staff_invitations.indexes.map((name) => ({ name }))
    );

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });

  test('down() drops staff_invitations only', async () => {
    await migration.down(queryInterface, Sequelize);

    expect(queryInterface.dropTable).toHaveBeenCalledWith('staff_invitations');
    expect(queryInterface.dropTable).toHaveBeenCalledTimes(1);
  });
});
