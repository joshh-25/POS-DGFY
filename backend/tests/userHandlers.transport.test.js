import { jest } from '@jest/globals';

const mockGetCurrentUserUseCase = jest.fn();
const mockInviteUserUseCase = jest.fn();
const mockChangePasswordUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/users/index.js', () => ({
  getCurrentUserUseCase: mockGetCurrentUserUseCase,
  updateProfileUseCase: jest.fn(),
  changePasswordUseCase: mockChangePasswordUseCase,
  getAllUsersUseCase: jest.fn(),
  updateUserRoleUseCase: jest.fn(),
  updateUserStatusUseCase: jest.fn(),
  updateUserPermissionsUseCase: jest.fn(),
  inviteUserUseCase: mockInviteUserUseCase,
  removeUserFromCompanyUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getCurrentUser;
let inviteUser;
let changePassword;

beforeAll(async () => {
  const mod = await import('../src/modules/users/controllers/userHandlers.js');
  getCurrentUser = mod.getCurrentUser;
  inviteUser = mod.inviteUser;
  changePassword = mod.changePassword;
});

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('userHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getCurrentUser appends tenant company details to success payload', async () => {
    mockGetCurrentUserUseCase.mockResolvedValue({
      success: true,
      data: {
        user_id: 1,
        username: 'alice',
        email: 'alice@example.com',
        role: 'admin'
      }
    });

    const req = {
      user: { user_id: 1 },
      tenant: {
        id: 77,
        name: 'Tenant Alpha',
        plan: 'premium',
        subscription_status: 'active',
        current_period_end: '2026-04-01'
      },
      requestId: 'req-user-1'
    };
    const res = createRes();
    const next = jest.fn();

    await getCurrentUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'User profile retrieved successfully',
      data: expect.objectContaining({
        user_id: 1,
        company: {
          id: 77,
          name: 'Tenant Alpha',
          plan: 'premium',
          subscription_status: 'active',
          current_period_end: '2026-04-01'
        }
      }),
      timestamp: expect.any(String)
    }));
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'user_profile_viewed',
      surface: 'users',
      action: 'view_current_user'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('inviteUser preserves status 201 and success payload shape', async () => {
    mockInviteUserUseCase.mockResolvedValue({
      success: true,
      data: { user_id: 15, email: 'new@example.com', role: 'staff' }
    });

    const req = {
      user: { user_id: 9 },
      validatedData: { email: 'new@example.com', role: 'staff' },
      requestId: 'req-user-201'
    };
    const res = createRes();
    const next = jest.fn();

    await inviteUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user_id: 15, email: 'new@example.com', role: 'staff' },
      message: 'User invitation created successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'user_invitation_created',
      surface: 'users',
      action: 'invite_user'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('changePassword returns standardized error payload for failed results', async () => {
    mockChangePasswordUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'Current password is incorrect',
        details: null,
        statusCode: 401
      }
    });

    const req = {
      user: { user_id: 9 },
      validatedData: { currentPassword: 'bad', newPassword: 'newPass123' },
      requestId: 'req-user-401'
    };
    const res = createRes();
    const next = jest.fn();

    await changePassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Current password is incorrect',
      error_code: 'AUTHENTICATION_FAILED',
      errors: null,
      request_id: 'req-user-401',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'user_password_changed',
      surface: 'users',
      action: 'change_password'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
