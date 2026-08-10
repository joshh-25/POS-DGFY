import { jest } from '@jest/globals';
import { validateUpdateSettings } from '../src/validators/settingsValidator.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('settings validator order-method fees', () => {
  it('accepts valid pos_order_method_fees payload', () => {
    const req = {
      body: {
        pos_order_method_fees: {
          delivery: { enabled: true, amount: 50, label: 'Delivery Fee' },
          dine_in: { enabled: false, amount: 0, label: 'Dine In Fee' }
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.pos_order_method_fees.delivery.amount).toBe(50);
  });

  it('rejects unsupported order method key', () => {
    const req = {
      body: {
        pos_order_method_fees: {
          dine_in: { enabled: false, amount: 0, label: 'Dine In Fee' },
          curbside: { enabled: true, amount: 25, label: 'Curbside Fee' }
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects negative order method fee amount', () => {
    const req = {
      body: {
        pos_order_method_fees: {
          delivery: { enabled: true, amount: -5, label: 'Delivery Fee' }
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalled();
  });
});

