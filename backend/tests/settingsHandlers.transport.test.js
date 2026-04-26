import { jest } from '@jest/globals';

const mockGetAllSettingsUseCase = jest.fn();
const mockGetSettingByKeyUseCase = jest.fn();
const mockUpdateSettingsUseCase = jest.fn();
const mockUpdateSettingByKeyUseCase = jest.fn();
const mockResetSettingsToDefaultUseCase = jest.fn();
const mockGetCompanyInfoUseCase = jest.fn();
const mockUploadStorefrontAssetUseCase = jest.fn();
const mockDeleteStorefrontAssetUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
  getAllSettingsUseCase: mockGetAllSettingsUseCase,
  getSettingByKeyUseCase: mockGetSettingByKeyUseCase,
  updateSettingsUseCase: mockUpdateSettingsUseCase,
  updateSettingByKeyUseCase: mockUpdateSettingByKeyUseCase,
  resetSettingsToDefaultUseCase: mockResetSettingsToDefaultUseCase,
  getCompanyInfoUseCase: mockGetCompanyInfoUseCase,
  uploadStorefrontAssetUseCase: mockUploadStorefrontAssetUseCase,
  deleteStorefrontAssetUseCase: mockDeleteStorefrontAssetUseCase
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
let uploadStorefrontAsset;
let deleteStorefrontAsset;

beforeAll(async () => {
  const mod = await import('../src/modules/settings/controllers/settingsHandlers.js');
  getAllSettings = mod.getAllSettings;
  getSettingByKey = mod.getSettingByKey;
  uploadStorefrontAsset = mod.uploadStorefrontAsset;
  deleteStorefrontAsset = mod.deleteStorefrontAsset;
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

  it('uploadStorefrontAsset returns success payload', async () => {
    mockUploadStorefrontAssetUseCase.mockResolvedValue({
      success: true,
      data: {
        asset_type: 'cover',
        image_url: '/uploads/storefront-assets/tenant-a/cover-1.png'
      }
    });
    const req = {
      params: { asset_type: 'cover' },
      file: { originalname: 'cover.png', mimetype: 'image/png', path: 'uploads/temp/cover.png' },
      requestId: 'req-upload',
      headers: { 'x-company-token': 'token-a' },
      tenant: null
    };
    const res = createRes();
    const next = jest.fn();

    await uploadStorefrontAsset(req, res, next);

    expect(mockUploadStorefrontAssetUseCase).toHaveBeenCalledWith(expect.objectContaining({
      assetType: 'cover'
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Storefront asset uploaded successfully',
      data: expect.objectContaining({
        asset_type: 'cover'
      })
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('deleteStorefrontAsset returns validation failure payload', async () => {
    mockDeleteStorefrontAssetUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'asset_type must be one of: cover, profile',
        details: null,
        statusCode: 422
      }
    });
    const req = { params: { asset_type: 'invalid' }, requestId: 'req-delete', tenant: null };
    const res = createRes();
    const next = jest.fn();

    await deleteStorefrontAsset(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'asset_type must be one of: cover, profile',
      error_code: 'VALIDATION_FAILED'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
