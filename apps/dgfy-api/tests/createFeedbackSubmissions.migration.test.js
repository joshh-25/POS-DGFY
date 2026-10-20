import { createRequire } from 'node:module';
import { jest } from '@jest/globals';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261020000001-create-feedback-submissions.cjs');
const type = (name) => (length) => `${name}(${length})`;
const Sequelize = {
  UUID: 'UUID', UUIDV4: 'UUIDV4', TEXT: 'TEXT', JSON: 'JSON', DATE: 'DATE', NOW: 'NOW',
  INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', STRING: type('STRING'), CHAR: type('CHAR'),
  ENUM: (...values) => values, literal: (value) => value
};

it('creates a landlord feedback table with stable ID, attribution and indexes once', async () => {
  const tables = [];
  const indexes = [];
  const queryInterface = {
    showAllTables: jest.fn(async () => tables),
    createTable: jest.fn(async (name) => { tables.push(name); }),
    showIndex: jest.fn(async () => indexes),
    addIndex: jest.fn(async (_table, fields, options) => { indexes.push({ fields, ...options }); }),
    dropTable: jest.fn(),
    sequelize: { getDialect: () => 'mysql', query: jest.fn() }
  };
  let columns;
  queryInterface.createTable.mockImplementation(async (name, definition) => {
    tables.push(name);
    columns = definition;
  });
  await migration.up(queryInterface, Sequelize);
  expect(columns.id.primaryKey).toBe(true);
  expect(columns.tenant_id.allowNull).toBe(true);
  expect(columns.correlation_id).toBeDefined();
  expect(columns.legacy_source_hash).toBeDefined();
  expect(columns.status.defaultValue).toBe('new');
  expect(indexes).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'idx_feedback_submissions_legacy_hash', unique: true, fields: ['legacy_source_hash'] }),
    expect.objectContaining({ name: 'idx_feedback_submissions_tenant_submitted', fields: ['tenant_id', 'submitted_at'] })
  ]));
  await migration.up(queryInterface, Sequelize);
  expect(queryInterface.createTable).toHaveBeenCalledTimes(1);
  await migration.down(queryInterface);
  expect(queryInterface.dropTable).toHaveBeenCalledWith('feedback_submissions');
});
