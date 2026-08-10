import { jest } from '@jest/globals';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const createResponse = () => {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
};

const promoWithDateRange = {
  active: true,
  promo_code: 'SAVE20',
  discount_percent: 20,
  valid_from: '2026-07-11',
  valid_time_start: '14:30',
  valid_until: '2026-07-12',
  valid_time_end: '18:00'
};

describe('settings validator storefront promo date persistence', () => {
  it('retains promo dates during a bulk storefront settings update', () => {
    const req = { body: { storefront_promos: [promoWithDateRange] } };
    const res = createResponse();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.storefront_promos[0]).toEqual(expect.objectContaining({
      valid_from: '2026-07-11',
      valid_until: '2026-07-12',
      valid_time_start: '14:30',
      valid_time_end: '18:00'
    }));
  });

  it('retains promo dates during a single-setting update', () => {
    const req = { params: { key: 'storefront_promos' }, body: { value: [promoWithDateRange] } };
    const res = createResponse();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.value[0]).toEqual(expect.objectContaining({
      valid_from: '2026-07-11',
      valid_until: '2026-07-12'
    }));
  });

  it('rejects incomplete or inverted promo date ranges', () => {
    const incompleteReq = {
      body: { storefront_promos: [{ ...promoWithDateRange, valid_until: '' }] }
    };
    const incompleteRes = createResponse();
    const incompleteNext = jest.fn();

    validateUpdateSettings(incompleteReq, incompleteRes, incompleteNext);

    expect(incompleteNext).not.toHaveBeenCalled();
    expect(incompleteRes.status).toHaveBeenCalledWith(422);

    const invertedReq = {
      body: { storefront_promos: [{ ...promoWithDateRange, valid_from: '2026-07-13' }] }
    };
    const invertedRes = createResponse();
    const invertedNext = jest.fn();

    validateUpdateSettings(invertedReq, invertedRes, invertedNext);

    expect(invertedNext).not.toHaveBeenCalled();
    expect(invertedRes.status).toHaveBeenCalledWith(422);
  });
});
