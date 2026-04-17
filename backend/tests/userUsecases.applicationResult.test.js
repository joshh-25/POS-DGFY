import { jest } from '@jest/globals';
import {
  buildGetCurrentUserUseCase,
  buildUpdateProfileUseCase,
  buildChangePasswordUseCase,
  buildInviteUserUseCase,
  buildGetUserLocationGrantsUseCase,
  buildUpdateUserLocationGrantsUseCase
} from '../src/modules/users/usecases/userUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('user use-cases application result contract', () => {
  it('getCurrentUser validates userId', async () => {
    const useCase = buildGetCurrentUserUseCase({
      userService: { getCurrentUser: jest.fn() }
    });

    const result = await useCase({ userId: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('updateProfile maps 409 conflicts from user service', async () => {
    const conflictError = new Error('Email already in use by another user');
    conflictError.statusCode = 409;

    const useCase = buildUpdateProfileUseCase({
      userService: { updateUserProfile: jest.fn().mockRejectedValue(conflictError) }
    });

    const result = await useCase({ userId: 1, updateData: { email: 'taken@example.com' } });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    expect(result.error.statusCode).toBe(409);
  });

  it('changePassword maps incorrect-password failures to AUTHENTICATION_FAILED', async () => {
    const authError = new Error('Current password is incorrect');
    authError.statusCode = 401;

    const useCase = buildChangePasswordUseCase({
      userService: { changePassword: jest.fn().mockRejectedValue(authError) }
    });

    const result = await useCase({
      userId: 2,
      currentPassword: 'wrong',
      newPassword: 'newPass123'
    });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    expect(result.error.statusCode).toBe(401);
  });

  it('inviteUser wraps service result in success envelope', async () => {
    const createUserInvitation = jest.fn().mockResolvedValue({ user_id: 11, email: 'new@example.com' });
    const useCase = buildInviteUserUseCase({
      userService: { createUserInvitation }
    });

    const result = await useCase({ adminUserId: 7, email: 'new@example.com', role: 'staff' });
    expect(createUserInvitation).toHaveBeenCalledWith(7, { email: 'new@example.com', role: 'staff' });
    expect(result).toEqual({
      success: true,
      data: { user_id: 11, email: 'new@example.com' },
      error: null,
      message: null
    });
  });

  it('getUserLocationGrants validates includeInactive boolean', async () => {
    const useCase = buildGetUserLocationGrantsUseCase({
      userService: { getUserLocationGrants: jest.fn() }
    });

    const result = await useCase({ adminUserId: 7, targetUserId: 11, includeInactive: 'yes' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('updateUserLocationGrants forwards normalized ids', async () => {
    const updateUserLocationGrants = jest.fn().mockResolvedValue({
      user_id: 11,
      granted_location_ids: [1, 3]
    });
    const useCase = buildUpdateUserLocationGrantsUseCase({
      userService: { updateUserLocationGrants }
    });

    const result = await useCase({
      adminUserId: '7',
      targetUserId: '11',
      locationIds: ['1', 3]
    });

    expect(result.success).toBe(true);
    expect(updateUserLocationGrants).toHaveBeenCalledWith(7, 11, [1, 3]);
  });
});
