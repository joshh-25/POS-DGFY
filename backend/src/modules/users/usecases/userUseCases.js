import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapUserUseCaseError } from './userUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

export const buildGetCurrentUserUseCase = ({ userService }) => {
  return async ({ userId }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.getCurrentUser(normalizedUserId);
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to retrieve current user'));
    }
  };
};

export const buildUpdateProfileUseCase = ({ userService }) => {
  return async ({ userId, updateData }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!updateData || typeof updateData !== 'object') {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'updateData must be an object',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.updateUserProfile(normalizedUserId, updateData);
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to update profile'));
    }
  };
};

export const buildChangePasswordUseCase = ({ userService }) => {
  return async ({ userId, currentPassword, newPassword }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (!currentPassword || !newPassword) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'currentPassword and newPassword are required',
        { statusCode: 400 }
      ));
    }

    try {
      await userService.changePassword(normalizedUserId, currentPassword, newPassword);
      return ok(null);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to change password'));
    }
  };
};

export const buildGetAllUsersUseCase = ({ userService }) => {
  return async ({ includeInvitations = false } = {}) => {
    try {
      const data = await userService.getAllUsers({ includeInvitations });
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to retrieve users'));
    }
  };
};

export const buildGetRoleCatalogUseCase = ({ userService }) => {
  return async () => {
    try {
      const data = await userService.getRoleCatalog();
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to retrieve role catalog'));
    }
  };
};

export const buildUpdateUserRoleUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId, roleData }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and targetUserId must be positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.updateUserRole(normalizedAdminUserId, normalizedTargetUserId, roleData);
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to update user role'));
    }
  };
};

export const buildUpdateUserStatusUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId, isActive }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId || typeof isActive !== 'boolean') {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId/targetUserId must be positive integers and isActive must be boolean',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.toggleUserStatus(normalizedAdminUserId, normalizedTargetUserId, isActive);
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to update user status'));
    }
  };
};

export const buildUpdateUserPermissionsUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId, permissions, isMasterAdmin }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and targetUserId must be positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.updateUserPermissions(
        normalizedAdminUserId,
        normalizedTargetUserId,
        permissions,
        isMasterAdmin
      );
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to update user permissions'));
    }
  };
};

export const buildGetUserLocationGrantsUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId, includeInactive = false }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and targetUserId must be positive integers',
        { statusCode: 400 }
      ));
    }

    if (typeof includeInactive !== 'boolean') {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'includeInactive must be a boolean',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.getUserLocationGrants(
        normalizedAdminUserId,
        normalizedTargetUserId,
        { includeInactiveLocations: includeInactive }
      );
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to retrieve user location grants'));
    }
  };
};

export const buildUpdateUserLocationGrantsUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId, locationIds }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and targetUserId must be positive integers',
        { statusCode: 400 }
      ));
    }

    if (!Array.isArray(locationIds)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'locationIds must be an array',
        { statusCode: 400 }
      ));
    }

    const normalizedLocationIds = locationIds.map((id) => parsePositiveInt(id));
    if (normalizedLocationIds.some((id) => !id)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'locationIds must only include positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.updateUserLocationGrants(
        normalizedAdminUserId,
        normalizedTargetUserId,
        normalizedLocationIds
      );
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to update user location grants'));
    }
  };
};

export const buildInviteUserUseCase = ({ userService }) => {
  return async ({ adminUserId, email, role, rolePresetKey = null, locationIds = [], deliveryMode = 'email' }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    if (!normalizedAdminUserId || !email) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and email are required',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.createUserInvitation(normalizedAdminUserId, {
        email,
        role,
        role_preset_key: rolePresetKey,
        location_ids: locationIds,
        delivery_mode: deliveryMode
      });
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to create user invitation'));
    }
  };
};

export const buildResendUserInvitationUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and targetUserId must be positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.resendUserInvitation(normalizedAdminUserId, normalizedTargetUserId);
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to resend user invitation'));
    }
  };
};

export const buildCreateInvitationManualLinkUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and targetUserId must be positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.createInvitationManualLink(normalizedAdminUserId, normalizedTargetUserId);
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to create invitation link'));
    }
  };
};

export const buildCancelUserInvitationUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and targetUserId must be positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.cancelUserInvitation(normalizedAdminUserId, normalizedTargetUserId);
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to cancel user invitation'));
    }
  };
};

export const buildRemoveUserFromCompanyUseCase = ({ userService }) => {
  return async ({ adminUserId, targetUserId }) => {
    const normalizedAdminUserId = parsePositiveInt(adminUserId);
    const normalizedTargetUserId = parsePositiveInt(targetUserId);
    if (!normalizedAdminUserId || !normalizedTargetUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'adminUserId and targetUserId must be positive integers',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await userService.removeUserFromCompany(normalizedAdminUserId, normalizedTargetUserId);
      return ok(data);
    } catch (error) {
      return fail(mapUserUseCaseError(error, 'Failed to remove user from company'));
    }
  };
};
