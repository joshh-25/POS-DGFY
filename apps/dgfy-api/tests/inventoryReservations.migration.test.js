import { jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260821000002-create-inventory-reservations.cjs');

const Sequelize = {
  INTEGER: 'INTEGER',
  ENUM: (...values) => ({ type: 'ENUM', values }),
  DATE: 'DATE',
  STRING: (length) => ({ type: 'STRING', length }),
  DECIMAL: (precision, scale) => ({ type: 'DECIMAL', precision, scale }),
  JSON: 'JSON',
  literal: (value) => ({ literal: value })
};

describe('inventory reservation migration', () => {
  it('creates both tables and is safe to retry', async () => {
    const tables = [];
    const indexes = new Map();
    const queryInterface = {
      showAllTables: jest.fn(async () => [...tables]),
      createTable: jest.fn(async (name) => {
        tables.push(name);
        indexes.set(name, []);
      }),
      showIndex: jest.fn(async (name) => indexes.get(name) || []),
      addIndex: jest.fn(async (name, fields, options) => {
        indexes.get(name).push({ name: options.name, fields, unique: options.unique });
      }),
      dropTable: jest.fn(async (name) => {
        const index = tables.indexOf(name);
        if (index >= 0) tables.splice(index, 1);
      })
    };

    await migration.up(queryInterface, Sequelize);
    expect(tables).toEqual(['inventory_reservations', 'inventory_reservation_lines']);
    expect(queryInterface.createTable).toHaveBeenCalledTimes(2);
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(6);

    await migration.up(queryInterface, Sequelize);
    expect(queryInterface.createTable).toHaveBeenCalledTimes(2);
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(6);
  });
});
