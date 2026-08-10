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
  lockoutPolicy = null,
  platformAdminRepository = null
}) => {
  return async ({ username, password, sourceIp = 'unknown-ip', userAgent = '' }) => {
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
    const bootstrapAccount = configuredAccounts[0];
    const normalizedInputUsername = String(username).trim();
    const configuredAccount = configuredAccounts.find(
      (account) => account.username.toLowerCase() === normalizedInputUsername.toLowerCase()
    );
    const normalizedBootstrapUsername = String(bootstrapAccount?.username || '').trim();
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

    const bootstrapUsernameMatches = normalizedInputUsername.toLowerCase() === normalizedBootstrapUsername.toLowerCase();
    const configuredPasswordMatches = configuredAccount
      ? await bcrypt.compare(String(password), configuredAccount.passwordHash)
      : false;
    let platformUser = null;
    if (platformAdminRepository) {
      // Never reconcile the bootstrap identity from an unauthenticated request.
      // A changed environment hash is applied only after the caller proves they
      // know the configured bootstrap password.
      platformUser = bootstrapUsernameMatches
        ? (configuredPasswordMatches
          ? await platformAdminRepository.ensureBootstrapMaster({
            username: normalizedBootstrapUsername,
            passwordHash: bootstrapAccount.passwordHash
          })
          : null)
        : await platformAdminRepository.findActiveByUsername(normalizedInputUsername);
    }
    // Always compare a bcrypt hash, including unknown users, to avoid an observable
    // user-existence timing oracle. The configured master hash is safe as a fallback.
    const passwordMatches = !platformAdminRepository
      ? configuredPasswordMatches
      : bootstrapUsernameMatches
        ? configuredPasswordMatches
        : await bcrypt.compare(
          String(password),
          platformUser?.password_hash || bootstrapAccount?.passwordHash
        );

    if (
      (!platformAdminRepository && !configuredAccount)
      || !passwordMatches
      || (platformAdminRepository && !platformUser)
    ) {
      await lockoutPolicy?.registerFailure?.(identityKey);
      return fail(new DomainError(
        DomainErrorCode.AUTHENTICATION_FAILED,
        'Invalid credentials'
      ));
    }

    await lockoutPolicy?.clear?.(identityKey);

    try {
      const session = platformAdminRepository
        ? await platformAdminRepository.createSession({ user: platformUser, sourceIp, userAgent })
        : null;
      const token = jwt.sign(platformAdminRepository ? {
        admin_id: platformUser.id,
        session_id: session.id,
        auth_version: platformUser.auth_version,
        type: 'platform_admin'
      } : {
        username: configuredAccount.username,
        role: 'admin',
        type: 'admin',
        financial_role: configuredAccount.financialRole
      },
        jwtSecretProvider(),
        { expiresIn: '8h' }
      );

      const permissions = platformAdminRepository && !platformUser.is_master
        ? await platformAdminRepository.listPermissionKeys(platformUser.id)
        : [];
      return ok({
        token,
        admin: platformAdminRepository
          ? {
            ...platformAdminRepository.publicUser(platformUser, permissions),
            financial_role: configuredAccount?.financialRole
              || (platformUser.is_master
                ? ADMIN_FINANCIAL_ROLES.PLATFORM_ADMIN
                : ADMIN_FINANCIAL_ROLES.FINANCE_VIEWER)
          }
          : {
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
