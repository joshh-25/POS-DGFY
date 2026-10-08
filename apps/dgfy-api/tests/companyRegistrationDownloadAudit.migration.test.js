import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260926000003-create-company-registration-download-audits.cjs');

const Sequelize = {
  UUID: 'UUID',
  STRING: (length) => ({ type: 'STRING', length }),
  ENUM: (...values) => ({ type: 'ENUM', values }),
  INTEGER: 'INTEGER',
  JSON: 'JSON',
  DATE: 'DATE',
  literal: (value) => ({ literal: value })
};

const buildQueryInterface = ({ tables = [] } = {}) => {
  const indexes = [];
  const queryInterface = {
    showAllTables: jest.fn(async () => tables),
    showIndex: jest.fn(async () => indexes),
    createTable: jest.fn().mockResolvedValue(undefined),
    addIndex: jest.fn(async (_table, _fields, options) => indexes.push({ name: options.name })),
    removeIndex: jest.fn().mockResolvedValue(undefined),
    dropTable: jest.fn().mockResolvedValue(undefined),
    sequelize: { getDialect: () => 'mysql', query: jest.fn() }
  };
  return queryInterface;
};

describe('company registration download audit migration', () => {
  it('creates the landlord audit table and indexes idempotently by table existence', async () => {
    const queryInterface = buildQueryInterface();

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'company_registration_download_audits',
      expect.objectContaining({
        registration_draft_id: expect.any(Object),
        action: expect.objectContaining({
          type: expect.objectContaining({ type: 'ENUM', values: ['individual_download', 'archive_download'] })
        })
      })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(3);
  });

  it('does not recreate the audit table when it already exists', async () => {
    const queryInterface = buildQueryInterface({ tables: ['company_registration_download_audits'] });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(3);
  });
});
