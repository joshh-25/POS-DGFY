import { jest } from '@jest/globals';

const mockGetAllSettingsUseCase = jest.fn();
const mockGetSettingByKeyUseCase = jest.fn();
const mockUpdateSettingsUseCase = jest.fn();
const mockUpdateSettingByKeyUseCase = jest.fn();
const mockResetSettingsToDefaultUseCase = jest.fn();
const mockGetCompanyInfoUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
  getAllSettingsUseCase: mockGetAllSettingsUseCase,
  getSettingByKeyUseCase: mockGetSettingByKeyUseCase,
  updateSettingsUseCase: mockUpdateSettingsUseCase,
  updateSettingByKeyUseCase: mockUpdateSettingByKeyUseCase,
  resetSettingsToDefaultUseCase: mockResetSettingsToDefaultUseCase,
  getCompanyInfoUseCase: mockGetCompanyInfoUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: {
    getStore: jest.fn()
  }
}));

let getAllSettings;
let getSettingByKey;

beforeAll(async () => {
  const mod = await import('../src/modules/settings/controllers/settingsHandlers.js');
  getAllSettings = mod.getAllSettings;
  getSettingByKey = mod.getSettingByKey;
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

describe('settingsHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getAllSettings returns expected success payload', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue({
      success: true,
      data: { timezone: { value: 'Asia/Manila' } }
    });

    const req = { requestId: 'req-1', user: { user_id: 1, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getAllSettings(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { timezone: { value: 'Asia/Manila' } },
      message: 'Settings retrieved successfully',
      timestamp: expect.any(String)
    }));
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'settings_viewed',
      surface: 'settings',
      action: 'view_all_settings'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('getSettingByKey returns error payload with request_id', async () => {
    mockGetSettingByKeyUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: "Setting 'timezone' not found",
        details: null,
        statusCode: 404
      }
    });

    const req = { params: { key: 'timezone' }, requestId: 'req-404', user: { user_id: 1, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getSettingByKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      data: null,
      message: "Setting 'timezone' not found",
      error_code: 'RESOURCE_NOT_FOUND',
      errors: null,
      request_id: 'req-404',
      timestamp: expect.any(String)
    }));
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'setting_viewed',
      surface: 'settings',
      action: 'view_setting'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
