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

const makeTaxSetting = (categories, version = 7) => ({
  setting_id: 8,
  setting_key: 'pos_tax_policies',
  setting_value: JSON.stringify({ version, categories }),
  data_type: 'json',
  description: 'POS tax treatment policy',
  updated_at: CURRENT_VERSION,
  update: jest.fn().mockResolvedValue(undefined)
});

const standardTaxCategories = {
  senior: { vat_treatment: 'vat_exempt' },
  pwd: { vat_treatment: 'vat_exempt' },
  manual: { vat_treatment: 'standard' },
  employee: { vat_treatment: 'standard' },
  promo: { vat_treatment: 'standard' },
  voucher: { vat_treatment: 'standard' }
};
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

  it('owns POS tax-policy versions on write and preserves the version for a no-op update', async () => {
    const current = makeTaxSetting(standardTaxCategories, 7);
    systemSetting.findOne.mockResolvedValue(current);

    const noOp = await settingsRepository.updateSettingByKey('pos_tax_policies', {
      version: 999,
      categories: standardTaxCategories
    });

    expect(noOp.value.version).toBe(7);
    expect(current.update).toHaveBeenCalledWith(expect.objectContaining({
      data_type: 'json',
      setting_value: JSON.stringify({ version: 7, categories: standardTaxCategories })
    }));

    current.update.mockClear();
    const changedCategories = {
      ...standardTaxCategories,
      employee: { vat_treatment: 'vat_exempt' }
    };
    const changed = await settingsRepository.updateSettingByKey('pos_tax_policies', {
      version: 123,
      categories: changedCategories
    });

    expect(changed.value.version).toBe(8);
    expect(current.update).toHaveBeenCalledWith(expect.objectContaining({
      setting_value: JSON.stringify({ version: 8, categories: changedCategories })
    }));
  });
});
