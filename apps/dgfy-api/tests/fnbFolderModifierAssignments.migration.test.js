import { createRequire } from 'node:module';
import { jest } from '@jest/globals';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260810000003-create-fnb-folder-modifier-assignments.cjs');

describe('folder modifier assignment migration', () => {
  test('adds item exclusions, creates folder assignments, and is idempotent', async () => {
    const state = {
      columns: { fnb_item_modifier_groups: {}, fnb_folder_modifier_groups: {} },
      tables: []
    };
    const queryInterface = {
      describeTable: jest.fn(async (table) => state.columns[table] || null),
      addColumn: jest.fn(async (table, column) => { state.columns[table][column] = {}; }),
      showAllTables: jest.fn(async () => state.tables),
      createTable: jest.fn(async (table) => { state.tables.push(table); }),
      showIndex: jest.fn(async () => []),
      addIndex: jest.fn()
    };
    const Sequelize = { BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER', DATE: 'DATE', fn: jest.fn(() => 'NOW') };

    await migration.up(queryInterface, Sequelize);
    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenCalledWith('fnb_item_modifier_groups', 'is_excluded', expect.any(Object));
    expect(queryInterface.createTable).toHaveBeenCalledTimes(1);
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'fnb_folder_modifier_groups',
      ['folder_id', 'modifier_group_id'],
      expect.objectContaining({ unique: true, name: 'uq_fnb_folder_modifier_groups_folder_group' })
    );
  });
});
