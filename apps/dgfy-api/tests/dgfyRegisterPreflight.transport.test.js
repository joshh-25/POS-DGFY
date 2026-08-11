import { jest } from '@jest/globals';

const mockPreflightDgfyAccountRegistrationUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
  acceptDgfyInvitationUseCase: jest.fn(),
  changeDgfyPasswordUseCase: jest.fn(),
  configureDgfyCompanyDayClosePinUseCase: jest.fn(),
  completeDgfyPasswordResetUseCase: jest.fn(),
  createDgfyHandoffUseCase: jest.fn(),
  createDgfyInvitationUseCase: jest.fn(),
  exchangeDgfyHandoffUseCase: jest.fn(),
  getDgfyLegalTermsUseCase: jest.fn(),
  leaveDgfyCompanyUseCase: jest.fn(),
  listDgfyAccountCompaniesUseCase: jest.fn(),
  preflightDgfyAccountRegistrationUseCase: mockPreflightDgfyAccountRegistrationUseCase,
  registerDgfyAccountUseCase: jest.fn(),
  loginDgfyAccountUseCase: jest.fn(),
  getDgfyMeUseCase: jest.fn(),
  rejectDgfyInvitationUseCase: jest.fn(),
  recordDgfyCompanySwitchOutcomeUseCase: jest.fn(),
  requestDgfyBusinessStepUpUseCase: jest.fn(),
  requestDgfyPasswordResetUseCase: jest.fn(),
  requestDgfyEmailVerificationUseCase: jest.fn(),
  searchDgfyBusinessAccountsUseCase: jest.fn(),
  startDgfyPosSessionUseCase: jest.fn(),
  startDgfyTenantSessionUseCase: jest.fn(),
  switchDgfyCompanyUseCase: jest.fn(),
  transferDgfyCompanyOwnershipUseCase: jest.fn(),
  updateDgfyProfileUseCase: jest.fn(),
  verifyDgfyEmailUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/authService.js', () => ({
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
  verifyToken: jest.fn()
}));

let preflightDgfyAccountRegistration;

beforeAll(async () => {
  ({ preflightDgfyAccountRegistration } = await import('../src/modules/dgfy/controllers/dgfyAuthHandlers.js'));
});

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('DGFY register preflight transport contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns available credentials with HTTP 200', async () => {
    mockPreflightDgfyAccountRegistrationUseCase.mockResolvedValue({
      success: true,
      data: {
        payload: {
          success: true,
          data: { available: true },
          message: 'DGFY registration credentials are available.'
        }
      }
    });
    const req = { body: { email: 'ada@example.test', phone: '+639123456789' } };
    const res = createRes();

    await preflightDgfyAccountRegistration(req, res);

    expect(mockPreflightDgfyAccountRegistrationUseCase).toHaveBeenCalledWith({ body: req.body });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { available: true },
      message: 'DGFY registration credentials are available.'
    });
  });

  it('returns field details for duplicate credentials with HTTP 409', async () => {
    mockPreflightDgfyAccountRegistrationUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'CONFLICT',
        statusCode: 409,
        message: 'A DGFY account already exists with this email.',
        details: {
          error_code: 'DGFY_ACCOUNT_ALREADY_EXISTS',
          field: 'email'
        }
      }
    });
    const req = { body: { email: 'ada@example.test', phone: '+639123456789' } };
    const res = createRes();

    await preflightDgfyAccountRegistration(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'A DGFY account already exists with this email.',
      error_code: 'DGFY_ACCOUNT_ALREADY_EXISTS',
      details: {
        error_code: 'DGFY_ACCOUNT_ALREADY_EXISTS',
        field: 'email'
      }
    });
  });
});
