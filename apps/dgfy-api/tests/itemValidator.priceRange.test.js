import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  validateCreateItem,
  validateCreateItemDraft,
  validateUpdateItem
} from '../src/validators/itemValidator.js';

const MAX_ITEM_PRICE = 999999.9999;

const buildCreateItemBody = (overrides = {}) => ({
  sku_code: 'PRICE-BOUNDARY-1',
  name: 'Boundary Item',
  category: 'supplies',
  max_capacity: 1,
  unit_of_measure: 'each',
  ...overrides
});

const validatorCases = [
  {
    name: 'create',
    validate: validateCreateItem,
    buildBody: (overrides) => buildCreateItemBody(overrides)
  },
  {
    name: 'draft create',
    validate: validateCreateItemDraft,
    buildBody: (overrides) => ({ name: 'Boundary Item', ...overrides })
  },
  {
    name: 'update',
    validate: validateUpdateItem,
    buildBody: (overrides) => overrides
  }
];

const runValidator = (validate, body) => {
  const req = { body };
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  const next = jest.fn();

  validate(req, res, next);

  return { req, res, next };
};

describe('item price storage range validation', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts the inclusive DECIMAL(10,4) ceiling for item create, draft, and update', () => {
    for (const { validate, buildBody } of validatorCases) {
      const { req, next } = runValidator(validate, buildBody({
        cost_per_unit: MAX_ITEM_PRICE,
        default_sale_price: MAX_ITEM_PRICE
      }));

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.validatedData.cost_per_unit).toBe(MAX_ITEM_PRICE);
      expect(req.validatedData.default_sale_price).toBe(MAX_ITEM_PRICE);
    }
  });

  it('rejects values above the ceiling for both persisted item price fields in all write schemas', () => {
    for (const { validate, buildBody } of validatorCases) {
      for (const [field, value, messageLabel] of [
        ['default_sale_price', 1000000, 'Selling price'],
        ['cost_per_unit', 1000000, 'Cost per unit']
      ]) {
        const { res, next } = runValidator(validate, buildBody({ [field]: value }));

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        const payload = res.json.mock.calls[0][0];
        expect(payload.message).toBe('Validation failed');
        expect(payload.errors).toEqual(expect.arrayContaining([
          expect.objectContaining({
            field,
            message: expect.stringContaining(`${messageLabel} must not exceed ₱999,999.9999`)
          })
        ]));
      }
    }
  });

  it('rejects a sale price that rounds above the four-decimal ceiling', () => {
    const { res, next } = runValidator(validateUpdateItem, {
      default_sale_price: 999999.99995
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'default_sale_price',
        message: expect.stringContaining('999,999.9999')
      })
    ]));
  });

  it('preserves the existing null and empty-string allowances', () => {
    const createResult = runValidator(validateCreateItem, buildCreateItemBody({
      cost_per_unit: null,
      default_sale_price: null
    }));
    expect(createResult.next).toHaveBeenCalledTimes(1);

    const draftResult = runValidator(validateCreateItemDraft, {
      name: 'Draft Item',
      cost_per_unit: '',
      default_sale_price: ''
    });
    expect(draftResult.next).toHaveBeenCalledTimes(1);

    const updateResult = runValidator(validateUpdateItem, {
      cost_per_unit: null,
      default_sale_price: null
    });
    expect(updateResult.next).toHaveBeenCalledTimes(1);
  });
});
