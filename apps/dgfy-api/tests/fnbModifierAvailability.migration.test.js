import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260809000001-add-fnb-modifier-availability.cjs');

const Sequelize = {
  BOOLEAN: 'BOOLEAN',
  INTEGER: 'INTEGER',
  DATE: 'DATE',
  fn: jest.fn((value) => value)
};

const buildQueryInterface = ({ columnsByTable = {}, tables = [] } = {}) => ({
  describeTable: jest.fn(async (table) => columnsByTable[table] || {}),
  showAllTables: jest.fn().mockResolvedValue(tables),
  addColumn: jest.fn().mockResolvedValue(undefined),
  createTable: jest.fn().mockResolvedValue(undefined),
  addIndex: jest.fn().mockResolvedValue(undefined),
  dropTable: jest.fn().mockResolvedValue(undefined),
  removeColumn: jest.fn().mockResolvedValue(undefined)
});

describe('F&B modifier availability migration', () => {
  it('adds backward-compatible channel fields and normalized location tables', async () => {
    const queryInterface = buildQueryInterface({
      columnsByTable: { fnb_modifier_groups: {}, fnb_modifier_options: {} },
      tables: ['fnb_modifier_groups', 'fnb_modifier_options', 'tenant_locations']
    });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenCalledTimes(5);
    expect(queryInterface.addColumn).toHaveBeenCalledWith('fnb_modifier_options', 'is_sold_out', expect.objectContaining({
      allowNull: false,
      defaultValue: false
    }));
    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'fnb_modifier_group_location_availability',
      expect.objectContaining({ modifier_group_id: expect.any(Object), location_id: expect.any(Object) }),
      {}
    );
    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'fnb_modifier_option_location_availability',
      expect.objectContaining({ modifier_option_id: expect.any(Object), is_sold_out: expect.any(Object) }),
      {}
    );
  });

  it('does not recreate fields or tables that already exist', async () => {
    const queryInterface = buildQueryInterface({
      columnsByTable: {
        fnb_modifier_groups: { visible_in_pos: {}, visible_in_storefront: {} },
        fnb_modifier_options: { visible_in_pos: {}, visible_in_storefront: {}, is_sold_out: {} }
      },
      tables: [
        'fnb_modifier_group_location_availability',
        'fnb_modifier_option_location_availability'
      ]
    });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).not.toHaveBeenCalled();
    expect(queryInterface.createTable).not.toHaveBeenCalled();
  });
});
