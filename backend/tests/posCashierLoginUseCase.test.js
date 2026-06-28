import { describe, expect, it, jest } from '@jest/globals';
import { buildLoginPosCashierUseCase } from '../src/modules/pos/usecases/posUseCases.js';

describe('POS cashier login use case', () => {
  it('allows a cashier username or email within the resolved tenant', async () => {
    const loginUser = jest.fn().mockResolvedValue({
      user_id: 15,
      username: 'john',
      email: 'john@example.com',
      role: 'cashier',
      token: 'access-token',
      refreshToken: 'refresh-token'
    });
    const useCase = buildLoginPosCashierUseCase({ authService: { loginUser } });

    const result = await useCase({
      payload: { identifier: 'john', password: 'cashier123' }
    });

    expect(result.success).toBe(true);
    expect(loginUser).toHaveBeenCalledWith('john', 'cashier123', {
      allowUsername: true,
      requiredRole: 'cashier'
    });
  });

  it('returns the authentication failure from the auth service', async () => {
    const error = Object.assign(new Error('Invalid username/email or password'), { statusCode: 401 });
    const useCase = buildLoginPosCashierUseCase({
      authService: { loginUser: jest.fn().mockRejectedValue(error) }
    });

    const result = await useCase({
      payload: { identifier: 'admin', password: 'wrong-account' }
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(401);
  });
});
