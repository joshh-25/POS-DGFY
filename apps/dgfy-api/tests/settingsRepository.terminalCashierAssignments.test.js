import { describe, expect, it, jest } from '@jest/globals';
import { settingsRepository } from '../src/modules/settings/repositories/settingsRepository.js';
import dbStore from '../src/utils/dbStore.js';

describe('settings repository terminal cashier assignment validation', () => {
  it('returns only IDs that are not active cashiers with a grant for the terminal location', async () => {
    const userFindAll = jest.fn().mockResolvedValue([{ user_id: 21 }]);
    const grantFindAll = jest.fn().mockResolvedValue([{ user_id: 21, location_id: 7 }]);

    const invalidAssignments = await dbStore.run({
      User: { findAll: userFindAll },
      UserLocationGrant: { findAll: grantFindAll }
    }, () => settingsRepository.getInvalidTerminalCashierAssignments([
      {
        terminal_id: 'counter-01',
        location_id: 7,
        cashier_user_ids: [21, 22]
      }
    ]));

    expect(invalidAssignments).toEqual([
      { terminal_id: 'COUNTER-01', location_id: 7, cashier_user_ids: [22] }
    ]);
    expect(userFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        role: 'cashier',
        is_active: true,
        deleted_at: null
      }),
      attributes: ['user_id']
    }));
    expect(grantFindAll).toHaveBeenCalledWith(expect.objectContaining({
      attributes: ['user_id', 'location_id']
    }));
  });

  it('rejects every explicit assignment when the terminal has no location', async () => {
    const invalidAssignments = await dbStore.run({
      User: { findAll: jest.fn() },
      UserLocationGrant: { findAll: jest.fn() }
    }, () => settingsRepository.getInvalidTerminalCashierAssignments([
      { terminal_id: 'COUNTER-01', location_id: null, cashier_user_ids: [21] }
    ]));

    expect(invalidAssignments).toEqual([
      { terminal_id: 'COUNTER-01', location_id: null, cashier_user_ids: [21] }
    ]);
  });

  it('keeps the legacy location-grant fallback when no explicit assignments are present', async () => {
    const userFindAll = jest.fn();
    const grantFindAll = jest.fn();

    const invalidAssignments = await dbStore.run({
      User: { findAll: userFindAll },
      UserLocationGrant: { findAll: grantFindAll }
    }, () => settingsRepository.getInvalidTerminalCashierAssignments([
      { terminal_id: 'COUNTER-01', location_id: 7, cashier_user_ids: [] },
      { terminal_id: 'COUNTER-02', location_id: 7 }
    ]));

    expect(invalidAssignments).toEqual([]);
    expect(userFindAll).not.toHaveBeenCalled();
    expect(grantFindAll).not.toHaveBeenCalled();
  });
});
