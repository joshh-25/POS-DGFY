import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260926000001-create-company-registration-drafts-and-uploads.cjs');

const Sequelize = {
  UUID: 'UUID',
  STRING: (length) => ({ type: 'STRING', length }),
  ENUM: (...values) => ({ type: 'ENUM', values }),
  INTEGER: 'INTEGER',
  JSON: 'JSON',
  BIGINT: 'BIGINT',
  DATE: 'DATE',
  literal: (value) => ({ literal: value })
};

const buildQueryInterface = ({ existingTables = [], existingIndexes = [] } = {}) => {
  const tables = new Set(existingTables);
  return {
    describeTable: jest.fn(async (tableName) => {
      if (!tables.has(tableName)) throw new Error('table does not exist');
      return { id: { type: 'UUID' } };
    }),
    createTable: jest.fn(async (tableName) => {
      tables.add(tableName);
    }),
    showIndex: jest.fn().mockResolvedValue(existingIndexes),
    addIndex: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined)
  };
};

describe('company registration landlord migration', () => {
  it('creates the draft table without a tenant_id column', async () => {
    const queryInterface = buildQueryInterface();

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).toHaveBeenCalledTimes(1);
    expect(queryInterface.createTable.mock.calls[0][0]).toBe('company_registration_drafts');
    expect(queryInterface.createTable.mock.calls[0][1]).not.toHaveProperty('tenant_id');
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(2);
  });

  it('is idempotent when tables and indexes already exist', async () => {
    const queryInterface = buildQueryInterface({
      existingTables: ['company_registration_drafts'],
      existingIndexes: [
        { name: 'idx_registration_draft_owner_status' },
        { name: 'idx_registration_draft_owner_updated' }
      ]
    });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });

  it('drops only the draft table', async () => {
    const queryInterface = buildQueryInterface();

    await migration.down(queryInterface);

    expect(queryInterface.dropTable.mock.calls.map(([tableName]) => tableName)).toEqual([
      'company_registration_drafts'
    ]);
  });
});
