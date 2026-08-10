import { jest } from '@jest/globals';
import { buildAdminLogoutUseCase } from '../src/modules/adminAuth/usecases/adminLogoutUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('buildAdminLogoutUseCase', () => {
  it('returns validation failure when token is missing', async () => {
    const useCase = buildAdminLogoutUseCase({
      authService: { blacklistToken: jest.fn() }
    });

    const result = await useCase({ token: '' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
  });

  it('returns blacklisted state when revoke succeeds', async () => {
    const blacklistToken = jest.fn().mockResolvedValue(true);
    const useCase = buildAdminLogoutUseCase({
      authService: { blacklistToken }
    });

    const result = await useCase({ token: 'jwt-token' });

    expect(blacklistToken).toHaveBeenCalledWith('jwt-token');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ blacklisted: true });
  });

  it('returns internal error when revoke throws', async () => {
    const useCase = buildAdminLogoutUseCase({
      authService: {
        blacklistToken: jest.fn().mockRejectedValue(new Error('redis down'))
      }
    });

    const result = await useCase({ token: 'jwt-token' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.INTERNAL_ERROR);
  });
});
