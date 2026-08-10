import { jest } from '@jest/globals';
import {
  buildGetCurrentUserUseCase,
  buildUpdateProfileUseCase,
  buildChangePasswordUseCase,
  buildInviteUserUseCase,
  buildGetUserLocationGrantsUseCase,
  buildUpdateUserLocationGrantsUseCase,
  buildUpdatePosApprovalPinUseCase
} from '../src/modules/users/usecases/userUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('user use-cases application result contract', () => {
  it('updates an individual POS approval PIN through the user service boundary', async () => {
    const updatePosApprovalPin = jest.fn().mockResolvedValue({
      user_id: 8,
      pos_approval_pin_configured: true
    });
    const useCase = buildUpdatePosApprovalPinUseCase({ userService: { updatePosApprovalPin } });

    const result = await useCase({ adminUserId: 1, targetUserId: 8, pin: '2468', clear: false });

    expect(result.success).toBe(true);
    expect(updatePosApprovalPin).toHaveBeenCalledWith(1, 8, { pin: '2468', clear: false });
  });
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

  it('updateProfile maps missing-phone validation failures from user service', async () => {
    const validationError = new Error('Phone number is required');
    validationError.statusCode = 422;

    const useCase = buildUpdateProfileUseCase({
      userService: { updateUserProfile: jest.fn().mockRejectedValue(validationError) }
    });

    const result = await useCase({ userId: 1, updateData: { phone_number: '' } });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(422);
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
    expect(createUserInvitation).toHaveBeenCalledWith(7, {
      email: 'new@example.com',
      role: 'staff',
      role_preset_key: null,
      location_ids: [],
      delivery_mode: 'email'
    });
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
