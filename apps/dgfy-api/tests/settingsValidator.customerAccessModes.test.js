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
      inventory_low_stock_display_threshold: 4,
      pos_best_seller_settings: {
        enabled: true,
        lookback_days: 30,
        top_limit: 3,
        daily_top_enabled: false
      }
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

  it('accepts bulk storefront gallery updates with backend-relative upload urls', () => {
    const req = {
      body: {
        storefront_gallery_images: [
          { url: '/uploads/storefront-assets/t1/gallery-1.png', caption: 'Hero image' }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.storefront_gallery_images[0].url).toBe('/uploads/storefront-assets/t1/gallery-1.png');
  });

  it('accepts bulk storefront review summary updates with null star placeholders', () => {
    const req = {
      body: {
        storefront_review_summary: {
          score: null,
          total_count: null,
          star_distribution: {
            1: null,
            2: null,
            3: null,
            4: null,
            5: null
          }
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.storefront_review_summary.star_distribution[1]).toBeNull();
  });

  it('drops blank bulk storefront gallery placeholder rows before validation', () => {
    const req = {
      body: {
        storefront_gallery_images: [
          { url: '', path: '', caption: '', alt: '' },
          { url: '/uploads/storefront-assets/t1/gallery-1.png', caption: 'Hero image' }
        ]
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.storefront_gallery_images).toEqual([
      { url: '/uploads/storefront-assets/t1/gallery-1.png', path: '', caption: 'Hero image' }
    ]);
  });

  // #622
  it('accepts the guest checkout toggle in the bulk schema', () => {
    const req = { body: { storefront_guest_checkout_enabled: false } };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.storefront_guest_checkout_enabled).toBe(false);
  });

  it('accepts the guest checkout toggle in the single-setting schema', () => {
    const req = {
      params: { key: 'storefront_guest_checkout_enabled' },
      body: { value: false }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSingleSetting(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedData.value).toBe(false);
  });

  it('normalizes string null review summary placeholders before bulk validation', () => {
    const req = {
      body: {
        storefront_review_summary: {
          score: 'null',
          total_count: '',
          star_distribution: {
            1: 'null',
            2: '',
            3: null
          }
        }
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateUpdateSettings(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.storefront_review_summary).toEqual({
      score: null,
      total_count: null,
      star_distribution: {
        1: null,
        2: null,
        3: null,
        4: null,
        5: null
      }
    });
  });
});
