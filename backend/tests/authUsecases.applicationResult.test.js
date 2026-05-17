import { jest } from '@jest/globals';
import {
  buildLoginUseCase,
  buildLookupEmailUseCase,
  buildValidateInviteTokenUseCase,
  buildAcceptInvitationUseCase,
  buildBlacklistTokenUseCase
} from '../src/modules/auth/usecases/authUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('auth use-cases application result contract', () => {
  it('login use-case validates required credentials', async () => {
    const useCase = buildLoginUseCase({
      authService: { loginUser: jest.fn() }
    });

    const result = await useCase({ email: '', password: '' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('login use-case maps auth service 401 errors to AUTHENTICATION_FAILED', async () => {
    const loginError = new Error('Invalid email or password');
    loginError.statusCode = 401;

    const useCase = buildLoginUseCase({
      authService: { loginUser: jest.fn().mockRejectedValue(loginError) }
    });

    const result = await useCase({ email: 'a@b.com', password: 'bad-pass' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    expect(result.error.statusCode).toBe(401);
  });

  it('lookupEmail use-case wraps landlord result in success envelope', async () => {
    const useCase = buildLookupEmailUseCase({
      landlordService: {
        findTenantsByEmail: jest.fn().mockResolvedValue([{ id: 1, name: 'Tenant A' }])
      }
    });

    const result = await useCase({ email: 'test@example.com' });
    expect(result).toEqual({
      success: true,
      data: [{ id: 1, name: 'Tenant A' }],
      error: null,
      message: null
    });
  });

  it('validateInviteToken maps invite token message-based validation failures to 400', async () => {
    const useCase = buildValidateInviteTokenUseCase({
      userService: {
        validateInvitationToken: jest.fn().mockRejectedValue(new Error('Invitation token expired'))
      }
    });

    const result = await useCase({ token: 'abc' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('blacklistToken use-case returns success envelope with blacklisted state', async () => {
    const useCase = buildBlacklistTokenUseCase({
      authService: { blacklistToken: jest.fn().mockResolvedValue(true) }
    });

    const result = await useCase({ token: 'jwt-token' });
    expect(result).toEqual({
      success: true,
      data: { blacklisted: true },
      error: null,
      message: null
    });
  });

  it('acceptInvitation delegates missing OTP to the service so rollback can disable enforcement', async () => {
    const acceptInvitation = jest.fn().mockResolvedValue({ user_id: 2 });
    const useCase = buildAcceptInvitationUseCase({
      userService: { acceptInvitation }
    });

    const result = await useCase({
      token: 'invite-token',
      username: 'teammate',
      password: 'StrongPass1!',
      phoneNumber: '+63 912 345 6789'
    });

    expect(result.success).toBe(true);
    expect(acceptInvitation).toHaveBeenCalledWith('invite-token', {
      username: 'teammate',
      password: 'StrongPass1!',
      phone_number: '+63 912 345 6789',
      email_otp_code: undefined
    });
  });
});
