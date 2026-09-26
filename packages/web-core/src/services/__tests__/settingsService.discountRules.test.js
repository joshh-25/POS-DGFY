import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiPatchMock = vi.fn();

vi.mock('../api.js', () => ({
  default: {
    get: apiGetMock,
    post: apiPostMock,
    patch: apiPatchMock
  }
}));

vi.mock('../browserSession.js', () => ({
  getCompanyToken: () => 'tenant-a'
}));

describe('settingsService discount rule API', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiPatchMock.mockReset();
  });

  it('lists all discount rules without using the generic settings cache', async () => {
    const rules = [{ discount_rule_id: 12, name: 'PWD', percentage: 15 }];
    apiGetMock.mockResolvedValue({ data: { data: { discount_rules: rules } } });

    const { getDiscountRules } = await import('../settingsService.js');

    await expect(getDiscountRules()).resolves.toEqual(rules);
    expect(apiGetMock).toHaveBeenCalledWith('/settings/discount-rules');
  });

  it('creates and updates rules through the configuration endpoints', async () => {
    const created = { discount_rule_id: 13, name: 'Employee', percentage: 12 };
    const updated = { ...created, percentage: 10, configuration_version: 2 };
    apiPostMock.mockResolvedValue({ data: { data: { discount_rule: created } } });
    apiPatchMock.mockResolvedValue({ data: { data: { discount_rule: updated } } });

    const { createDiscountRule, updateDiscountRule } = await import('../settingsService.js');
    const createPayload = {
      name: 'Employee',
      percentage: 12,
      description: null,
      is_enabled: false,
      is_approved: false
    };
    const updatePayload = {
      name: 'Employee',
      percentage: 10,
      expected_configuration_version: 1
    };

    await expect(createDiscountRule(createPayload)).resolves.toEqual(created);
    await expect(updateDiscountRule(13, updatePayload)).resolves.toEqual(updated);
    expect(apiPostMock).toHaveBeenCalledWith('/settings/discount-rules', createPayload);
    expect(apiPatchMock).toHaveBeenCalledWith('/settings/discount-rules/13', updatePayload);
  });
});
