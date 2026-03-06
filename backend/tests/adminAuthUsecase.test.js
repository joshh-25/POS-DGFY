import jwt from 'jsonwebtoken';
import { buildAdminLoginUseCase } from '../src/modules/adminAuth/usecases/adminLoginUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('buildAdminLoginUseCase', () => {
  it('returns validation failure when username/password are missing', async () => {
    const useCase = buildAdminLoginUseCase({
      jwtSecretProvider: () => 'test-secret'
    });

    const result = await useCase({ username: '', password: '' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('returns authentication failure on invalid credentials', async () => {
    const useCase = buildAdminLoginUseCase({
      jwtSecretProvider: () => 'test-secret'
    });

    const result = await useCase({ username: 'wrong', password: 'wrong' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    expect(result.error.statusCode).toBe(401);
  });

  it('returns signed token on valid credentials', async () => {
    const useCase = buildAdminLoginUseCase({
      jwtSecretProvider: () => 'test-secret'
    });

    const result = await useCase({
      username: 'skupervisor',
      password: '252378'
    });

    expect(result.success).toBe(true);
    expect(result.data.admin).toEqual({ username: 'skupervisor' });
    const decoded = jwt.verify(result.data.token, 'test-secret');
    expect(decoded.username).toBe('skupervisor');
    expect(decoded.type).toBe('admin');
  });

  it('returns internal error when token signing fails', async () => {
    const useCase = buildAdminLoginUseCase({
      jwtSecretProvider: () => undefined
    });

    const result = await useCase({
      username: 'skupervisor',
      password: '252378'
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.INTERNAL_ERROR);
    expect(result.error.statusCode).toBe(500);
  });
});
