import { describe, expect, it, jest } from '@jest/globals';
import { buildLoginPosCashierUseCase } from '../src/modules/pos/usecases/posUseCases.js';

describe('POS cashier identity adoption decision', () => {
  it('logs in a tenant-local cashier with username support and cashier role enforcement', async () => {
    const authService = {
      loginUser: jest.fn().mockResolvedValue({
        user: { user_id: 42, username: 'cashier-one', role: 'cashier' },
        token: 'access-token',
        refreshToken: 'refresh-token'
      })
    };
    const loginCashier = buildLoginPosCashierUseCase({ authService });

    const result = await loginCashier({
      payload: {
        identifier: 'cashier-one',
        password: 'cashier-secret'
      }
    });

    expect(authService.loginUser).toHaveBeenCalledWith(
      'cashier-one',
      'cashier-secret',
      { allowUsername: true, requiredRole: 'cashier' }
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        user: { user_id: 42, role: 'cashier' },
        token: 'access-token',
        refreshToken: 'refresh-token'
      }
    });
  });
});
