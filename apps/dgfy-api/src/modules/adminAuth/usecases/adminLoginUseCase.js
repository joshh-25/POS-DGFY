import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { getAdminCredentials } from '../../../config/adminAuthConfig.js';

export const buildAdminLoginUseCase = ({
  jwtSecretProvider,
  adminCredentialsProvider = getAdminCredentials,
  lockoutPolicy = null
}) => {
  return async ({ username, password, sourceIp = 'unknown-ip' }) => {
    if (!username || !password) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Username and password are required'
      ));
    }

    const { username: configuredUsername, passwordHash } = adminCredentialsProvider();
    const normalizedInputUsername = String(username).trim();
    const normalizedConfiguredUsername = String(configuredUsername).trim();
    const identityKey = `${normalizedInputUsername.toLowerCase()}|${String(sourceIp || 'unknown-ip').trim()}`;

    const lockState = await lockoutPolicy?.check?.(identityKey);
    if (lockState?.locked) {
      return fail(new DomainError(
        DomainErrorCode.AUTHENTICATION_FAILED,
        'Too many failed login attempts. Try again later.',
        {
          statusCode: 429,
          details: {
            retry_after_ms: lockState.retryAfterMs
          }
        }
      ));
    }

    const usernameMatches = normalizedInputUsername === normalizedConfiguredUsername;
    const passwordMatches = await bcrypt.compare(String(password), passwordHash);

    if (!usernameMatches || !passwordMatches) {
      await lockoutPolicy?.registerFailure?.(identityKey);
      return fail(new DomainError(
        DomainErrorCode.AUTHENTICATION_FAILED,
        'Invalid credentials'
      ));
    }

    await lockoutPolicy?.clear?.(identityKey);

    try {
      const token = jwt.sign(
        {
          username: normalizedConfiguredUsername,
          role: 'admin',
          type: 'admin'
        },
        jwtSecretProvider(),
        { expiresIn: '8h' }
      );

      return ok({
        token,
        admin: { username: normalizedConfiguredUsername }
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
