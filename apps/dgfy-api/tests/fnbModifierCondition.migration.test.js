import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260809000003-add-fnb-modifier-group-condition.cjs');

describe('F&B modifier condition migration', () => {
  it('adds a nullable parent option reference and index', async () => {
    const queryInterface = { describeTable: jest.fn().mockResolvedValue({}), addColumn: jest.fn(), addIndex: jest.fn().mockResolvedValue(), removeColumn: jest.fn() };
    await migration.up(queryInterface, { INTEGER: 'INTEGER' });
    expect(queryInterface.addColumn).toHaveBeenCalledWith('fnb_modifier_groups', 'parent_modifier_option_id', expect.objectContaining({ allowNull: true, onDelete: 'SET NULL' }));
    expect(queryInterface.addIndex).toHaveBeenCalled();
  });

  it('removes the conditional reference on rollback and can be applied again', async () => {
    const queryInterface = {
      describeTable: jest.fn()
        .mockResolvedValueOnce({ parent_modifier_option_id: {} })
        .mockResolvedValueOnce({}),
      addColumn: jest.fn(),
      addIndex: jest.fn().mockResolvedValue(),
      removeColumn: jest.fn()
    };

    await migration.down(queryInterface);
    await migration.up(queryInterface, { INTEGER: 'INTEGER' });

    expect(queryInterface.removeColumn).toHaveBeenCalledWith('fnb_modifier_groups', 'parent_modifier_option_id');
    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'fnb_modifier_groups',
      'parent_modifier_option_id',
      expect.objectContaining({ allowNull: true, onDelete: 'SET NULL' })
    );
  });

  it('does not swallow index creation failures', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({}),
      addColumn: jest.fn(),
      addIndex: jest.fn().mockRejectedValue(new Error('index creation failed'))
    };

    await expect(migration.up(queryInterface, { INTEGER: 'INTEGER' })).rejects.toThrow('index creation failed');
  });
});
