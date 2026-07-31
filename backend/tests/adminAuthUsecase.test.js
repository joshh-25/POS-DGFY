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
    expect(result.data.admin).toEqual({
      username: 'skupervisor',
      financial_role: 'platform_admin'
    });
    const decoded = jwt.verify(result.data.token, 'test-secret');
    expect(decoded.username).toBe('skupervisor');
    expect(decoded.type).toBe('admin');
    expect(decoded.financial_role).toBe('platform_admin');
  });

  it('authenticates the matching account from a multi-admin finance roster', async () => {
    const preparerHash = bcrypt.hashSync('prepare-secret', 10);
    const approverHash = bcrypt.hashSync('approve-secret', 10);
    const useCase = buildUseCase({
      adminCredentialsProvider: () => ([
        {
          username: 'finance.preparer',
          passwordHash: preparerHash,
          financialRole: 'finance_preparer'
        },
        {
          username: 'finance.approver',
          passwordHash: approverHash,
          financialRole: 'finance_approver'
        }
      ])
    });

    const result = await useCase({
      username: 'finance.approver',
      password: 'approve-secret'
    });

    expect(result.success).toBe(true);
    expect(result.data.admin.financial_role).toBe('finance_approver');
    const decoded = jwt.verify(result.data.token, 'test-secret');
    expect(decoded.username).toBe('finance.approver');
    expect(decoded.financial_role).toBe('finance_approver');
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
