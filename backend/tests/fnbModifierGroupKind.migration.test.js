import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../migrations/20260809000002-add-fnb-modifier-group-kind.cjs');

describe('F&B modifier group kind migration', () => {
  it('adds an additive legacy-safe modifier default', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({}),
      addColumn: jest.fn().mockResolvedValue(),
      removeColumn: jest.fn().mockResolvedValue()
    };
    await migration.up(queryInterface, { STRING: jest.fn(() => 'STRING') });
    expect(queryInterface.addColumn).toHaveBeenCalledWith('fnb_modifier_groups', 'group_kind', expect.objectContaining({ allowNull: false, defaultValue: 'modifier' }));
  });
});
