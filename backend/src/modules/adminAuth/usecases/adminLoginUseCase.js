import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { getAdminCredentials } from '../../../config/adminAuthConfig.js';

export const buildAdminLoginUseCase = ({
  jwtSecretProvider,
  adminCredentialsProvider = getAdminCredentials,
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
    const configuredPasswordMatches = usernameMatches
      ? await bcrypt.compare(String(password), passwordHash)
      : false;
    let platformUser = null;
    if (platformAdminRepository) {
      // Never reconcile the bootstrap identity from an unauthenticated request.
      // A changed environment hash is applied only after the caller proves they
      // know the configured bootstrap password.
      platformUser = usernameMatches && configuredPasswordMatches
        ? await platformAdminRepository.ensureBootstrapMaster({ username: normalizedConfiguredUsername, passwordHash })
        : (!usernameMatches ? await platformAdminRepository.findActiveByUsername(normalizedInputUsername) : null);
    }
    // Always compare a bcrypt hash, including unknown users, to avoid an observable
    // user-existence timing oracle. The configured master hash is safe as a fallback.
    const passwordMatches = usernameMatches
      ? configuredPasswordMatches
      : await bcrypt.compare(String(password), platformUser?.password_hash || passwordHash);

    if ((!platformAdminRepository && !usernameMatches) || !passwordMatches || (platformAdminRepository && !platformUser)) {
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
        username: normalizedConfiguredUsername, role: 'admin', type: 'admin'
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
          ? platformAdminRepository.publicUser(platformUser, permissions)
          : { username: normalizedConfiguredUsername }
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
