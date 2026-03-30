import { jest } from '@jest/globals';
import { validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('settings validator single-setting payload', () => {
  it('accepts array value payload (for json settings like pos_discount_profiles)', () => {
    const req = {
      body: {
        value: [
          { name: 'Employee Discount', percentage: 20, active: true }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(Array.isArray(req.validatedData.value)).toBe(true);
  });

  it('rejects missing value payload', () => {
    const req = { body: {} };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects unsupported method keys when updating pos_order_method_fees via single-setting route', () => {
    const req = {
      params: { key: 'pos_order_method_fees' },
      body: {
        value: {
          dine_in: { enabled: true, amount: 0, label: 'Dine In Fee' },
          express_delivery: { enabled: true, amount: 50, label: 'Express Fee' }
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });
});
