import { jest } from '@jest/globals';
import {
  buildCreatePosSetupCashierUseCase,
  buildListPosSetupCashiersUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

describe('create POS setup cashier use case', () => {
  it('creates a local cashier through the user service', async () => {
    const createLocalCashier = jest.fn().mockResolvedValue({
      user_id: 15,
      username: 'Front Counter',
      email: 'cashier@example.com',
      role: 'cashier',
      location_ids: [3]
    });
    const useCase = buildCreatePosSetupCashierUseCase({
      userService: { createLocalCashier }
    });

    const result = await useCase({
      user: { user_id: 7 },
      payload: {
        username: 'Front Counter',
        email: 'cashier@example.com',
        phone_number: '+63 900 000 0000',
        password: 'cashier123',
        location_ids: [3]
      }
    });

    expect(result.success).toBe(true);
    expect(createLocalCashier).toHaveBeenCalledWith(7, {
      username: 'Front Counter',
      email: 'cashier@example.com',
      phone_number: '+63 900 000 0000',
      password: 'cashier123',
      location_ids: [3]
    });
    expect(result.data.cashier).toMatchObject({
      user_id: 15,
      role: 'cashier',
      location_ids: [3]
    });
  });

  it('fails without an authenticated user', async () => {
    const useCase = buildCreatePosSetupCashierUseCase({
      userService: { createLocalCashier: jest.fn() }
    });

    const result = await useCase({
      user: null,
      payload: {
        username: 'Front Counter',
        email: 'cashier@example.com',
        password: 'cashier123',
        location_ids: [3]
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(401);
  });
});

describe('list POS setup cashiers use case', () => {
  it('returns cashiers with their store grants', async () => {
    const listLocalCashiers = jest.fn().mockResolvedValue([
      { user_id: 15, username: 'Front Counter', role: 'cashier', location_ids: [3] }
    ]);
    const useCase = buildListPosSetupCashiersUseCase({
      userService: { listLocalCashiers }
    });

    const result = await useCase({ user: { user_id: 7 } });

    expect(result.success).toBe(true);
    expect(listLocalCashiers).toHaveBeenCalledWith(7);
    expect(result.data.cashiers).toEqual([
      expect.objectContaining({ user_id: 15, location_ids: [3] })
    ]);
  });
});
