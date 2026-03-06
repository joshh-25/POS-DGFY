import { jest } from '@jest/globals';

const mockGetCompanyInfoUseCase = jest.fn();
const mockGetStore = jest.fn();

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
  getAllSettingsUseCase: jest.fn(),
  getSettingByKeyUseCase: jest.fn(),
  updateSettingsUseCase: jest.fn(),
  updateSettingByKeyUseCase: jest.fn(),
  resetSettingsToDefaultUseCase: jest.fn(),
  getCompanyInfoUseCase: mockGetCompanyInfoUseCase
}));

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: {
    getStore: mockGetStore
  }
}));

let getCompanyInfo;

beforeAll(async () => {
  const mod = await import('../src/modules/settings/controllers/settingsHandlers.js');
  getCompanyInfo = mod.getCompanyInfo;
});

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('settingsHandlers.getCompanyInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 success payload for valid tenant context', async () => {
    mockGetStore.mockReturnValue({ tenantId: 123 });
    mockGetCompanyInfoUseCase.mockResolvedValue({
      success: true,
      data: {
        company_name: 'Acme',
        company_token: 'token-123',
        registration_link: 'http://localhost:5173/register?token=token-123'
      }
    });

    const res = createRes();
    const next = jest.fn();
    await getCompanyInfo({}, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        company_name: 'Acme'
      }),
      message: 'Company information retrieved successfully',
      timestamp: expect.any(String)
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns mapped error payload when use-case fails', async () => {
    mockGetStore.mockReturnValue({});
    mockGetCompanyInfoUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'TENANT_CONTEXT_MISSING',
        message: 'No tenant context found',
        details: null,
        statusCode: 400
      }
    });

    const res = createRes();
    const next = jest.fn();
    await getCompanyInfo({}, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      data: null,
      message: 'No tenant context found',
      error_code: 'TENANT_CONTEXT_MISSING',
      errors: null,
      timestamp: expect.any(String)
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

