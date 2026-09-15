import { jest } from '@jest/globals';

const systemSetting = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  create: jest.fn()
};
const dbStore = {
  get: jest.fn(() => systemSetting),
  getStore: jest.fn(() => ({}))
};

jest.unstable_mockModule('../src/models/index.js', () => ({
  StorefrontDiscoveryIndex: {},
  StorefrontHandleReservation: {}
}));
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: dbStore }));

const { settingsRepository } = await import('../src/modules/settings/repositories/settingsRepository.js');

const CURRENT_VERSION = '2026-09-15T01:00:00.000Z';

const makeSetting = (updatedAt = CURRENT_VERSION) => ({
  setting_id: 7,
  setting_key: 'storefront_tagline',
  setting_value: 'Old value',
  data_type: 'string',
  description: 'Tagline',
  updated_at: updatedAt
});

describe('settingsRepository optimistic concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a stale bulk write before any setting update runs', async () => {
    systemSetting.findAll.mockResolvedValue([makeSetting()]);

    await expect(settingsRepository.updateSettings(
      { storefront_tagline: 'New value' },
      { expectedUpdatedAt: { storefront_tagline: '2026-09-15T00:00:00.000Z' } }
    )).rejects.toMatchObject({
      statusCode: 409,
      details: expect.objectContaining({
        reason_code: 'SETTINGS_VERSION_CONFLICT',
        setting_key: 'storefront_tagline'
      })
    });

    expect(systemSetting.update).not.toHaveBeenCalled();
  });

  it('uses a compare-and-set update and returns the refreshed row', async () => {
    const current = makeSetting();
    const refreshed = {
      ...current,
      setting_value: 'New value',
      updated_at: '2026-09-15T01:01:00.000Z'
    };
    systemSetting.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(refreshed);
    systemSetting.update.mockResolvedValue([1]);

    const result = await settingsRepository.updateSettingByKey(
      'storefront_tagline',
      'New value',
      { expectedUpdatedAt: CURRENT_VERSION }
    );

    expect(systemSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({ setting_value: 'New value' }),
      expect.objectContaining({
        where: expect.objectContaining({
          setting_id: 7,
          updated_at: CURRENT_VERSION
        })
      })
    );
    expect(result).toEqual(expect.objectContaining({
      setting_key: 'storefront_tagline',
      value: 'New value',
      updated_at: '2026-09-15T01:01:00.000Z'
    }));
  });
});
