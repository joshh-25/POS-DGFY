import { jest } from '@jest/globals';
import { validateStoreQuote } from '../src/validators/storeValidator.js';

describe('Storefront F&B modifier transport contract', () => {
  it('preserves and validates modifier quantity before stripUnknown processing', () => {
    const req = {
      body: {
        lines: [{
          item_id: 20,
          quantity: 1,
          line_modifiers: [{
            modifier_group_id: 5,
            modifier_option_id: 8,
            quantity: 3
          }]
        }]
      }
    };
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    validateStoreQuote(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedData.lines[0].line_modifiers[0].quantity).toBe(3);
  });

  it('rejects modifier quantities outside the bounded integer contract', () => {
    const req = {
      body: {
        lines: [{
          item_id: 20,
          quantity: 1,
          line_modifiers: [{ modifier_group_id: 5, modifier_option_id: 8, quantity: 0 }]
        }]
      }
    };
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    validateStoreQuote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });
});
