import { jest } from '@jest/globals';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('settings validator customer access modes', () => {
  it('accepts customer access and inventory display settings', () => {
    const req = {
      body: {
        customer_access_mode: 'inquiry',
        inventory_display_mode: 'low_stock',
        inventory_low_stock_display_threshold: 4
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData).toEqual({
      customer_access_mode: 'inquiry',
      inventory_display_mode: 'low_stock',
      inventory_low_stock_display_threshold: 4
    });
  });

  it('rejects unsupported customer access modes', () => {
    const req = {
      body: {
        customer_access_mode: 'open_to_everything'
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('validates single setting updates for inventory threshold', () => {
    const req = {
      params: { key: 'inventory_low_stock_display_threshold' },
      body: { value: 6 }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedData.value).toBe(6);
  });
});
