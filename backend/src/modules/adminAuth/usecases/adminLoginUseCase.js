import jwt from 'jsonwebtoken';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const ADMIN_USERNAME = 'skupervisor';
const ADMIN_PASSWORD = '252378';

export const buildAdminLoginUseCase = ({ jwtSecretProvider }) => {
  return async ({ username, password }) => {
    if (!username || !password) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Username and password are required'
      ));
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return fail(new DomainError(
        DomainErrorCode.AUTHENTICATION_FAILED,
        'Invalid credentials'
      ));
    }

    try {
      const token = jwt.sign(
        {
          username: ADMIN_USERNAME,
          role: 'admin',
          type: 'admin'
        },
        jwtSecretProvider(),
        { expiresIn: '8h' }
      );

      return ok({
        token,
        admin: { username: ADMIN_USERNAME }
      });
    } catch (error) {
      return fail(new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        'Failed to issue admin token',
        { details: error?.message || null }
      ));
    }
  };
};
