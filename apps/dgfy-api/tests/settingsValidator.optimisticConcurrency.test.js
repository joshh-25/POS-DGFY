import { jest } from '@jest/globals';
import {
  validateUpdateSettings,
  validateUpdateSingleSetting
} from '../src/validators/settingsValidator.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('settings optimistic-concurrency validation', () => {
  it('accepts a bulk version map alongside real setting fields', () => {
    const req = {
      body: {
        storefront_tagline: 'Fresh daily',
        expected_updated_at: {
          storefront_tagline: '2026-09-15T00:00:00.000Z'
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedData).toEqual(expect.objectContaining({
      storefront_tagline: 'Fresh daily',
      expected_updated_at: {
        storefront_tagline: '2026-09-15T00:00:00.000Z'
      }
    }));
  });

  it('rejects a version map without a setting update', () => {
    const req = {
      body: {
        expected_updated_at: {
          storefront_tagline: '2026-09-15T00:00:00.000Z'
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('accepts a single-setting version precondition without changing the value contract', () => {
    const req = {
      params: { key: 'storefront_tagline' },
      body: {
        value: 'Fresh daily',
        expected_updated_at: '2026-09-15T00:00:00.000Z'
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedData).toEqual({
      value: 'Fresh daily',
      expected_updated_at: '2026-09-15T00:00:00.000Z'
    });
  });
});
