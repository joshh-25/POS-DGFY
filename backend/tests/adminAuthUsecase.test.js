import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { buildAdminLoginUseCase } from '../src/modules/adminAuth/usecases/adminLoginUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('buildAdminLoginUseCase', () => {
  const passwordHash = bcrypt.hashSync('252378', 10);
  const buildUseCase = (overrides = {}) => buildAdminLoginUseCase({
    jwtSecretProvider: () => 'test-secret',
    adminCredentialsProvider: () => ({
      username: 'skupervisor',
      passwordHash
    }),
    ...overrides
  });

  it('returns validation failure when username/password are missing', async () => {
    const useCase = buildUseCase();

    const result = await useCase({ username: '', password: '' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('returns authentication failure on invalid credentials', async () => {
    const useCase = buildUseCase();

    const result = await useCase({ username: 'wrong', password: 'wrong' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    expect(result.error.statusCode).toBe(401);
  });

  it('returns signed token on valid credentials', async () => {
    const useCase = buildUseCase();

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

  it('does not reconcile the bootstrap database identity for an invalid password', async () => {
    const platformAdminRepository = {
      ensureBootstrapMaster: jest.fn(),
      findActiveByUsername: jest.fn()
    };
    const useCase = buildUseCase({ platformAdminRepository });

    const result = await useCase({
      username: 'skupervisor',
      password: 'wrong'
    });

    expect(result.success).toBe(false);
    expect(platformAdminRepository.ensureBootstrapMaster).not.toHaveBeenCalled();
    expect(platformAdminRepository.findActiveByUsername).not.toHaveBeenCalled();
  });

  it('returns internal error when token signing fails', async () => {
    const useCase = buildUseCase({
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

  it('returns lockout response after too many failed attempts for same identity', async () => {
    const lockoutPolicy = {
      check: jest.fn()
        .mockReturnValueOnce({ locked: false, retryAfterMs: 0 })
        .mockReturnValueOnce({ locked: true, retryAfterMs: 60000 }),
      registerFailure: jest.fn(),
      clear: jest.fn()
    };
    const useCase = buildUseCase({ lockoutPolicy });

    const first = await useCase({ username: 'skupervisor', password: 'wrong', sourceIp: '127.0.0.1' });
    const second = await useCase({ username: 'skupervisor', password: 'wrong', sourceIp: '127.0.0.1' });

    expect(first.success).toBe(false);
    expect(first.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    expect(lockoutPolicy.registerFailure).toHaveBeenCalledTimes(1);

    expect(second.success).toBe(false);
    expect(second.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    expect(second.error.statusCode).toBe(429);
    expect(second.error.details).toEqual({ retry_after_ms: 60000 });
  });
});
