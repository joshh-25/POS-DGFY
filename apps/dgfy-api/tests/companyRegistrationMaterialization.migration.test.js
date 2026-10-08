import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260926000002-add-company-registration-materialization-state.cjs');

const Sequelize = {
  UUID: 'UUID',
  STRING: (length) => ({ type: 'STRING', length }),
  ENUM: (...values) => ({ type: 'ENUM', values }),
  JSON: 'JSON',
  DATE: 'DATE'
};

const buildQueryInterface = ({ existingColumns = null, existingIndexes = [] } = {}) => {
  let columns = existingColumns;
  const indexes = [...existingIndexes];
  const queryInterface = {
    describeTable: jest.fn(async () => {
      if (!columns) throw new Error('table does not exist');
      return columns;
    }),
    addColumn: jest.fn(async (_table, name, definition) => {
      columns[name] = definition;
    }),
    showIndex: jest.fn(async () => indexes),
    addIndex: jest.fn(async (_table, fields, options) => {
      indexes.push({ name: options.name, fields });
    }),
    removeIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined)
  };
  return queryInterface;
};

describe('company registration materialization migration', () => {
  it('adds retry state columns and indexes to an existing draft table', async () => {
    const queryInterface = buildQueryInterface({ existingColumns: { id: { type: 'UUID' } } });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenCalledTimes(6);
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(2);
    expect(queryInterface.addColumn.mock.calls.map(([, name]) => name)).toEqual(expect.arrayContaining([
      'materialization_status',
      'materialization_snapshot',
      'materialized_tenant_id',
      'materialized_application_id'
    ]));
  });

  it('is idempotent when all state columns and indexes already exist', async () => {
    const stateColumns = {
      id: { type: 'UUID' },
      materialization_status: {},
      materialization_error: {},
      materialization_snapshot: {},
      materialized_tenant_id: {},
      materialized_application_id: {},
      materialized_at: {}
    };
    const queryInterface = buildQueryInterface({
      existingColumns: stateColumns,
      existingIndexes: [
        { name: 'idx_registration_draft_materialized_tenant' },
        { name: 'idx_registration_draft_materialized_application' }
      ]
    });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });
});
