import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  ADMIN_FINANCIAL_ROLES,
  getAdminAccounts
} from '../../../config/adminAuthConfig.js';

export const buildAdminLoginUseCase = ({
  jwtSecretProvider,
  adminCredentialsProvider = getAdminAccounts,
  lockoutPolicy = null
}) => {
  return async ({ username, password, sourceIp = 'unknown-ip' }) => {
    if (!username || !password) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Username and password are required'
      ));
    }

    const configuredValue = adminCredentialsProvider();
    const configuredAccounts = (Array.isArray(configuredValue) ? configuredValue : [configuredValue])
      .map((account) => ({
        username: String(account?.username || '').trim(),
        passwordHash: String(account?.passwordHash || account?.password_hash || '').trim(),
        financialRole: String(
          account?.financialRole
          || account?.financial_role
          || ADMIN_FINANCIAL_ROLES.PLATFORM_ADMIN
        ).trim().toLowerCase()
      }))
      .filter((account) => account.username && account.passwordHash);
    const normalizedInputUsername = String(username).trim();
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

    const configuredAccount = configuredAccounts.find(
      (account) => account.username.toLowerCase() === normalizedInputUsername.toLowerCase()
    );
    const comparisonHash = configuredAccount?.passwordHash || configuredAccounts[0]?.passwordHash;
    const passwordMatches = comparisonHash
      ? await bcrypt.compare(String(password), comparisonHash)
      : false;

    if (!configuredAccount || !passwordMatches) {
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
          username: configuredAccount.username,
          role: 'admin',
          type: 'admin',
          financial_role: configuredAccount.financialRole
        },
        jwtSecretProvider(),
        { expiresIn: '8h' }
      );

      return ok({
        token,
        admin: {
          username: configuredAccount.username,
          financial_role: configuredAccount.financialRole
        }
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
