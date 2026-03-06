import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapAuthUseCaseError } from './authUseCaseError.js';

export const buildRegisterUseCase = ({ authService }) => {
  return async ({ userData }) => {
    if (!userData || typeof userData !== 'object') {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'User data is required'
      ));
    }

    try {
      const user = await authService.registerUser(userData);
      return ok(user);
    } catch (error) {
      return fail(mapAuthUseCaseError(error, 'Failed to register user'));
    }
  };
};

export const buildLoginUseCase = ({ authService }) => {
  return async ({ email, password }) => {
    if (!email || !password) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Email and password are required'
      ));
    }

    try {
      const session = await authService.loginUser(email, password);
      return ok(session);
    } catch (error) {
      return fail(mapAuthUseCaseError(error, 'Login failed'));
    }
  };
};

export const buildRefreshTokenUseCase = ({ authService }) => {
  return async ({ refreshToken }) => {
    if (!refreshToken) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Refresh token is required'
      ));
    }

    try {
      const refreshedSession = await authService.refreshUserToken(refreshToken);
      return ok(refreshedSession);
    } catch (error) {
      return fail(mapAuthUseCaseError(error, 'Token refresh failed'));
    }
  };
};

export const buildBlacklistTokenUseCase = ({ authService }) => {
  return async ({ token }) => {
    if (!token) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Token is required'
      ));
    }

    try {
      const blacklisted = await authService.blacklistToken(token);
      return ok({ blacklisted });
    } catch (error) {
      return fail(mapAuthUseCaseError(error, 'Logout failed'));
    }
  };
};

export const buildLookupEmailUseCase = ({ landlordService }) => {
  return async ({ email }) => {
    if (!email) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Email is required'
      ));
    }

    try {
      const tenants = await landlordService.findTenantsByEmail(email);
      return ok(tenants);
    } catch (error) {
      return fail(mapAuthUseCaseError(error, 'Email lookup failed'));
    }
  };
};

export const buildValidateCompanyTokenUseCase = ({ landlordService }) => {
  return async ({ token }) => {
    if (!token) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Token is required'
      ));
    }

    try {
      const tenant = await landlordService.findTenantByToken(token);
      return ok(tenant);
    } catch (error) {
      return fail(mapAuthUseCaseError(error, 'Company token validation failed'));
    }
  };
};

export const buildValidateInviteTokenUseCase = ({ userService }) => {
  return async ({ token }) => {
    if (!token) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Token is required'
      ));
    }

    try {
      const invite = await userService.validateInvitationToken(token);
      return ok(invite);
    } catch (error) {
      return fail(mapAuthUseCaseError(error, 'Invitation token validation failed'));
    }
  };
};

export const buildAcceptInvitationUseCase = ({ userService }) => {
  return async ({ token, username, password }) => {
    if (!token || !username || !password) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Token, username, and password are required'
      ));
    }

    try {
      const user = await userService.acceptInvitation(token, { username, password });
      return ok(user);
    } catch (error) {
      return fail(mapAuthUseCaseError(error, 'Invitation acceptance failed'));
    }
  };
};
