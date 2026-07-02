import { describe, expect, it, jest } from '@jest/globals';
import {
  buildCreatePosSetupCashierUseCase,
  buildListPosSetupCashiersUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

describe('POS cashier setup DGFY migration', () => {
  it('retires local cashier creation while preserving cashier authorization-profile listing', async () => {
    const userService = {
      createLocalCashier: jest.fn().mockResolvedValue({
        user_id: 42,
        username: 'cashier-one',
        role: 'cashier'
      }),
      listLocalCashiers: jest.fn().mockResolvedValue([
        { user_id: 42, username: 'cashier-one', role: 'cashier' }
      ])
    };
    const createCashier = buildCreatePosSetupCashierUseCase({ userService });
    const listCashiers = buildListPosSetupCashiersUseCase({ userService });

    const createResult = await createCashier({
      payload: {
        username: 'cashier-one',
        email: 'cashier@example.test',
        phone_number: '+639000000001',
        password: 'cashier-secret',
        location_ids: [1]
      },
      user: { user_id: 7 }
    });
    const listResult = await listCashiers({ user: { user_id: 7 } });

    expect(userService.createLocalCashier).not.toHaveBeenCalled();
    expect(userService.listLocalCashiers).toHaveBeenCalledWith(7);
    expect(createResult).toMatchObject({ success: false, error: { statusCode: 410 } });
    expect(listResult).toMatchObject({
      success: true,
      data: { cashiers: [{ user_id: 42, role: 'cashier' }] }
    });
  });
});
